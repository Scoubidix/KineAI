// Rédaction IA des sections narratives du bilan (spec §6.2).
// Les mesures « table » ne sont jamais transmises au modèle ; chaque nombre écrit doit
// apparaître dans les notes, le motif ou les mesures narratives, sinon la section est signalée.
const { z } = require('zod');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const llmService = require('./llmService');
const activityService = require('./activityService');
const { getCatalog } = require('./bilanRenderService');
const { SECTION_KEYS, SECTION_TITLES } = require('./bilanDocument');
const { DraftError, PATIENT_SELECT } = require('./bilanDraftService');
const { BILAN_TYPE_LABELS } = require('./bilanRenderer/format');

const SECTION_TEXT_MAX = 5000;

const { STYLE_PRINCIPLES, STYLE_EXAMPLES } = require('../data/bilanStyleExamples');

const SECTION_GUIDE = {
  anamnese: 'commence par le motif de consultation et son ancienneté tels qu\'écrits dans les notes (ex. « consulte pour une lombalgie évoluant depuis trois mois »), puis qui est le patient (âge, profession, activités), histoire de la plainte, attentes',
  antecedents: 'antécédents et traitements réellement rapportés, en une phrase',
  examen: 'synthèse interprétative : ce que les signes et les tests, nommés sans leurs valeurs, suggèrent ensemble (observation, palpation, qualité du mouvement, tests positifs ou négatifs qui orientent)',
  limitations: 'uniquement les limitations d\'activité et restrictions de participation rapportées dans les notes ; sinon chaîne vide',
  diagnostic: 'hypothèse kinésithérapique : déficiences, limitations, restrictions, deux ou trois dominantes, pronostic prudent',
  objectifs: 'uniquement les objectifs formulés dans les notes ou par le patient, à court, moyen et long terme ; sinon chaîne vide',
  traitement: 'uniquement le plan, le protocole ou les consignes présents dans les notes ; sinon chaîne vide',
};

const SYSTEM_PROMPT = `Tu rédiges des bilans diagnostiques kinésithérapiques (BDK) pour un kinésithérapeute, en français. Tu renvoies uniquement un objet JSON {"sections":{...}} avec exactement les clés demandées.
Règles absolues :
- Tu n'utilises QUE les informations présentes dans les notes, le motif et les mesures fournies. Interdiction d'inventer, de supposer ou de compléter.
- Interdiction d'écrire un chiffre qui n'apparaît pas dans les notes ou dans les mesures fournies.
- Si les notes ne contiennent rien pour une section, renvoie une chaîne vide "" pour cette section. Si elles ne contiennent que des mesures, une phrase de synthèse suffit.
- Pas de titre, pas de puces, pas de retour à la ligne superflu.
- Les mesures listées comme « déjà présentées en tableau » ne doivent pas être chiffrées dans le texte ; un test peut être nommé quand il sert le raisonnement.
Style attendu :
${STYLE_PRINCIPLES.map((p) => `- ${p}`).join('\n')}
Des exemples de style te sont fournis : imite leur forme, leur longueur et leur façon de raisonner ; ne reprends jamais leur contenu, qui concerne d'autres patients. Leurs sections sont toutes remplies parce que leurs notes l'étaient : si les notes ne disent rien pour une section, en particulier limitations, objectifs et traitement, laisse-la vide plutôt que de proposer un plan.`;

// Exemples de style limités aux sections demandées (les autres n'apportent rien et coûtent des tokens)
function formatStyleExamples(keys) {
  return STYLE_EXAMPLES.map((ex) => [`Exemple — ${ex.title} :`, ...keys.map((k) => `[${SECTION_TITLES[k]}] ${ex.sections[k]}`)].join('\n')).join('\n\n');
}

// Mesures narratives renseignées, formatées « Libellé (côté) : valeur unité »
function formatNarrativeMeasurements(measurements, catalog) {
  const byKey = new Map((catalog || []).map((f) => [f.key, f]));
  const lines = [];
  for (const m of measurements || []) {
    if (m.presentation !== 'narrative') continue;
    if (m.value === null || m.value === undefined || (typeof m.value === 'string' && m.value.trim() === '')) continue;
    let label;
    let unit = '';
    if (m.kind === 'canonical') {
      const f = byKey.get(m.key);
      label = f ? f.label : m.key;
      if (f && f.unit) unit = f.unit.startsWith('/') ? f.unit : ` ${f.unit}`;
    } else {
      label = m.label;
    }
    const side = m.side ? ` (${m.side === 'D' ? 'droite' : 'gauche'})` : '';
    const value = typeof m.value === 'boolean' ? (m.value ? 'positif' : 'négatif') : `${m.value}${unit}`;
    lines.push(`${label}${side} : ${value}`);
  }
  return lines;
}

// Texte comparable : sans diacritiques, minuscules, espaces normalisés (même règle que l'extraction)
function normalizeText(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Mots trop génériques pour signer une mesure à eux seuls (bruit de libellé, pas de sens clinique isolé)
const TOKEN_STOPWORDS = new Set(['test', 'des', 'les', 'aux', 'par', 'sur', 'pour', 'avec', 'sans']);

// Mesures présentées en tableau : libellés (pour l'exclusion explicite dans le prompt) et, par mesure
// renseignée, les mots significatifs de son libellé (hors côté) + ses nombres — pour le contrôle de
// doublon par co-occurrence dans une même phrase (checkTableDuplicate). Une valeur booléenne n'apporte
// aucun nombre.
function tableMeasurementSummary(measurements, catalog) {
  const byKey = new Map((catalog || []).map((f) => [f.key, f]));
  const labels = [];
  const entries = [];
  for (const m of measurements || []) {
    if (m.presentation !== 'table') continue;
    if (m.value === null || m.value === undefined || (typeof m.value === 'string' && m.value.trim() === '')) continue;
    const label = m.kind === 'canonical' ? (byKey.get(m.key)?.label ?? m.key) : m.label;
    const side = m.side ? ` (${m.side === 'D' ? 'droite' : 'gauche'})` : '';
    labels.push(`${label}${side}`);
    const tokens = new Set(normalizeText(label).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !TOKEN_STOPWORDS.has(w)));
    const numbers = typeof m.value === 'boolean' ? new Set() : new Set(numbersIn(String(m.value)));
    entries.push({ tokens, numbers });
  }
  return { labels, entries };
}

// Doublon avec un tableau : la même phrase doit porter à la fois un nombre de la mesure ET un mot
// de son libellé (évite le faux positif « EVA 5 » / « douleur depuis 5 ans » : un nombre commun ne
// suffit pas sans rapport de sens).
function checkTableDuplicate(text, entries) {
  for (const raw of String(text || '').split(/[.!?;\n]+/)) {
    const phrase = normalizeText(raw);
    if (!phrase) continue;
    const numbers = numbersIn(phrase);
    if (!numbers.length) continue;
    for (const entry of entries) {
      if (!numbers.some((n) => entry.numbers.has(n))) continue;
      if ([...entry.tokens].some((t) => new RegExp(`\\b${t}\\b`).test(phrase))) return 'table_duplicate';
    }
  }
  return null;
}

function buildComposeMessages({ type, motif, rawNotes, lines, tableLabels, keys }) {
  const user = [
    `Type de bilan : ${BILAN_TYPE_LABELS[type] || type}`,
    `Motif : ${motif || '(non renseigné)'}`,
    '',
    'Notes du kiné :',
    '"""',
    rawNotes,
    '"""',
    '',
    'Mesures à intégrer en prose (déjà validées par le kiné) :',
    lines.length ? lines.map((l) => `- ${l}`).join('\n') : '(aucune)',
    '',
    'Mesures déjà présentées en tableau (ne les cite pas, ni leur valeur) :',
    tableLabels.length ? tableLabels.map((l) => `- ${l}`).join('\n') : '(aucune)',
    '',
    'Sections à rédiger (clé : titre — contenu attendu) :',
    keys.map((k) => `- ${k} : ${SECTION_TITLES[k]} — ${SECTION_GUIDE[k]}`).join('\n'),
    '',
    'Exemples de style (forme à imiter, contenu à ne jamais reprendre) :',
    formatStyleExamples(keys),
  ].join('\n');
  return [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }];
}

// Schéma strict limité aux clés demandées
function buildComposeJsonSchema(keys) {
  return {
    name: 'bilan_compose',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['sections'],
      properties: {
        sections: {
          type: 'object',
          additionalProperties: false,
          required: keys,
          properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' }])),
        },
      },
    },
  };
}

const composeOutputSchema = z.object({ sections: z.record(z.string(), z.string()) });

function parseComposeOutput(content) {
  const text = String(content ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const result = composeOutputSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error(`sortie de rédaction invalide : ${result.error.issues[0]?.message}`);
  return result.data;
}

// Contrôle déterministe des nombres : chaque nombre du texte doit exister dans les sources.
// Comparaison sur la valeur numérique (7,5 = 7.5 = 7.50).
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
function numbersIn(text) {
  return (String(text || '').match(NUMBER_RE) || []).map((n) => String(parseFloat(n.replace(',', '.'))));
}
function checkNumbers(text, allowed) {
  return numbersIn(text).every((n) => allowed.has(n)) ? null : 'unverified_number';
}

// Un JSON malformé peut contenir un extrait des notes (données de santé) dans le message
// d'erreur V8 : jamais dans les logs.
const safeErrorLabel = (err) => (err instanceof SyntaxError ? 'JSON invalide' : err.message);

async function callCompose(messages, jsonSchema) {
  const { content } = await llmService.chatCompletion({ iaType: 'bilan_compose', messages, jsonSchema });
  return parseComposeOutput(content);
}

/**
 * Rédige les sections demandées (défaut : les 7) et les écrit dans le document.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | NOTES_REQUIRED | COMPOSE_FAILED | STALE_DRAFT
 */
async function composeForBilan({ kineId, bilanId, sections, uid }) {
  const prisma = prismaService.getInstance();
  const where = { id: bilanId, kineId, isActive: true };
  const bilan = await prisma.bilanKine.findFirst({ where, select: { id: true, type: true, status: true, rawNotes: true, motif: true, document: true } });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (!bilan.document) throw new DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être rédigés par l’IA');
  const notes = (bilan.rawNotes || '').trim();
  if (!notes) throw new DraftError('NOTES_REQUIRED', 400, 'Saisis des notes avant de lancer la rédaction');

  // Ordre canonique, doublons ignorés, clés inconnues ignorées (déjà filtrées par Zod en route)
  const keys = Array.isArray(sections) && sections.length ? SECTION_KEYS.filter((k) => sections.includes(k)) : SECTION_KEYS;

  const catalog = await getCatalog();
  const lines = formatNarrativeMeasurements(bilan.document.measurements, catalog);
  const table = tableMeasurementSummary(bilan.document.measurements, catalog);
  const messages = buildComposeMessages({ type: bilan.type, motif: bilan.motif, rawNotes: notes, lines, tableLabels: table.labels, keys });
  const jsonSchema = buildComposeJsonSchema(keys);

  let output;
  try {
    output = await callCompose(messages, jsonSchema);
  } catch (err) {
    logger.warn(`Rédaction bilan ${bilanId} : premier essai invalide (${safeErrorLabel(err)}), nouvel essai`);
    try {
      output = await callCompose(messages, jsonSchema);
    } catch (err2) {
      logger.error(`Rédaction bilan ${bilanId} : échec après retry (${safeErrorLabel(err2)})`);
      throw new DraftError('COMPOSE_FAILED', 502, 'La rédaction a échoué, réessaie dans un instant');
    }
  }

  const allowed = new Set([...numbersIn(notes), ...numbersIn(bilan.motif), ...lines.flatMap(numbersIn)]);
  const texts = {};
  const warnings = {};
  for (const k of keys) {
    const t = String(output.sections[k] ?? '').trim().slice(0, SECTION_TEXT_MAX);
    texts[k] = t;
    const w = checkNumbers(t, allowed) || checkTableDuplicate(t, table.entries);
    if (w) warnings[k] = w;
  }

  // L'appel IA a duré plusieurs secondes : on relit la version la plus fraîche et on ne
  // remplace que les sections demandées, en check-and-set sur updatedAt (comme l'autosave).
  const fresh = await prisma.bilanKine.findFirst({ where, select: { status: true, document: true, updatedAt: true } });
  if (!fresh || !fresh.document) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  const document = {
    ...fresh.document,
    sections: fresh.document.sections.map((s) => (texts[s.key] !== undefined ? { ...s, text: texts[s.key] } : s)),
  };
  const firstGeneration = fresh.status === 'BROUILLON';
  const data = firstGeneration ? { document, status: 'GENERE' } : { document };

  let updated;
  try {
    updated = await prisma.bilanKine.update({ where: { ...where, updatedAt: fresh.updatedAt }, data, include: { patient: { select: PATIENT_SELECT } } });
  } catch (err) {
    if (err && err.code === 'P2025') throw new DraftError('STALE_DRAFT', 409, 'Ce bilan a été modifié pendant la rédaction, recharge-le', { updatedAt: fresh.updatedAt });
    throw err;
  }

  // Temps gagné : une seule fois par bilan (première rédaction, BROUILLON → GENERE). Non bloquant.
  if (firstGeneration) activityService.logActivity(uid, 'BILAN_GENERATED');
  logger.info(`Rédaction bilan ${bilanId} : ${keys.length} section(s), ${Object.keys(warnings).length} avertissement(s)`);
  return { bilan: updated, warnings };
}

module.exports = {
  formatNarrativeMeasurements,
  tableMeasurementSummary,
  buildComposeMessages,
  buildComposeJsonSchema,
  parseComposeOutput,
  numbersIn,
  checkNumbers,
  checkTableDuplicate,
  composeForBilan,
};
