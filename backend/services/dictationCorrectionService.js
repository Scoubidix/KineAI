// Passe de correction de la dictée : le modèle propose des opérations (remplacer un terme, supprimer
// une hésitation ou un fragment auto-corrigé), le serveur les applique sous gardes déterministes.
// Le texte n'est jamais réécrit librement : chaque remplacement ajoute au plus un mot par rapport à
// « from », les suppressions sont plafonnées à 20 % du texte ; tout doute → texte brut.
const { z } = require('zod');
const logger = require('../utils/logger');
const { logMasked } = require('../utils/pseudonymDebug');
const llmService = require('./llmService');
const { numbersIn } = require('./bilanComposeService');
const { parseJsonOutput } = require('./bilanExtractionService');
const { EXTRA_TERMS } = require('../data/dictationExtraTerms');

const MODES = ['dictation', 'session'];
const FILLERS = ['euh', 'hum', 'bah', 'ben', 'hein', 'voilà', 'donc voilà'];
// Marqueurs d'auto-correction : le spec définit le fragment supprimable comme celui que le locuteur
// corrige lui-même juste après (« à droite, non pardon, » puis « à gauche ») ; sans l'un de ces mots
// dans le fragment ou juste après, on ne supprime rien (côté sûr).
const SELF_CORRECTION_MARKERS = ['non', 'pardon', 'plutôt', 'enfin', 'excuse', 'excusez', 'reprends', 'rectifie', 'correction'];
// Mots-nombres français : jamais supprimés ni remplacés (même liste que le bench du worker)
const NUMBER_WORDS = new Set(['zéro', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'vingts', 'trente', 'quarante', 'cinquante', 'soixante',
  'cent', 'cents', 'mille']);
const WORDS_PER_OP = 15;
const MIN_OPS_ALLOWED = 3;
const MAX_DELETED_RATIO = 0.2;
const MAX_TO_WORDS = 4;
const MAX_OPS = 60;
const MAX_MOTIF_WORDS = 4;
const MAX_MOTIF_CHARS = 80;
const PUNCT = /[.,;:!?()«»"]/g;
// Ponctuation tolérée collée à la fin d'un mot (fermante uniquement)
const PUNCT_TAIL = '[.,;:!?)»"]*';
const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿŒœ';
// Frontière de mot élargie à l'apostrophe et au tiret : « l'épaule », « Kenneth-Jones » comptent pour un seul mot
const WORD_CHARS = `${LETTERS}'’-`;

const normSpaces = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const tokens = (s) => normSpaces(s).replace(PUNCT, ' ').split(' ').filter(Boolean);
const hasDigit = (s) => /\d/.test(s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pliage caractère par caractère (accents retirés, minuscules) qui conserve la longueur :
// on cherche dans le texte plié, on découpe le texte d'origine aux mêmes index.
function fold(s) {
  return Array.from(s, (c) => { const f = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return f.length === 1 ? f : c; }).join('');
}
// Comparaisons pliées une fois au chargement : FILLERS/NUMBER_WORDS restent exportés accentués (lisibles),
// mais `from` est toujours comparé sous sa forme pliée, donc l'autre côté de la comparaison doit l'être aussi.
const FILLERS_FOLDED = new Set(FILLERS.map(fold));
const NUMBER_WORDS_FOLDED = new Set([...NUMBER_WORDS].map(fold));
const SELF_CORRECTION_MARKERS_FOLDED = new Set(SELF_CORRECTION_MARKERS.map(fold));
const hasNumberWord = (s) => tokens(fold(s)).some((w) => w.split('-').some((p) => NUMBER_WORDS_FOLDED.has(p)));
const hasSelfCorrectionMarker = (s) => tokens(fold(s)).some((w) => SELF_CORRECTION_MARKERS_FOLDED.has(w));

// Motif d'un groupe de mots de contexte (before/after) : chaque mot entier, ponctuation collée tolérée, espaces souples
const group = (s) => tokens(fold(s)).map((w) => `${escapeRe(w)}${PUNCT_TAIL}`).join('\\s+');

/**
 * Localise « before from after » en mots entiers (recherche insensible casse/accents).
 * Le groupe 1 capturé est composé des seuls mots de `from` (ponctuation interne tolérée entre les
 * mots, jamais après le dernier) ; le groupe 2 capture la ponctuation collée juste après ce dernier
 * mot, hors capture, pour que `replace` ne touche jamais cette ponctuation alors que `delete` peut
 * l'emporter avec les mots.
 * @returns {[number, number, number]|null} [début des mots, fin des mots, fin de la ponctuation collée]
 */
function locate(text, before, from, after) {
  const folded = fold(text);
  const fromWords = tokens(fold(from));
  const fCore = fromWords.map((w, i) => (i < fromWords.length - 1 ? `${escapeRe(w)}${PUNCT_TAIL}` : escapeRe(w))).join('\\s+');
  const b = group(before); const a = group(after);
  const pattern = `(?<![${WORD_CHARS}])${b ? `${b}\\s+` : ''}(${fCore})(${PUNCT_TAIL})${a ? `\\s+${a}` : ''}(?![${WORD_CHARS}])`;
  const matches = [...folded.matchAll(new RegExp(pattern, 'gd'))];
  if (matches.length !== 1) return null;
  const [wordsStart, wordsEnd] = matches[0].indices[1];
  const [, tailEnd] = matches[0].indices[2];
  return [wordsStart, wordsEnd, tailEnd];
}

const cleanup = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

/** Vrai si tout nombre en chiffres du texte corrigé existe dans le texte brut. */
function numbersGuard(raw, corrected) {
  const allowed = new Set(numbersIn(raw));
  return numbersIn(corrected).every((n) => allowed.has(n));
}

/**
 * Applique les opérations sous gardes. Pur.
 * @returns {{ text: string, applied: number, ignored: number }}
 */
function applyOps(text, ops, mode) {
  const raw = String(text ?? '');
  const wordCount = tokens(raw).length;
  const giveUp = (why, ignoredCount) => { logger.warn(`Correction dictée abandonnée : ${why} (${ops.length} opération(s), ${wordCount} mots)`); return { text: raw, applied: 0, ignored: ignoredCount ?? ops.length }; };
  // Le modèle recopie parfois le texte en opérations strictement identiques (from === to, mot pour mot) :
  // elles ne changent rien, on les écarte avant le plafond — sans plier accents/casse, pour garder appliable
  // une vraie correction d'accent ou de casse sur un terme (ex. « lasegue » → « Lasègue »).
  const isIdentity = (op) => op.op === 'replace' && normSpaces(op.from) === normSpaces(op.to);
  let identityIgnored = 0;
  const realOps = [];
  for (const op of ops) { if (isIdentity(op)) identityIgnored += 1; else realOps.push(op); }
  if (realOps.length > Math.max(MIN_OPS_ALLOWED, Math.floor(wordCount / WORDS_PER_OP))) return giveUp('plafond d’opérations', ops.length);

  let current = raw;
  let applied = 0; let ignored = identityIgnored; let deletedWords = 0;
  for (const op of realOps) {
    // Un jeton de pseudonymisation ([Libellé] ou [Libellé n]) ne figure jamais dans une vraie transcription :
    // toute opération qui en touche un (dans from/to/before/after) est un artefact du modèle, jamais appliquée.
    if (/[[\]]/.test(`${op.from}${op.to}${op.before}${op.after}`)) { ignored += 1; continue; }
    const from = normSpaces(op.from); const to = normSpaces(op.to);
    const before = normSpaces(op.before); const after = normSpaces(op.after);
    const fromTokens = tokens(from);
    let ok = (op.op === 'replace' || op.op === 'delete') && fromTokens.length > 0 && !hasDigit(from) && !hasNumberWord(from);
    // Ajout borné à un mot de plus que « from » (en plus du plafond absolu MAX_TO_WORDS) : un remplacement
    // ne peut pas servir à insérer une phrase entière.
    if (ok && op.op === 'replace') ok = to.length > 0 && !hasDigit(to) && tokens(to).length <= MAX_TO_WORDS && tokens(to).length <= fromTokens.length + 1;
    if (ok && op.op === 'delete') {
      const isFiller = FILLERS_FOLDED.has(normSpaces(fold(from).replace(PUNCT, ' ')));
      const isSelfCorrection = mode === 'dictation' && fromTokens.length >= 2 && (hasSelfCorrectionMarker(from) || hasSelfCorrectionMarker(after));
      ok = isFiller || isSelfCorrection;
    }
    const pos = ok ? locate(current, before, from, after) : null;
    if (!pos) { ignored += 1; continue; }
    const [start, wordsEnd, tailEnd] = pos;
    // replace ne touche que les mots (group 1) ; delete emporte aussi la ponctuation collée qui suivait
    const end = op.op === 'delete' ? tailEnd : wordsEnd;
    current = cleanup(current.slice(0, start) + (op.op === 'replace' ? to : '') + current.slice(end));
    if (op.op === 'delete') deletedWords += fromTokens.length;
    applied += 1;
  }
  // Un seul « from » sans plafond de longueur peut à lui seul dépasser le ratio : la garde s'applique dès une suppression.
  if (wordCount > 0 && deletedWords / wordCount > MAX_DELETED_RATIO) return giveUp('trop de suppressions');
  if (!numbersGuard(raw, current)) return giveUp('nombre nouveau');
  return { text: current, applied, ignored };
}

const SYSTEM_PROMPT = `Tu relis la transcription automatique d'une dictée de kinésithérapeute (bilan de patient), en français, pour y repérer les rares termes mal transcrits et les hésitations.
Tu ne réécris jamais le texte : tu renvoies uniquement un objet JSON { "motif": "…", "ops": [...] } — le motif de consultation, puis les corrections à appliquer.
« motif » : le motif de consultation en 4 mots maximum, tiré du texte (ex. « Lombalgie chronique », « Suites de PTG », « Entorse cheville droite »). Pas de phrase, pas de verbe conjugué, jamais le nom ni le prénom du patient. Si le texte ne permet pas de le déterminer, renvoie "".
Une dictée correcte a besoin de 0 à 5 opérations ; s'il n'y a rien à corriger, renvoie { "ops": [] }.
Chaque opération :
- { "op": "replace", "before": "…", "from": "…", "after": "…", "to": "…" } : remplacer « from » (le terme mal transcrit, tel qu'écrit) par « to » (le terme correct, du vocabulaire fourni ou un terme médical évident). « to » doit être différent de « from » : ne liste jamais un mot déjà correct.
- { "op": "delete", "before": "…", "from": "…", "after": "…", "to": "" } : supprimer « from ».
« before » : le ou les deux mots qui précèdent immédiatement « from » dans le texte ; « after » : le ou les deux mots qui le suivent immédiatement (vide en début ou fin de texte). Ils servent à retrouver l'endroit exact. Si le fragment apparaît plusieurs fois dans le texte, choisis le contexte qui le distingue.
Exemple — texte : « Test de lâchement négatif. Chobet à 13 centimètres, euh, Lasègue négatif. » → { "motif": "Bilan genou", "ops": [ { "op": "replace", "before": "Test de", "from": "lâchement", "after": "négatif.", "to": "Lachman" }, { "op": "replace", "before": "", "from": "Chobet", "after": "à 13", "to": "Schober" }, { "op": "delete", "before": "centimètres,", "from": "euh,", "after": "Lasègue", "to": "" } ] }
Autorisé : corriger un terme médical, un test, un muscle, une technique, un sigle ou un nom propre mal transcrit ; supprimer une hésitation isolée (« euh », « hum », « bah », « ben », « hein », « voilà »).
En mode dictée seulement : supprimer un fragment que le locuteur corrige lui-même juste après (« à droite, non pardon, » quand il dit ensuite « à gauche »).
Interdit : reformuler, ajouter un mot, corriger la grammaire ou la ponctuation, modifier ou supprimer un nombre (en chiffres ou en lettres), une unité, une date. En cas de doute, ne rien faire.`;

const CORRECTION_JSON_SCHEMA = {
  name: 'dictation_correction',
  schema: {
    type: 'object', additionalProperties: false, required: ['ops', 'motif'],
    properties: {
      motif: { type: 'string' },
      ops: { type: 'array', maxItems: MAX_OPS, items: {
        type: 'object', additionalProperties: false, required: ['op', 'before', 'from', 'after', 'to'],
        properties: { op: { type: 'string', enum: ['replace', 'delete'] }, before: { type: 'string' }, from: { type: 'string' }, after: { type: 'string' }, to: { type: 'string' } },
      } },
    },
  },
};

/**
 * Assainit le motif proposé par le modèle : 4 mots maximum, espaces normalisés, ponctuation
 * finale retirée. Un jeton de pseudonymisation ([Libellé] ou [Libellé n]) ne peut pas figurer
 * dans un motif : sa présence signe un artefact du modèle, on rejette tout.
 * @returns {string} le motif, ou '' s'il est inexploitable
 */
function sanitizeMotif(raw) {
  const s = normSpaces(raw);
  if (!s || /[[\]]/.test(s)) return '';
  const words = s.split(' ').slice(0, MAX_MOTIF_WORDS).join(' ');
  return words.replace(/[.,;:!?]+$/, '').trim().slice(0, MAX_MOTIF_CHARS);
}

const correctionSchema = z.object({
  ops: z.array(z.object({
    op: z.enum(['replace', 'delete']), before: z.string().default(''), from: z.string(), after: z.string().default(''), to: z.string().default(''),
  })).max(MAX_OPS),
  motif: z.string().default(''),
});

function parseCorrection(content) {
  const result = correctionSchema.safeParse(parseJsonOutput(content));
  if (!result.success) throw new Error(`sortie de correction invalide : ${result.error.issues[0]?.message}`);
  return { ops: result.data.ops, motif: sanitizeMotif(result.data.motif) };
}

/** Libellés et alias des champs actifs, plus les termes hors catalogue, dédoublonnés. */
function buildVocabulary(catalog) {
  const seen = new Set(); const out = [];
  const add = (t) => { const s = normSpaces(t); if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  for (const f of catalog) if (f.isActive !== false) { add(f.label); for (const a of Array.isArray(f.aliases) ? f.aliases : []) add(a); }
  for (const t of EXTRA_TERMS) add(t);
  return out;
}

function buildCorrectionMessages({ text, mode, vocabulary }) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Mode : ${mode === 'session' ? 'séance (dialogue kiné-patient : ne supprimer que les hésitations)' : 'dictée'}\n\nVocabulaire : ${vocabulary.join(' ; ')}\n\nTexte :\n"""\n${text}\n"""` },
  ];
}

const safeErrorLabel = (err) => (err instanceof SyntaxError ? 'JSON invalide' : err.message);

/**
 * Corrige un texte transcrit. Ne lève jamais pour un échec du modèle : renvoie le texte brut.
 * Le motif suit la même règle de dégradation : chaîne vide en cas de doute, jamais d'échec.
 * @returns {Promise<{ text: string, applied: number, ignored: number, motif: string }>}
 */
async function correct({ text, mode, catalog, pseudo }) {
  const raw = String(text ?? '').trim();
  if (!raw) return { text: '', applied: 0, ignored: 0 };
  // Le modèle ne reçoit jamais l'identité en clair : masquée avant l'envoi, réhydratée sur le texte rendu
  const masked = pseudo ? pseudo.mask(raw) : raw;
  logMasked(`correction (${mode})`, masked, pseudo);
  const messages = buildCorrectionMessages({ text: masked, mode, vocabulary: buildVocabulary(catalog) });
  let parsed;
  for (let attempt = 1; attempt <= 2 && !parsed; attempt += 1) {
    try {
      const { content, usage } = await llmService.chatCompletion({ iaType: 'bilan_dictation_correct', messages, jsonSchema: CORRECTION_JSON_SCHEMA });
      if (usage) logger.info(`Correction dictée : ${usage.prompt_tokens} jeton(s) d'entrée, ${usage.completion_tokens} de sortie`);
      parsed = parseCorrection(content);
    } catch (err) {
      logger.warn(`Correction dictée : essai ${attempt} en échec (${safeErrorLabel(err)})`);
    }
  }
  if (!parsed) return { text: raw, applied: 0, ignored: 0, motif: '' };
  const r = applyOps(masked, parsed.ops, mode);
  const tokenCount = pseudo ? Object.values(pseudo.stats()).reduce((a, b) => a + b, 0) : 0;
  // Jamais le motif dans les logs : c'est du contenu clinique
  logger.info(`Correction dictée (${mode}) : ${r.applied} appliquée(s), ${r.ignored} ignorée(s), ${tokenCount} jeton(s), motif ${parsed.motif ? 'déduit' : 'absent'}`);
  // Le motif vient du texte masqué : il doit être réhydraté comme le texte, puis réassaini
  // (la réhydratation rallonge le libellé en rendant les vrais mots).
  const motif = parsed.motif ? sanitizeMotif(pseudo ? pseudo.unmaskDeep(parsed.motif) : parsed.motif) : '';
  // Le texte corrigé rejoint les notes du kiné (pas un document rendu) : réhydratation verbatim, telle que saisie
  return { ...r, motif, text: pseudo ? pseudo.unmaskDeep(r.text) : r.text };
}

module.exports = {
  MODES, applyOps, numbersGuard,
  buildVocabulary, buildCorrectionMessages, parseCorrection, sanitizeMotif, MAX_MOTIF_WORDS, correct, CORRECTION_JSON_SCHEMA,
};
