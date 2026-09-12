// Compte rendu clinique de séance (plan 8b) : le dialogue kiné-patient transcrit et corrigé devient des
// notes en sept sections, sous gardes déterministes (aucun nombre absent du dialogue, taille bornée).
// Le dialogue n'est jamais journalisé.
const { z } = require('zod');
const logger = require('../utils/logger');
const llmService = require('./llmService');
const { SECTION_KEYS, SECTION_TITLES } = require('./bilanDocument');
const { SECTION_GUIDE, numbersIn } = require('./bilanComposeService');
const { buildVocabulary } = require('./dictationCorrectionService');
const { parseJsonOutput } = require('./bilanExtractionService');
const { DraftError } = require('./bilanDraftService');
const { BILAN_TYPE_LABELS } = require('./bilanRenderer/format');
const { wordsToDigits, wordValues, ordinalValues } = require('../utils/frenchNumbers');

const SECTION_MAX_CHARS = 3000;
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `Tu rédiges le compte rendu clinique d'une séance de kinésithérapie à partir de la transcription d'un dialogue entre le kinésithérapeute et son patient, en français. La transcription est sans indication de locuteur : tu déduis qui parle du contenu (le kiné examine, mesure, explique et prescrit ; le patient décrit, répond, raconte).
Tu renvoies uniquement un objet JSON { "sections": { "anamnese": "...", "antecedents": "...", "examen": "...", "limitations": "...", "diagnostic": "...", "objectifs": "...", "traitement": "..." } }, exactement ces sept clés, chaque valeur une chaîne.
Règles :
- Notes cliniques concises, au présent, sans phrases de politesse ; les listes et fragments sont acceptés.
- Tu ne rapportes que ce qui a été dit. Jamais d'invention, jamais de déduction clinique qui ne vienne pas du kiné.
- Les nombres sont recopiés tels que dits, convertis en chiffres, avec leur unité et leur côté (droite/gauche). Jamais un nombre qui n'est pas dans le dialogue. Une valeur corrigée par le locuteur juste après : garder la valeur finale.
- Ne calcule jamais une date, une durée ou un délai à partir d'autres nombres du dialogue, et ne déduis jamais un délai d'un protocole habituel : si l'ancienneté ou la date d'un événement n'est pas dite, ne l'écris pas.
- Les tests et mesures sont nommés avec leur nom exact (le vocabulaire fourni fait foi pour l'orthographe).
- Une section dont la séance n'a pas parlé reste vide ("").
- Ignore le hors-sujet (vie privée, organisation, stationnement) sauf s'il éclaire la plainte ou les objectifs.
- Le diagnostic n'est rempli que si le kiné l'a formulé ; les objectifs sont ceux du patient et du kiné tels qu'énoncés ; le traitement reprend le plan, les consignes et les exercices donnés.
Sections :
${SECTION_KEYS.map((k) => `- ${k} : ${SECTION_TITLES[k]} — ${SECTION_GUIDE[k]}`).join('\n')}
Ici l'entrée est un dialogue, non des notes : « les notes » désigne ce qui a été dit. Contrairement au guide, la section examen porte les valeurs chiffrées énoncées (EVA, amplitudes, cotations, temps), avec unité et côté.`;

const REPORT_JSON_SCHEMA = {
  name: 'session_report',
  schema: {
    type: 'object', additionalProperties: false, required: ['sections'],
    properties: { sections: { type: 'object', additionalProperties: false, required: [...SECTION_KEYS], properties: Object.fromEntries(SECTION_KEYS.map((k) => [k, { type: 'string' }])) } },
  },
};

const reportSchema = z.object({ sections: z.object(Object.fromEntries(SECTION_KEYS.map((k) => [k, z.string()]))).strict() }).strict();

function buildReportMessages({ transcript, motif, type, vocabulary }) {
  const typeLabel = (BILAN_TYPE_LABELS[type] || String(type || 'initial')).toLowerCase();
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Motif : ${motif || 'non précisé'}\nType de bilan : ${typeLabel}\n\nVocabulaire : ${vocabulary.join(' ; ')}\n\nDialogue :\n"""\n${transcript}\n"""` },
  ];
}

// Ne normalise que l'espacement horizontal : les sauts de ligne sont conservés (une liste à puces
// reste une liste), seules les lignes blanches en rafale sont réduites à une seule.
function normalizeSectionText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
  const collapsed = [];
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(line);
  }
  return collapsed.join('\n').trim();
}

function parseReport(content) {
  const result = reportSchema.safeParse(parseJsonOutput(content));
  if (!result.success) throw new Error(`compte rendu invalide : ${result.error.issues[0]?.message}`);
  const sections = {};
  for (const k of SECTION_KEYS) sections[k] = normalizeSectionText(result.data.sections[k]);
  return sections;
}

/** Tronque à la dernière fin de phrase avant la borne ; sans fin de phrase, coupe au dernier espace. */
function truncateSection(text) {
  if (text.length <= SECTION_MAX_CHARS) return text;
  const head = text.slice(0, SECTION_MAX_CHARS);
  const cut = Math.max(head.lastIndexOf('.'), head.lastIndexOf(' ; '));
  return (cut > 0 ? head.slice(0, cut + 1) : head.slice(0, head.lastIndexOf(' '))).trim();
}

/**
 * Ensemble des nombres autorisés dans une section : union de tout ce qui peut légitimement provenir
 * du dialogue — chiffres déjà transcrits par l'ASR, conversion lettres → chiffres (composés),
 * valeur de chaque mot-nombre pris isolément (filet de sécurité si la composition échoue, ex. un
 * "A7" d'ASR qui casse un mot), valeur des ordinaux (« le quatrième mois » → « à 4 mois » dans le
 * compte rendu), et 1 pour « un »/« une ». La garde doit surtout ne jamais vider une section
 * légitime : une valeur inventée qui existe par ailleurs dans le dialogue est acceptée par
 * construction, quitte à être un peu permissive.
 */
function allowedNumbers(transcript) {
  const allowed = new Set([
    ...numbersIn(transcript),
    ...numbersIn(wordsToDigits(transcript)),
    ...wordValues(transcript).map(String),
    ...ordinalValues(transcript).map(String),
  ]);
  if (/\b(un|une)\b/i.test(transcript)) allowed.add('1');
  return allowed;
}

// Abréviations et unités après lesquelles un point ne termine pas une phrase (« 22 cm. », « Dr. »).
const NO_SPLIT_AFTER = new Set(['cm', 'mm', 's', 'sec', 'min', 'dr', 'm', 'mme', 'kg', 'n']);

/**
 * Découpe une ligne en unités de texte : phrases séparées par une ponctuation forte suivie d'un
 * blanc, ou par un « ; » entouré d'espaces. Ne coupe jamais un point entre deux chiffres (décimale)
 * ni après un jeton de deux lettres au plus ou une abréviation connue (unités, civilités). Le
 * terminateur reste avec son fragment.
 */
function splitUnits(line) {
  const out = [];
  const re = /([.!?…]+)(\s+)|(\s;\s)/g;
  let start = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m[3]) { out.push(line.slice(start, m.index)); start = m.index + m[0].length; continue; }
    const before = line.slice(0, m.index);
    const after = line.slice(m.index + m[0].length);
    if (/\d$/.test(before) && /^\d/.test(after)) continue;
    const lastWord = (before.match(/\p{L}+$/u) || [''])[0].toLowerCase();
    if (lastWord && (lastWord.length <= 2 || NO_SPLIT_AFTER.has(lastWord))) continue;
    out.push(line.slice(start, m.index + m[1].length));
    start = m.index + m[0].length;
  }
  out.push(line.slice(start));
  return out.map((u) => u.trim()).filter(Boolean);
}

/**
 * Retire d'une section les seules unités citant un nombre absent du dialogue. Amendement de la
 * spec §4.3 : le run de référence a montré des durées inventées dans 2 séances sur 5, et vider la
 * section entière perdait tout le reste (âge, EVA, amplitudes correctement rapportés). Une ligne
 * est une unité de premier niveau (un item de liste reste entier), puis chaque ligne est découpée
 * en phrases.
 */
function filterUnits(text, allowed, droppedSentences) {
  const lines = [];
  for (const line of text.split('\n')) {
    const units = splitUnits(line);
    if (units.length === 0) { lines.push(line); continue; }
    const kept = units.filter((u) => {
      if (numbersIn(u).every((n) => allowed.has(n))) return true;
      droppedSentences.push(u);
      return false;
    });
    if (kept.length > 0) lines.push(kept.join(' '));
  }
  return normalizeSectionText(lines.join('\n'));
}

/** Aucun nombre inventé : toute phrase citant un nombre absent du dialogue est retirée ; tailles bornées. */
function guardReport(transcript, sections) {
  const allowed = allowedNumbers(transcript);
  const out = {}; const dropped = []; const truncated = []; const droppedSentences = [];
  for (const k of SECTION_KEYS) {
    const original = sections[k] || '';
    let text = original ? filterUnits(original, allowed, droppedSentences) : '';
    if (original && !text) dropped.push(k);
    if (text.length > SECTION_MAX_CHARS) { truncated.push(k); text = truncateSection(text); }
    out[k] = text;
  }
  return { sections: out, dropped, truncated, sentencesDropped: droppedSentences.length, droppedSentences };
}

/** Notes : sections non vides, ordre du document, titres français. */
function formatReportNotes(sections) {
  return SECTION_KEYS.filter((k) => sections[k]).map((k) => `${SECTION_TITLES[k]} :\n${sections[k]}`).join('\n\n');
}

// Un JSON malformé ou une erreur du provider peut porter des données de santé dans son message
// (V8 recopie parfois un extrait du texte source) : jamais dans les logs, on ne garde qu'un label.
const safeErrorLabel = (err) => (err instanceof SyntaxError ? 'JSON invalide' : (err?.name || 'Error'));

/**
 * Compte rendu d'une séance. Deux essais ; lève REPORT_FAILED si aucun ne produit une section non vide.
 * @returns {Promise<{ notes: string, sections: object, dropped: string[], truncated: string[], sentencesDropped: number, droppedSentences: string[], attempts: number }>}
 */
async function report({ transcript, motif, type, catalog }) {
  const text = String(transcript || '').trim();
  if (!text) throw new DraftError('REPORT_FAILED', 502, 'Rien à résumer');
  const messages = buildReportMessages({ transcript: text, motif, type, vocabulary: buildVocabulary(catalog || []) });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { content, usage, finishReason } = await llmService.chatCompletion({ iaType: 'bilan_session_report', messages, jsonSchema: REPORT_JSON_SCHEMA });
      if (usage) logger.info(`Compte rendu de séance : ${usage.prompt_tokens} jeton(s) d'entrée, ${usage.completion_tokens} de sortie`);
      // Une sortie coupée par max_tokens le sera à l'identique au second essai (même requête,
      // température 0) : on ne repaie pas un appel pour rien.
      if (finishReason === 'length') { logger.warn(`Compte rendu de séance : sortie tronquée (essai ${attempt}), pas de nouvel essai`); break; }
      const g = guardReport(text, parseReport(content));
      const filled = SECTION_KEYS.filter((k) => g.sections[k]).length;
      if (filled === 0) { logger.warn(`Compte rendu de séance : essai ${attempt} sans aucune section (${g.dropped.length} vidée(s) par la garde)`); continue; }
      logger.info(`Compte rendu de séance : ${filled} section(s), ${g.dropped.length} vidée(s), ${g.sentencesDropped} phrase(s) retirée(s), ${g.truncated.length} tronquée(s), essai ${attempt}`);
      return { notes: formatReportNotes(g.sections), sections: g.sections, dropped: g.dropped, truncated: g.truncated, sentencesDropped: g.sentencesDropped, droppedSentences: g.droppedSentences, attempts: attempt };
    } catch (err) {
      logger.warn(`Compte rendu de séance : essai ${attempt} en échec (${safeErrorLabel(err)})`);
    }
  }
  throw new DraftError('REPORT_FAILED', 502, 'Le compte rendu de la séance n’a pas pu être produit');
}

module.exports = { REPORT_JSON_SCHEMA, SECTION_MAX_CHARS, buildReportMessages, parseReport, guardReport, formatReportNotes, report };
