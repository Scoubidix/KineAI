// Rédaction IA des sections narratives du bilan (spec §6.2).
// Les mesures « table » ne sont jamais transmises au modèle ; chaque nombre écrit doit
// apparaître dans les notes, le motif ou les mesures narratives, sinon la section est signalée.
const { z } = require('zod');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { logMasked } = require('../utils/pseudonymDebug');
const llmService = require('./llmService');
const activityService = require('./activityService');
const { getCatalog } = require('./bilanRenderService');
const { SECTION_KEYS, SECTION_TITLES } = require('./bilanDocument');
const { DraftError, PATIENT_SELECT, loadIdentity } = require('./bilanDraftService');
const { createPseudonymizer } = require('./pseudonymService');
const { BILAN_TYPE_LABELS } = require('./bilanRenderer/format');
const extractionService = require('./bilanExtractionService');
const { wordsToDigits, wordValues, ordinalValues } = require('../utils/frenchNumbers');

const SECTION_TEXT_MAX = 5000;

// Origine des notes : « notes » (saisies ou dictées par le kiné) ou « dialogue » (transcription
// d'une séance, lue directement par le rédacteur).
const SOURCES = ['notes', 'dialogue'];
const DIALOGUE_GUIDE = `L'entrée est la transcription d'un dialogue entre le kinésithérapeute et son patient, sans indication de locuteur : tu déduis qui parle du contenu (le kiné examine, mesure, explique et prescrit ; le patient décrit, répond, raconte). « Les notes » désignent ce dialogue. Tu ne rapportes que ce qui a été dit, avec les mots du kiné quand il formule lui-même. Ignore le hors-sujet (vie privée, organisation, stationnement) sauf s'il éclaire la plainte ou les objectifs. Une valeur corrigée par le locuteur juste après : garder la valeur finale. Le diagnostic n'est rempli que si le kiné l'a formulé ; les objectifs sont ceux énoncés par le patient et le kiné ; le traitement reprend le plan, les consignes et les exercices donnés pendant la séance.`;

const { STYLE_PRINCIPLES, STYLE_EXAMPLES } = require('../data/bilanStyleExamples');

const SECTION_GUIDE = {
  anamnese: 'commence exactement par « [Prénom] [NOM], [âge] ans, » puis le métier s\'il est connu, puis « consulte pour » le motif de consultation avec les détails disponibles (ancienneté, circonstances d\'apparition, mécanisme). Ensuite ce que les notes disent du patient : activités, sport, loisirs, contexte de travail. Puis l\'histoire de la plainte et les attentes du patient. Recopie les jetons entre crochets tels quels, n\'écris jamais un nom.',
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
- Les jetons entre crochets ([NOM], [Tiers 1], [Date de naissance]…) désignent des personnes ou des données masquées : recopie-les tels quels, ne les remplace jamais, n'essaie pas de deviner ce qu'ils cachent.
- Exception : les jetons d'identité [Prénom], [NOM] et [âge] de la première phrase de l'anamnèse ne sont pas des informations à retrouver dans les notes : ce sont un gabarit obligatoire. Écris-les toujours, dans cet ordre, même si les notes ne nomment personne, même si elles portent un autre nom.
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

function buildComposeMessages({ type, motif, rawNotes, lines, tableLabels, keys, source = 'notes' }) {
  const dialogue = source === 'dialogue';
  const user = [
    `Type de bilan : ${BILAN_TYPE_LABELS[type] || type}`,
    `Motif : ${motif || '(non renseigné)'}`,
    '',
    dialogue ? 'Transcription de la séance :' : 'Notes du kiné :',
    '"""',
    rawNotes,
    '"""',
    '',
    ...(dialogue ? [DIALOGUE_GUIDE, ''] : []),
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
 * Appel du modèle et contrôles, sans accès base : partagé par composeForBilan et
 * composeFromNotesForBilan. Renvoie les textes tronqués et les avertissements par section.
 * @throws {DraftError} COMPOSE_FAILED
 */
async function composeSections({ bilanId, type, motif, notes, document, catalog, keys, source = 'notes', pseudo }) {
  const maskedNotes = pseudo ? pseudo.mask(notes) : notes;
  const maskedMotif = pseudo ? pseudo.mask(motif || '') : motif;
  const lines = formatNarrativeMeasurements(document.measurements, catalog).map((l) => (pseudo ? pseudo.mask(l) : l));
  const table = tableMeasurementSummary(document.measurements, catalog);
  // Un libellé de mesure personnalisée est du texte libre (tapé par le kiné ou rédigé par le modèle
  // puis réhydraté) : il part masqué comme le reste. `table.entries`, qui ne sert qu'à la détection
  // de doublon, reste sur le texte réel — un nom n'y change rien.
  const tableLabels = pseudo ? table.labels.map((l) => pseudo.mask(l)) : table.labels;
  const messages = buildComposeMessages({ type, motif: maskedMotif, rawNotes: maskedNotes, lines, tableLabels, keys, source });
  logMasked(`rédaction (bilan ${bilanId}, ${source})`, `Motif : ${maskedMotif || '(aucun)'}\n${maskedNotes}${lines.length ? `\nMesures : ${lines.join(' ; ')}` : ''}`, pseudo);
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

  // Un dialogue porte ses nombres en lettres (« trois sur dix », « le quatrième mois ») : l'ensemble
  // autorisé les accepte aussi, sinon chaque valeur serait « non vérifiée »
  const spoken = source === 'dialogue' ? [...numbersIn(wordsToDigits(maskedNotes)), ...wordValues(maskedNotes).map(String), ...ordinalValues(maskedNotes).map(String)] : [];
  const allowed = new Set([...numbersIn(maskedNotes), ...numbersIn(maskedMotif), ...lines.flatMap(numbersIn), ...spoken]);
  const texts = {};
  const warnings = {};
  for (const k of keys) {
    const t = String(output.sections[k] ?? '').trim().slice(0, SECTION_TEXT_MAX);
    // Les contrôles tournent sur le texte masqué : la réhydratation (âge, nom) vient après,
    // elle ne doit pas être signalée comme « non vérifiée ».
    const w = checkNumbers(t, allowed) || checkTableDuplicate(t, table.entries);
    if (w) warnings[k] = w;
    texts[k] = pseudo ? pseudo.unmask(t) : t;
  }
  return { texts, warnings };
}

// Lecture et gardes communes aux deux rédactions
async function loadBilanForCompose(prisma, where) {
  const bilan = await prisma.bilanKine.findFirst({ where, select: { id: true, type: true, status: true, rawNotes: true, motif: true, document: true, updatedAt: true, createdAt: true, patient: { select: { firstName: true, lastName: true, birthDate: true } } } });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (!bilan.document) throw new DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être rédigés par l’IA');
  if (bilan.status === 'ENREGISTRE') throw new DraftError('ALREADY_FINALIZED', 409, 'Ce bilan est déjà enregistré');
  const notes = (bilan.rawNotes || '').trim();
  if (!notes) throw new DraftError('NOTES_REQUIRED', 400, 'Saisis des notes avant de lancer la rédaction');
  return { bilan, notes };
}

const applySections = (document, texts) => ({
  ...document,
  sections: document.sections.map((s) => (texts[s.key] !== undefined ? { ...s, text: texts[s.key] } : s)),
});

// Écriture check-and-set sur updatedAt. `generated` : des sections sont écrites → BROUILLON passe
// GENERE et le temps gagné est compté (une seule fois par bilan). Non bloquant.
async function writeDocument({ prisma, where, updatedAt, status, document, uid, generated }) {
  const firstGeneration = generated && status === 'BROUILLON';
  const data = firstGeneration ? { document, status: 'GENERE' } : { document };
  let updated;
  try {
    updated = await prisma.bilanKine.update({ where: { ...where, updatedAt }, data, include: { patient: { select: PATIENT_SELECT } } });
  } catch (err) {
    if (err && err.code === 'P2025') throw new DraftError('STALE_DRAFT', 409, 'Ce bilan a été modifié pendant la rédaction, recharge-le', { updatedAt });
    throw err;
  }
  if (firstGeneration) activityService.logActivity(uid, 'BILAN_GENERATED');
  return updated;
}

/**
 * Rédige les sections demandées (défaut : les 7) et les écrit dans le document.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | ALREADY_FINALIZED | NOTES_REQUIRED | COMPOSE_FAILED | STALE_DRAFT
 */
async function composeForBilan({ kineId, bilanId, sections, uid }) {
  const prisma = prismaService.getInstance();
  const where = { id: bilanId, kineId, isActive: true };
  const { bilan, notes } = await loadBilanForCompose(prisma, where);

  // Ordre canonique, doublons ignorés, clés inconnues ignorées (déjà filtrées par Zod en route)
  const keys = Array.isArray(sections) && sections.length ? SECTION_KEYS.filter((k) => sections.includes(k)) : SECTION_KEYS;
  const catalog = await getCatalog();
  const pseudo = createPseudonymizer({ patient: bilan.patient, kine: await loadIdentity(prisma, kineId), at: bilan.createdAt });
  const { texts, warnings } = await composeSections({ bilanId, type: bilan.type, motif: bilan.motif, notes, document: bilan.document, catalog, keys, pseudo });

  // L'appel IA a duré plusieurs secondes : on relit la version la plus fraîche et on ne
  // remplace que les sections demandées, en check-and-set sur updatedAt (comme l'autosave).
  const fresh = await prisma.bilanKine.findFirst({ where, select: { status: true, document: true, updatedAt: true } });
  if (!fresh || !fresh.document) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (fresh.status === 'ENREGISTRE') throw new DraftError('ALREADY_FINALIZED', 409, 'Ce bilan est déjà enregistré');
  const updated = await writeDocument({ prisma, where, updatedAt: fresh.updatedAt, status: fresh.status, document: applySections(fresh.document, texts), uid, generated: true });
  logger.info(`Rédaction bilan ${bilanId} : ${keys.length} section(s), ${Object.keys(warnings).length} avertissement(s)`);
  return { bilan: updated, warnings };
}

/**
 * « Rédiger avec l'IA » en un appel : extraction, acceptation automatique, rédaction des 7 sections,
 * une seule écriture. Check-and-set sur l'updatedAt lu au départ : le front a flushé et verrouille
 * l'édition pendant l'appel ; toute autre modification (autre appareil) → STALE_DRAFT.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | ALREADY_FINALIZED | NOTES_REQUIRED | EXTRACTION_FAILED | COMPOSE_FAILED | STALE_DRAFT
 */
async function composeFromNotesForBilan({ kineId, bilanId, uid, source = 'notes' }) {
  const prisma = prismaService.getInstance();
  const where = { id: bilanId, kineId, isActive: true };
  const { bilan, notes } = await loadBilanForCompose(prisma, where);
  const catalog = await getCatalog();
  if (!SOURCES.includes(source)) throw new Error(`source de rédaction inconnue : ${source}`);

  const pseudo = createPseudonymizer({ patient: bilan.patient, kine: await loadIdentity(prisma, kineId), at: bilan.createdAt });
  const { candidates, rejected } = await extractionService.extractFromText({ rawNotes: notes, motif: bilan.motif, catalog, document: bilan.document, logContext: `bilan ${bilanId}`, pseudo });
  const { document: withMeasures, accepted, pending } = extractionService.applyCandidates(bilan.document, candidates);
  const base = { prisma, where, updatedAt: bilan.updatedAt, status: bilan.status, uid };

  let composed;
  try {
    composed = await composeSections({ bilanId, type: bilan.type, motif: bilan.motif, notes, document: withMeasures, catalog, keys: SECTION_KEYS, source, pseudo });
  } catch (err) {
    // Les mesures acceptées ne sont pas perdues : écrites seules, le kiné relance la rédaction
    if (err instanceof DraftError && err.code === 'COMPOSE_FAILED' && accepted.length > 0) {
      await writeDocument({ ...base, document: withMeasures, generated: false });
      throw new DraftError('COMPOSE_FAILED', 502, 'Mesures ajoutées, mais la rédaction a échoué : réessaie dans un instant', { measurementsSaved: true });
    }
    throw err;
  }
  const updated = await writeDocument({ ...base, document: applySections(withMeasures, composed.texts), generated: true });
  logger.info(`Rédaction depuis les notes bilan ${bilanId} : ${accepted.length} acceptée(s), ${pending.length} en suspens, ${rejected} rejetée(s), ${Object.keys(composed.warnings).length} avertissement(s)`);
  return { bilan: updated, warnings: composed.warnings, accepted, pending, rejected };
}

module.exports = {
  SECTION_GUIDE,
  SOURCES,
  composeSections,
  formatNarrativeMeasurements,
  tableMeasurementSummary,
  buildComposeMessages,
  buildComposeJsonSchema,
  parseComposeOutput,
  numbersIn,
  checkNumbers,
  checkTableDuplicate,
  composeForBilan,
  composeFromNotesForBilan,
};
