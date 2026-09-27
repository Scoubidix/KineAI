// Extraction des tests et mesures depuis les notes brutes d'un bilan (spec §6.1).
// Le modèle propose des candidats CITÉS ; ce service les normalise de façon déterministe.
// Rien n'est écrit dans le document : le kiné valide à l'étape Vérification.
const { z } = require('zod');
const crypto = require('crypto');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { logMasked } = require('../utils/pseudonymDebug');
const llmService = require('./llmService');
const { getCatalog } = require('./bilanRenderService');
const { normalizeLabel, validateDocument, MEASUREMENTS_MAX, QUOTE_MAX } = require('./bilanDocument');
const { DraftError, PATIENT_SELECT, loadIdentity, loadNotesSource } = require('./bilanDraftService');
const { createPseudonymizer } = require('./pseudonymService');
const { normalizeText, proofText, nameForms, evidenceReasons } = require('./bilanEvidence');

const CANDIDATES_MAX = 100;
const LABEL_MAX = 200;
const TEXT_MAX = 500;

// Catégories saisissables à la main mais hors extraction : le rédacteur couvre l'anamnèse en prose,
// et structurer du texte libre en cases texte est la première source d'erreurs de classement.
const EXTRACTION_EXCLUDED_CATEGORIES = ['Anamnèse'];
const isExtractable = (f) => f.isActive !== false && !EXTRACTION_EXCLUDED_CATEGORIES.includes(f.category);

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
  // « un / une » : déterminants la plupart du temps, mais seule preuve possible de la valeur 1
  // dans une dictée (« eva un au repos ») : acceptés uniquement pour cette valeur.
  if (abs === 1 && /\b(?:un|une)\b/.test(q)) return true;
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
- Pour chaque candidat, "quote" est l'extrait EXACT des notes, copié tel quel, qui contient le nom du test ou de la mesure tel qu'il est écrit dans les notes, le côté s'il est écrit, et la valeur — 120 caractères maximum ; s'ils sont éloignés, l'extrait le plus court qui les contient tous.
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

// Séance enregistrée (spec 2026-09-26 §4.2) : le texte est un dialogue, une intention ou une
// hypothèse dite à voix haute y a l'air d'un résultat
const EXTRACTION_DIALOGUE_RULE = 'Les notes sont la transcription d’un dialogue entre le kinésithérapeute et son patient. Ne retiens que les résultats que le kiné constate ou mesure pendant la séance : une intention (« on va tester… »), une hypothèse, une question ou un souvenir du patient n’est pas un résultat.';

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

function buildExtractionMessages({ rawNotes, motif, compactCatalog, source = 'notes' }) {
  const system = source === 'dialogue' ? `${SYSTEM_PROMPT}\n- ${EXTRACTION_DIALOGUE_RULE}` : SYSTEM_PROMPT;
  return [
    { role: 'system', content: system },
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
  const formsCache = new Map();
  const formsOf = (field) => {
    if (!formsCache.has(field.key)) formsCache.set(field.key, nameForms(field));
    return formsCache.get(field.key);
  };
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
      let outOfRange = false;
      switch (field.type) {
        case 'NUMERIC': { // règle 3
          value = toNumber(raw.value);
          // Règle 3b : la citation doit prouver le nombre, sinon on garde l'information en texte
          if (value === undefined || !quoteSupportsNumber(quote, value)) {
            const text = quote.slice(0, TEXT_MAX);
            c = {
              kind: 'custom', label: field.label, fieldType: 'TEXT', unit: null, lateralized: false, value: text, side: null, presentation: 'narrative', quote, confidence: raw.confidence,
              reasons: evidenceReasons({ quote, forms: formsOf(field), fieldType: 'TEXT', value: text, side: null, lateralized: false, confidence: raw.confidence }),
            };
            value = undefined;
            break;
          }
          outOfRange = (field.rangeMin != null && value < field.rangeMin) || (field.rangeMax != null && value > field.rangeMax);
          break;
        }
        case 'BOOLEAN': value = toBoolean(raw.value); break; // règle 5
        case 'ENUM': value = toEnum(raw.value, field.options); break; // règle 4
        case 'TEXT': value = toText(raw.value); break;
        default: value = undefined;
      }
      if (!c) {
        if (value === undefined) { rejected += 1; continue; }
        const side = field.lateralized && (raw.side === 'D' || raw.side === 'G') ? raw.side : null; // règle 6
        // Spec 2026-09-26 §2 : nom, valeur et côté confrontés à la citation
        const reasons = evidenceReasons({ quote, forms: formsOf(field), fieldType: field.type, value, side, lateralized: !!field.lateralized, confidence: raw.confidence });
        if (outOfRange) reasons.push('out_of_range');
        c = {
          kind: 'canonical', key: field.key, label: field.label, fieldType: field.type, unit: field.unit ?? null, lateralized: !!field.lateralized,
          value, side,
          presentation: field.presentation === 'NARRATIVE' ? 'narrative' : 'table',
          quote, confidence: raw.confidence, reasons,
        };
      }
    } else {
      // Règle 1 : clé inconnue/inactive, ou custom déclaré → mesure libre
      const label = String(raw.label || humanizeKey(raw.key)).trim();
      const value = toText(raw.value);
      if (!label || label.length > LABEL_MAX || value === undefined) { rejected += 1; continue; }
      c = {
        kind: 'custom', label, fieldType: 'TEXT', unit: null, lateralized: false, value, side: null, presentation: 'table', quote, confidence: raw.confidence,
        reasons: evidenceReasons({ quote, forms: nameForms({ key: '', label, aliases: [] }), fieldType: 'TEXT', value, side: null, lateralized: false, confidence: raw.confidence }),
      };
    }

    // Règle 7 : doublons → la version la mieux prouvée, puis la plus confiante
    const id = identityOf(c);
    const prev = kept.get(id);
    if (prev && (prev.reasons.length < c.reasons.length || (prev.reasons.length === c.reasons.length && prev.confidence >= c.confidence))) continue;
    kept.set(id, { ...c, id });
  }

  // Règle 8 : confrontation au document courant
  const out = [];
  for (const c of kept.values()) {
    const cur = existing.get(c.id);
    if (cur && isFilled(cur.value)) {
      if (sameValue(cur.value, c.value)) continue; // déjà saisi
      out.push({ ...c, reasons: [...c.reasons, 'conflict'], existingValue: cur.value });
    } else {
      out.push(c);
    }
  }
  return { candidates: out, rejected };
}

/**
 * Empreinte des notes analysées : notes inchangées → pas de nouvelle analyse (spec 2026-09-26 §5).
 * Le motif n'y entre pas : la rédaction en déduit un, qui relancerait sinon une extraction inutile.
 */
function notesHash(rawNotes) {
  return crypto.createHash('sha256').update(String(rawNotes ?? '').trim()).digest('hex');
}

/**
 * Écrit les candidats prouvés dans le tableau et garde les autres pour l'étape Mesures (spec
 * 2026-09-26 §4.3). Les sections ne sont jamais touchées : rien n'atteint la prose avant que le
 * kiné ait relu le tableau. Une ligne retirée par le kiné (même identité, même citation) n'est ni
 * réécrite ni reproposée. Pure : ne mute pas `document`.
 * @returns {{ document: object, filled: number, pending: number }}
 */
function applyExtraction(document, candidates, { notesHash: hash, extractedAt }) {
  const dismissed = document.review?.dismissed || [];
  const dismissedKeys = new Set(dismissed.map((d) => `${d.id}|${proofText(d.quote)}`));
  const measurements = [...(document.measurements || [])];
  const pending = [];
  let filled = 0;
  for (const c of candidates) {
    if (dismissedKeys.has(`${c.id}|${proofText(c.quote)}`)) continue;
    if (c.reasons.length > 0) { pending.push(c); continue; }
    const idx = measurements.findIndex((m) => identityOf(m) === c.id);
    // Tableau plein (le schéma borne à 200 lignes) : la ligne n'est pas écrite plutôt que de
    // bloquer tous les autosaves du bilan
    if (idx === -1 && measurements.length >= MEASUREMENTS_MAX) continue;
    const row = c.kind === 'canonical'
      ? { kind: 'canonical', key: c.key, value: c.value, ...(c.side ? { side: c.side } : {}), presentation: c.presentation, origin: 'extracted', quote: c.quote }
      : { kind: 'custom', label: c.label, value: String(c.value), presentation: c.presentation, origin: 'extracted', quote: c.quote };
    if (idx === -1) measurements.push(row);
    else measurements[idx] = { ...measurements[idx], value: row.value, origin: 'extracted', quote: c.quote };
    filled += 1;
  }
  return { document: { ...document, measurements, review: { notesHash: hash, extractedAt, pending, dismissed } }, filled, pending: pending.length };
}

// Un JSON malformé peut contenir un extrait des notes (données de santé) dans le message
// d'erreur V8 : jamais dans les logs.
const safeErrorLabel = (err) => (err instanceof SyntaxError ? 'JSON invalide' : err.message);

async function callExtraction(messages) {
  const { content, usage } = await llmService.chatCompletion({ iaType: 'bilan_extract', messages, jsonSchema: EXTRACTION_JSON_SCHEMA });
  if (usage) logger.info(`Extraction bilan : ${usage.prompt_tokens} jeton(s) d'entrée, ${usage.completion_tokens} de sortie`);
  return parseExtractionOutput(content);
}

// Bornes du schéma du document (bilanDocument.js) pour une ligne remplie ou à vérifier
const withinBounds = (c) => c.quote.length <= QUOTE_MAX && c.label.length <= LABEL_MAX && !(typeof c.value === 'string' && c.value.length > TEXT_MAX);

/**
 * Pipeline complet sans accès base : prompt, appel modèle (un retry), normalisation.
 * Utilisé par extractForBilan et par le jeu d'évaluation (backend/eval/extraction).
 */
async function extractFromText({ rawNotes, motif, catalog, document, logContext = 'texte', pseudo, source = 'notes' }) {
  const notes = pseudo ? pseudo.mask(rawNotes) : rawNotes;
  const m = pseudo ? pseudo.mask(motif || '') : motif;
  logMasked(`extraction (${logContext})`, `Motif : ${m || '(aucun)'}\n${notes}`, pseudo);
  const messages = buildExtractionMessages({ rawNotes: notes, motif: m, compactCatalog: buildCompactCatalog(catalog), source });
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
  const { candidates, rejected } = normalize({ candidates: output.candidates, notes, catalog, document });
  if (!pseudo) return { candidates, rejected };
  // Les bornes ont été vérifiées sur le texte masqué ; réhydraté (« [NOM] » → le vrai nom), il
  // s'allonge. Un candidat hors bornes ferait refuser le document et bloquerait tous les autosaves.
  const unmasked = pseudo.unmaskDeep(candidates);
  const kept = unmasked.filter(withinBounds);
  return { candidates: kept, rejected: rejected + unmasked.length - kept.length };
}

/**
 * « Rédiger le bilan » depuis les notes, première moitié (spec 2026-09-26 §4.3) : analyse, preuves,
 * écriture des lignes prouvées dans le tableau et de la vérification dans le document. Les
 * sections ne sont jamais écrites ici. Notes inchangées depuis la dernière analyse : rien
 * n'est rappelé, le kiné retrouve sa vérification. Check-and-set sur l'updatedAt lu au départ : le
 * front a flushé et verrouille l'édition pendant l'appel.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | NOTES_REQUIRED | EXTRACTION_FAILED | STALE_DRAFT
 */
async function extractForBilan({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const where = { id: bilanId, kineId, isActive: true };
  const bilan = await prisma.bilanKine.findFirst({
    where,
    select: { id: true, rawNotes: true, motif: true, document: true, updatedAt: true, createdAt: true, patient: { select: { firstName: true, lastName: true, birthDate: true } } },
  });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (!bilan.document) throw new DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être analysés');
  const notes = (bilan.rawNotes || '').trim();
  if (!notes) throw new DraftError('NOTES_REQUIRED', 400, 'Saisis des notes avant de lancer l’analyse');

  const hash = notesHash(notes);
  const previous = bilan.document.review;
  if (previous && previous.notesHash === hash) {
    logger.info(`Extraction bilan ${bilanId} : notes inchangées, vérification reprise`);
    return { bilan: null, cached: true, filled: 0, pending: previous.pending.length, rejected: 0 };
  }

  const catalog = await getCatalog();
  const source = await loadNotesSource(prisma, bilanId);
  const pseudo = createPseudonymizer({ patient: bilan.patient, kine: await loadIdentity(prisma, kineId), at: bilan.createdAt });
  const { candidates, rejected } = await extractFromText({ rawNotes: notes, motif: bilan.motif, catalog, document: bilan.document, logContext: `bilan ${bilanId}`, pseudo, source });
  const applied = applyExtraction(bilan.document, candidates, { notesHash: hash, extractedAt: new Date().toISOString() });
  // Garde : un document que le schéma refuse bloquerait tous les autosaves du bilan, rien n'est écrit
  const check = validateDocument(applied.document, catalog);
  if (!check.success) {
    logger.error(`Extraction bilan ${bilanId} : document refusé par le schéma (${check.errors.length} erreur(s)), rien d’écrit`);
    throw new DraftError('EXTRACTION_FAILED', 502, 'L’analyse des notes a échoué, réessaie dans un instant');
  }

  let updated;
  try {
    updated = await prisma.bilanKine.update({ where: { ...where, updatedAt: bilan.updatedAt }, data: { document: applied.document }, include: { patient: { select: PATIENT_SELECT } } });
  } catch (err) {
    if (err && err.code === 'P2025') throw new DraftError('STALE_DRAFT', 409, 'Ce bilan a été modifié pendant l’analyse, recharge-le', { updatedAt: bilan.updatedAt });
    throw err;
  }
  logger.info(`Extraction bilan ${bilanId} (${source}) : ${applied.filled} remplie(s), ${applied.pending} à vérifier, ${rejected} écartée(s)`);
  return { bilan: updated, cached: false, filled: applied.filled, pending: applied.pending, rejected };
}

module.exports = {
  normalizeText,
  buildCompactCatalog,
  buildExtractionMessages,
  parseExtractionOutput,
  parseJsonOutput,
  normalize,
  applyExtraction,
  notesHash,
  extractFromText,
  extractForBilan,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_EXCLUDED_CATEGORIES,
  EXTRACTION_DIALOGUE_RULE,
  isNotAssessed,
  quoteSupportsNumber,
  identityOf,
};
