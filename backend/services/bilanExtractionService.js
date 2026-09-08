// Extraction des tests et mesures depuis les notes brutes d'un bilan (spec §6.1).
// Le modèle propose des candidats CITÉS ; ce service les normalise de façon déterministe.
// Rien n'est écrit dans le document : le kiné valide à l'étape Vérification.
const { z } = require('zod');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const llmService = require('./llmService');
const { getCatalog } = require('./bilanRenderService');
const { normalizeLabel } = require('./bilanDocument');
const { DraftError } = require('./bilanDraftService');

const QUOTE_MAX = 300;
const CANDIDATES_MAX = 100;
const LABEL_MAX = 200;
const TEXT_MAX = 500;

// Catégories saisissables à la main mais hors extraction : le rédacteur couvre l'anamnèse en prose,
// et structurer du texte libre en cases texte est la première source d'erreurs de classement.
const EXTRACTION_EXCLUDED_CATEGORIES = ['Anamnèse'];
const isExtractable = (f) => f.isActive !== false && !EXTRACTION_EXCLUDED_CATEGORIES.includes(f.category);

// Texte comparable : sans diacritiques, minuscules, espaces normalisés
function normalizeText(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Statut d'assertion « non évalué » (famille NegEx/ConText) : une citation qui dit qu'un test n'a
// pas été fait ne porte aucune valeur, quel que soit le champ.
const NOT_ASSESSED_RE = /\b(?:non|pas)\s+(?:teste|testee|testes|realise|realisee|evalue|evaluee|fait|faite|mesure|mesuree|effectue|effectuee)\b|\bnt\b|\ba\s+(?:re)?tester\b|\bimpossible\s+a\s+(?:tester|evaluer|mesurer)\b/;
function isNotAssessed(quote) {
  return NOT_ASSESSED_RE.test(normalizeText(quote));
}

// Preuve d'une valeur numérique dans la citation : ses chiffres (13.5 / 13,5 / 13), ou un mot-nombre
// français (transcriptions : « quarante-deux », « treize et demi »). Liste réduite aux mots-nombres
// sans ambiguïté : « un/une/demi/virgule » servent aussi de déterminants ou de liaisons courantes
// et ne prouvent rien à eux seuls (« une douleur », « une seconde »).
const NUMBER_WORD_RE = /\b(?:zero|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille)\b/;
function quoteSupportsNumber(quote, value) {
  const q = normalizeText(quote).replace(/,/g, '.');
  const abs = Math.abs(value);
  const forms = new Set([String(abs), abs.toFixed(1), String(Math.trunc(abs))]);
  // Une citation qui contient déjà un chiffre doit prouver la valeur par ses chiffres : le repli
  // mot-nombre ne sert que pour une transcription sans aucun chiffre.
  if (/\d/.test(q)) {
    for (const f of forms) {
      if (new RegExp(`(?<![\\d.])${f.replace('.', '\\.')}(?![\\d])`).test(q)) return true;
    }
    return false;
  }
  return NUMBER_WORD_RE.test(q);
}

// « DG » (bilatéral, des deux côtés, ddc) → deux candidats identiques D et G
function expandBilateral(raw) {
  if (raw.side !== 'DG') return [raw];
  return [{ ...raw, side: 'D' }, { ...raw, side: 'G' }];
}

// Catalogue compact envoyé au modèle (~6 000 tokens). Mémoïsé sur l'identité du tableau
// renvoyé par getCatalog (lui-même caché 10 min et invalidé par le seed).
let compactCache = { source: null, value: null };
function buildCompactCatalog(catalog) {
  if (compactCache.source === catalog) return compactCache.value;
  const value = catalog.filter(isExtractable).map((f) => {
    const c = { key: f.key, label: f.label, type: f.type, lateralized: !!f.lateralized, category: f.category };
    if (f.unit) c.unit = f.unit;
    if (f.type === 'ENUM' && Array.isArray(f.options)) c.options = f.options;
    if (Array.isArray(f.aliases) && f.aliases.length) c.aliases = f.aliases;
    if (f.description) c.description = f.description;
    return c;
  });
  compactCache = { source: catalog, value };
  return value;
}

const SYSTEM_PROMPT = `Tu es un assistant d'extraction pour kinésithérapeutes. On te donne les notes brutes d'un bilan et un catalogue de champs (tests et mesures). Tu renvoies uniquement un objet JSON {"candidates":[...]}.
Règles absolues :
- Ne retiens que ce qui est ÉCRIT EXPLICITEMENT dans les notes. N'infère jamais une valeur, ne complète jamais un test non renseigné.
- Pour chaque candidat, "quote" est l'extrait EXACT des notes (copié tel quel, 3 à 80 caractères) qui contient la valeur.
- "side" vaut "D" ou "G" uniquement si le côté est écrit (droite, gauche, D, G, dt, gche…), "DG" si les deux côtés sont explicitement mentionnés (« des deux côtés », « bilatéral », « D et G », « ddc »), sinon null.
- Un test dit « non testé », « non réalisé », « à tester », « NT » n'a pas de valeur : ne le propose pas.
- Une valeur numérique doit être écrite dans la citation (chiffres ou nombre en lettres). « impossible », « non tenu », « incapable » ne valent pas 0 : propose alors un "custom" avec le texte.
- Utilise "kind":"canonical" avec la "key" du catalogue quand le test ou la mesure correspond à un champ (par son libellé ou l'un de ses alias). Sinon "kind":"custom" avec un "label" court et "key":null.
- "key" est recopiée EXACTEMENT depuis le catalogue (copier-coller, même si son orthographe te semble fautive : c'est un identifiant, pas un mot). "label" reprend le libellé du catalogue pour un canonical, un libellé court pour un custom.
- Valeurs : nombre pour NUMERIC (sans unité), true/false pour BOOLEAN (positif = true, négatif = false), une des options exactes pour ENUM, texte court pour TEXT et custom.
- Un même champ noté à droite et à gauche donne deux candidats.
- "confidence" entre 0 et 1 : 0.9 ou plus si la correspondance est évidente, 0.5 si le libellé est ambigu.
- Chaque champ porte une "category" (région ou domaine). Quand plusieurs champs ont des libellés proches (rotation externe de hanche / RE1 d'épaule), choisis d'après la région dont parle le contexte immédiat ; en cas de doute, confiance 0.5. Lis la "description" quand elle existe : elle fixe la convention (signe, unité, périmètre).
- Ignore tout ce qui n'est ni un test ni une mesure du catalogue. L'anamnèse (profession, antécédents, traitements, examens, objectifs) n'est pas à extraire : elle est rédigée à part.`;

// Schéma strict (OpenAI) : tous les champs requis, nullables quand optionnels
const EXTRACTION_JSON_SCHEMA = {
  name: 'bilan_extraction',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'key', 'label', 'value', 'side', 'quote', 'confidence'],
          properties: {
            kind: { type: 'string', enum: ['canonical', 'custom'] },
            key: { type: ['string', 'null'] },
            label: { type: ['string', 'null'] },
            value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] },
            side: { type: ['string', 'null'], enum: ['D', 'G', 'DG', null] },
            quote: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
    },
  },
};

// Validation Zod de la sortie brute (tolérante sur les formes Mistral : '' pour null, confiance absente)
const emptyToNull = (v) => (v === '' ? null : v);
const rawCandidateSchema = z.object({
  kind: z.enum(['canonical', 'custom']),
  key: z.preprocess(emptyToNull, z.string().nullable().optional()),
  label: z.preprocess(emptyToNull, z.string().nullable().optional()),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  side: z.preprocess(emptyToNull, z.enum(['D', 'G', 'DG']).nullable().optional()),
  quote: z.string(),
  confidence: z.number().min(0).max(1).catch(0.5),
});
const extractionOutputSchema = z.object({ candidates: z.array(rawCandidateSchema).max(CANDIDATES_MAX) });

// Tolère les fences ```json … ``` que certains modèles ajoutent malgré json_object
function parseJsonOutput(content) {
  const text = String(content ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

function parseExtractionOutput(content) {
  const result = extractionOutputSchema.safeParse(parseJsonOutput(content));
  if (!result.success) throw new Error(`sortie d'extraction invalide : ${result.error.issues[0]?.message}`);
  return result.data;
}

function buildExtractionMessages({ rawNotes, motif, compactCatalog }) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Catalogue (JSON) :\n${JSON.stringify(compactCatalog)}\n\nMotif : ${motif || '(aucun)'}\n\nNotes :\n"""\n${rawNotes}\n"""` },
  ];
}

const TRUE_WORDS = ['positif', 'positive', 'pos', '+', 'present', 'presente', 'oui', 'true', 'vrai'];
const FALSE_WORDS = ['negatif', 'negative', 'neg', '-', '−', 'absent', 'absente', 'non', 'false', 'faux'];

function toBoolean(v) {
  if (typeof v === 'boolean') return v;
  const s = normalizeText(v);
  if (TRUE_WORDS.includes(s)) return true;
  if (FALSE_WORDS.includes(s)) return false;
  return undefined;
}
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = v.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : undefined;
}
function toEnum(v, options) {
  const s = normalizeText(v);
  return (Array.isArray(options) ? options : []).find((o) => normalizeText(o) === s);
}
function toText(v) {
  if (v === null || v === undefined) return undefined;
  const s = String(typeof v === 'boolean' ? (v ? 'oui' : 'non') : v).trim();
  return s && s.length <= TEXT_MAX ? s : undefined;
}

// Identité commune aux mesures du document et aux candidats : (key, side) ou label normalisé
const identityOf = (m) => (m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${normalizeLabel(m.label)}`);

const sameValue = (a, b) => (typeof a === 'string' && typeof b === 'string' ? normalizeText(a) === normalizeText(b) : a === b);
const isFilled = (v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');

/**
 * Normalisation déterministe (spec §6.1, règles 1 à 9). Pure : aucune I/O.
 */
// Le modèle « corrige » volontiers une clé (orthographe, accent, alias employé comme clé, préfixe
// test_ ajouté ou retiré). Avant de retomber en mesure libre, on résout la clé ou le libellé
// proposés contre les clés, libellés et alias du catalogue, tous normalisés. Déterministe.
const keyForm = (s) => normalizeText(String(s ?? '').replace(/_/g, ' '));
const TEST_PREFIX = /^test (de |du |d')?/;

function buildFieldIndex(fields) {
  const index = new Map();
  const add = (name, field) => { const k = keyForm(name); if (k && !index.has(k)) index.set(k, field); };
  for (const f of fields) {
    add(f.key, f);
    add(f.label, f);
    for (const a of Array.isArray(f.aliases) ? f.aliases : []) add(a, f);
  }
  return index;
}

function resolveField(index, ...names) {
  for (const name of names) {
    const k = keyForm(name);
    if (!k) continue;
    if (index.has(k)) return index.get(k);
    const stripped = k.replace(TEST_PREFIX, '');
    if (stripped !== k && index.has(stripped)) return index.get(stripped);
  }
  return undefined;
}

// Libellé lisible pour une mesure libre sans libellé proposé : jamais la clé brute
function humanizeKey(key) {
  const s = String(key ?? '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function normalize({ candidates, notes, catalog, document }) {
  const activeFields = catalog.filter((f) => f.isActive !== false);
  const fieldsByKey = new Map(activeFields.map((f) => [f.key, f]));
  const fieldIndex = buildFieldIndex(activeFields);
  const notesNorm = normalizeText(notes);
  const existing = new Map((document?.measurements || []).map((m) => [identityOf(m), m]));
  const kept = new Map();
  let rejected = 0;

  for (const raw of candidates.flatMap(expandBilateral)) {
    // Règle 2 : la citation doit être dans les notes (garde anti-invention principale)
    const quote = String(raw.quote || '').trim();
    if (!quote || quote.length > QUOTE_MAX || !notesNorm.includes(normalizeText(quote))) { rejected += 1; continue; }
    // Règle 2b : non évalué → aucune valeur
    if (isNotAssessed(quote)) { rejected += 1; continue; }

    // Clé exacte d'abord, puis résolution tolérante (clé « corrigée », alias, libellé), y compris
    // pour un candidat déclaré custom dont le libellé désigne en fait un champ du catalogue.
    const field = (raw.kind === 'canonical' && raw.key ? fieldsByKey.get(raw.key) : undefined) || resolveField(fieldIndex, raw.key, raw.label);
    // Règle 1b : champ hors périmètre d'extraction (anamnèse) → écarté, même atteint par alias
    if (field && !isExtractable(field)) { rejected += 1; continue; }
    let c;
    if (field) {
      let value;
      let warning;
      switch (field.type) {
        case 'NUMERIC': { // règle 3
          value = toNumber(raw.value);
          // Règle 3b : la citation doit prouver le nombre, sinon on garde l'information en texte
          if (value === undefined || !quoteSupportsNumber(quote, value)) {
            c = { kind: 'custom', label: field.label, fieldType: 'TEXT', unit: null, lateralized: false, value: quote.slice(0, TEXT_MAX), side: null, presentation: 'narrative', quote, confidence: raw.confidence };
            value = undefined;
            break;
          }
          if ((field.rangeMin != null && value < field.rangeMin) || (field.rangeMax != null && value > field.rangeMax)) warning = 'out_of_range';
          break;
        }
        case 'BOOLEAN': value = toBoolean(raw.value); break; // règle 5
        case 'ENUM': value = toEnum(raw.value, field.options); break; // règle 4
        case 'TEXT': value = toText(raw.value); break;
        default: value = undefined;
      }
      if (!c) {
        if (value === undefined) { rejected += 1; continue; }
        c = {
          kind: 'canonical', key: field.key, label: field.label, fieldType: field.type, unit: field.unit ?? null, lateralized: !!field.lateralized,
          value,
          side: field.lateralized && (raw.side === 'D' || raw.side === 'G') ? raw.side : null, // règle 6
          presentation: field.presentation === 'NARRATIVE' ? 'narrative' : 'table',
          quote, confidence: raw.confidence,
          ...(warning ? { warning } : {}),
        };
      }
    } else {
      // Règle 1 : clé inconnue/inactive, ou custom déclaré → mesure libre
      const label = String(raw.label || humanizeKey(raw.key)).trim();
      const value = toText(raw.value);
      if (!label || label.length > LABEL_MAX || value === undefined) { rejected += 1; continue; }
      c = { kind: 'custom', label, fieldType: 'TEXT', unit: null, lateralized: false, value, side: null, presentation: 'table', quote, confidence: raw.confidence };
    }

    // Règle 7 : doublons → confiance la plus haute
    const id = identityOf(c);
    const prev = kept.get(id);
    if (prev && prev.confidence >= c.confidence) continue;
    kept.set(id, { ...c, id });
  }

  // Règle 8 : confrontation au document courant
  const out = [];
  for (const c of kept.values()) {
    const cur = existing.get(c.id);
    if (cur && isFilled(cur.value)) {
      if (sameValue(cur.value, c.value)) continue; // déjà saisi
      out.push({ ...c, status: 'conflict', existingValue: cur.value });
    } else {
      out.push({ ...c, status: 'new' });
    }
  }
  return { candidates: out, rejected };
}

// Un JSON malformé peut contenir un extrait des notes (données de santé) dans le message
// d'erreur V8 : jamais dans les logs.
const safeErrorLabel = (err) => (err instanceof SyntaxError ? 'JSON invalide' : err.message);

async function callExtraction(messages) {
  const { content } = await llmService.chatCompletion({ iaType: 'bilan_extract', messages, jsonSchema: EXTRACTION_JSON_SCHEMA });
  return parseExtractionOutput(content);
}

/**
 * Pipeline complet sans accès base : prompt, appel modèle (un retry), normalisation.
 * Utilisé par extractForBilan et par le jeu d'évaluation (backend/eval/extraction).
 */
async function extractFromText({ rawNotes, motif, catalog, document, logContext = 'texte' }) {
  const messages = buildExtractionMessages({ rawNotes, motif, compactCatalog: buildCompactCatalog(catalog) });
  let output;
  try {
    output = await callExtraction(messages);
  } catch (err) {
    logger.warn(`Extraction ${logContext} : premier essai invalide (${safeErrorLabel(err)}), nouvel essai`);
    try {
      output = await callExtraction(messages);
    } catch (err2) {
      logger.error(`Extraction ${logContext} : échec après retry (${safeErrorLabel(err2)})`);
      throw new DraftError('EXTRACTION_FAILED', 502, 'L’analyse des notes a échoué, réessaie dans un instant');
    }
  }
  return normalize({ candidates: output.candidates, notes: rawNotes, catalog, document });
}

/**
 * Analyse les notes d'un bilan du kiné. Ne modifie pas le bilan.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | NOTES_REQUIRED | EXTRACTION_FAILED
 */
async function extractForBilan({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const bilan = await prisma.bilanKine.findFirst({
    where: { id: bilanId, kineId, isActive: true },
    select: { id: true, rawNotes: true, motif: true, document: true },
  });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (!bilan.document) throw new DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être analysés');
  const notes = (bilan.rawNotes || '').trim();
  if (!notes) throw new DraftError('NOTES_REQUIRED', 400, 'Saisis des notes avant de lancer l’analyse');

  const catalog = await getCatalog();
  const result = await extractFromText({ rawNotes: notes, motif: bilan.motif, catalog, document: bilan.document, logContext: `bilan ${bilanId}` });
  logger.info(`Extraction bilan ${bilanId} : ${result.candidates.length} candidat(s), ${result.rejected} rejeté(s)`);
  return result;
}

module.exports = {
  normalizeText,
  buildCompactCatalog,
  buildExtractionMessages,
  parseExtractionOutput,
  normalize,
  extractFromText,
  extractForBilan,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_EXCLUDED_CATEGORIES,
  isNotAssessed,
  quoteSupportsNumber,
  identityOf,
};
