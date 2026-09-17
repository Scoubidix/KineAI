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
const { buildPreviousContext, loadReferenceBilan } = require('./bilanPreviousContext');

const SECTION_TEXT_MAX = 5000;

// Origine des notes : « notes » (saisies ou dictées par le kiné) ou « dialogue » (transcription
// d'une séance, lue directement par le rédacteur).
const SOURCES = ['notes', 'dialogue'];
const DIALOGUE_GUIDE = `L'entrée est la transcription d'un dialogue entre le kinésithérapeute et son patient, sans indication de locuteur : tu déduis qui parle du contenu (le kiné examine, mesure, explique et prescrit ; le patient décrit, répond, raconte). « Les notes » désignent ce dialogue. Tu ne rapportes que ce qui a été dit, avec les mots du kiné quand il formule lui-même. Ignore le hors-sujet (vie privée, organisation, stationnement) sauf s'il éclaire la plainte ou les objectifs. Une valeur corrigée par le locuteur juste après : garder la valeur finale. Le diagnostic n'est rempli que si le kiné l'a formulé ; les objectifs sont ceux énoncés par le patient et le kiné ; le traitement reprend le plan, les consignes et les exercices donnés pendant la séance.`;

const { STYLE_PRINCIPLES, STYLE_EXAMPLES } = require('../data/bilanStyleExamples');

// Consignes de rédaction, par type de bilan (spec 2026-09-17). INITIAL reprend les consignes
// historiques mot pour mot : c'est le cas le plus courant, il ne doit pas bouger.
const INITIAL_GUIDE = {
  anamnese: 'commence exactement par « [Prénom] [NOM], [âge] ans, » puis le métier s’il est connu, puis « consulte pour » le motif. Ensuite, et seulement : l’ancienneté et les circonstances d’apparition, le mécanisme, l’évolution depuis le début (traitements essayés, ce qui soulage ou aggrave), le retentissement tel que le patient l’exprime, en une phrase, et ses attentes. Le contexte du patient (activités, sport, travail) quand les notes le donnent. Rien de ce que le kiné a constaté ou mesuré lui-même : aucun signe d’examen, aucun test, aucune valeur — cela appartient à l’examen clinique. Recopie les jetons entre crochets tels quels, n’écris jamais un nom.',
  antecedents: 'antécédents et traitements réellement rapportés, en une phrase',
  examen: 'ce que le kiné a constaté et mesuré lui-même le jour du bilan, et cela seulement : observation, palpation, qualité du mouvement, tests positifs ou négatifs qui orientent. C’est ici, et nulle part ailleurs, que les signes actuels sont décrits. Synthèse interprétative : ce que les signes et les tests, nommés sans leurs valeurs, suggèrent ensemble.',
  limitations: 'uniquement les limitations d\'activité et restrictions de participation rapportées dans les notes ; sinon chaîne vide',
  diagnostic: 'hypothèse kinésithérapique : déficiences, limitations, restrictions, deux ou trois dominantes, pronostic prudent',
  objectifs: 'uniquement les objectifs formulés dans les notes ou par le patient, à court, moyen et long terme ; sinon chaîne vide',
  traitement: 'uniquement le plan, le protocole ou les consignes présents dans les notes ; sinon chaîne vide',
};

// Rappel d'identité commun aux bilans de suivi : même gabarit obligatoire qu'au bilan initial,
// mais une seule phrase de rappel derrière — l'histoire est déjà écrite dans le bilan précédent.
const FOLLOW_UP_ANAMNESE = 'commence exactement par « [Prénom] [NOM], [âge] ans, » puis un rappel en une seule phrase : le motif de la prise en charge et son ancienneté, tirés du bloc « Bilan précédent ». Rien d’autre : ni le mécanisme, ni les circonstances d’apparition, ni l’histoire détaillée, que le bilan précédent porte déjà. Aucun signe d’examen, aucune valeur. Recopie les jetons entre crochets tels quels, n’écris jamais un nom.';

const FOLLOW_UP_ANTECEDENTS = 'les antécédents du bloc « Bilan précédent », repris tels quels. Complète seulement si les notes du jour en ajoutent un. Ni bilan précédent ni notes → chaîne vide.';

const INTERMEDIAIRE_GUIDE = {
  anamnese: FOLLOW_UP_ANAMNESE,
  antecedents: FOLLOW_UP_ANTECEDENTS,
  examen: INITIAL_GUIDE.examen,
  limitations: 'uniquement les limitations d’activité et restrictions de participation qui persistent, telles que rapportées dans les notes du jour ; sinon chaîne vide',
  diagnostic: 'où en est la prise en charge par rapport au bilan précédent : ce qui a progressé, ce qui stagne, ce qui reste à traiter. Deux ou trois dominantes, pronostic prudent. Décris l’évolution en mots (« gain net de flexion », « douleur nettement diminuée ») : ne chiffre jamais une mesure présentée en tableau.',
  objectifs: 'les objectifs du bloc « Bilan précédent », repris et statués : atteints, maintenus, révisés. Plus les nouveaux objectifs énoncés dans les notes. Rien dans le bilan précédent ni dans les notes → chaîne vide.',
  traitement: 'la suite du plan : ce qui est reconduit, ce qui change, les consignes données le jour du bilan — uniquement à partir des notes et du plan du bilan précédent ; sinon chaîne vide',
};

const FINAL_GUIDE = {
  anamnese: FOLLOW_UP_ANAMNESE,
  antecedents: FOLLOW_UP_ANTECEDENTS,
  examen: INITIAL_GUIDE.examen,
  limitations: 'uniquement les limitations d’activité et restrictions de participation résiduelles, telles que rapportées dans les notes ; aucune → chaîne vide',
  diagnostic: 'synthèse du parcours et résultat obtenu au regard des objectifs du bilan précédent. Ce qui est récupéré, ce qui reste. Décris l’évolution en mots : ne chiffre jamais une mesure présentée en tableau.',
  objectifs: 'statut final de chaque objectif du bloc « Bilan précédent » : atteint, partiellement atteint, non atteint. N\'énonce aucun objectif futur ; sinon chaîne vide',
  traitement: 'conseils de sortie : autonomie, entretien, reprise d’activité, critères de reconsultation — uniquement ce que les notes contiennent ; sinon chaîne vide',
};

const SECTION_GUIDES = { INITIAL: INITIAL_GUIDE, INTERMEDIAIRE: INTERMEDIAIRE_GUIDE, FINAL: FINAL_GUIDE };

/** Consignes du type demandé ; repli sur INITIAL pour un type inconnu (jamais d'appel sans guide). */
const getSectionGuide = (type) => SECTION_GUIDES[type] || SECTION_GUIDES.INITIAL;

// `hasPrevious` : un bloc « Bilan précédent » accompagne les notes. La règle « uniquement les notes »
// doit alors le nommer, sinon le modèle s'interdit de s'en servir.
function buildSystemPrompt({ hasPrevious = false } = {}) {
  const sources = hasPrevious
    ? `- Tu n'utilises QUE les informations présentes dans les notes, le motif, les mesures fournies et le bloc « Bilan précédent ». Interdiction d'inventer, de supposer ou de compléter.\n- Le bloc « Bilan précédent » décrit un bilan antérieur : sers-t'en pour le rappel, les antécédents et l'évolution, jamais pour décrire l'état du jour.`
    : `- Tu n'utilises QUE les informations présentes dans les notes, le motif et les mesures fournies. Interdiction d'inventer, de supposer ou de compléter.`;
  return `Tu rédiges des bilans diagnostiques kinésithérapiques (BDK) pour un kinésithérapeute, en français. Tu renvoies uniquement un objet JSON, avec exactement les clés demandées dans le message qui suit.
Règles absolues :
${sources}
- Interdiction d'écrire un chiffre qui n'apparaît pas dans les notes ou dans les mesures fournies.
- Si les notes ne contiennent rien pour une section, renvoie une chaîne vide "" pour cette section. Si elles ne contiennent que des mesures, une phrase de synthèse suffit.
- Pas de titre, pas de puces, pas de retour à la ligne superflu.
- Les mesures listées comme « déjà présentées en tableau » ne doivent pas être chiffrées dans le texte ; un test peut être nommé quand il sert le raisonnement.
- Chaque information n’est écrite qu’une seule fois, dans la section à laquelle elle appartient. Ne reprends pas dans une section ce qu’une autre porte déjà. Seul le diagnostic kinésithérapique peut relier des éléments déjà écrits ailleurs, sans les redécrire.
- Les jetons entre crochets ([NOM], [Tiers 1], [Date de naissance]…) désignent des personnes ou des données masquées : recopie-les tels quels, ne les remplace jamais, n'essaie pas de deviner ce qu'ils cachent.
- Exception : les jetons d'identité [Prénom], [NOM] et [âge] de la première phrase de l'anamnèse ne sont pas des informations à retrouver dans les notes : ce sont un gabarit obligatoire. Écris-les toujours, dans cet ordre, même si les notes ne nomment personne, même si elles portent un autre nom.
Style attendu :
${STYLE_PRINCIPLES.map((p) => `- ${p}`).join('\n')}
Des exemples de style te sont fournis : imite leur forme, leur longueur et leur façon de raisonner ; ne reprends jamais leur contenu, qui concerne d'autres patients. Leurs sections sont toutes remplies parce que leurs notes l'étaient : si les notes ne disent rien pour une section, en particulier limitations, objectifs et traitement, laisse-la vide plutôt que de proposer un plan.`;
}

// Exemples de style du type demandé, limités aux sections demandées (les autres n'apportent rien
// et coûtent des tokens). Un type sans exemple retombe sur ceux du bilan initial.
function formatStyleExamples(keys, type) {
  const examples = STYLE_EXAMPLES[type] || STYLE_EXAMPLES.INITIAL;
  return examples.map((ex) => [`Exemple — ${ex.title} :`, ...keys.map((k) => `[${SECTION_TITLES[k]}] ${ex.sections[k]}`)].join('\n')).join('\n\n');
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

const MAX_MOTIF_WORDS = 4;
const MAX_MOTIF_CHARS = 80;

/**
 * Assainit un motif proposé par un modèle : 4 mots maximum, espaces normalisés, ponctuation
 * finale retirée. Un jeton de pseudonymisation ([Libellé] ou [Libellé n]) ne peut pas figurer
 * dans un motif : sa présence signe un artefact du modèle, on rejette tout. Appelé AVANT toute
 * réhydratation, sans quoi un jeton deviendrait une identité réelle avant d'être détecté.
 * @returns {string} le motif, ou '' s'il est inexploitable
 */
function sanitizeMotif(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s || /[[\]]/.test(s)) return '';
  const words = s.split(' ').slice(0, MAX_MOTIF_WORDS).join(' ');
  return words.replace(/[.,;:!?]+$/, '').trim().slice(0, MAX_MOTIF_CHARS);
}

function buildComposeMessages({ type, motif, rawNotes, lines, tableLabels, keys, source = 'notes', withMotif = false, previous = null }) {
  const dialogue = source === 'dialogue';
  const guide = getSectionGuide(type);
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
    ...(previous ? [previous, ''] : []),
    'Mesures à intégrer en prose (déjà validées par le kiné) :',
    lines.length ? lines.map((l) => `- ${l}`).join('\n') : '(aucune)',
    '',
    'Mesures déjà présentées en tableau (ne les cite pas, ni leur valeur) :',
    tableLabels.length ? tableLabels.map((l) => `- ${l}`).join('\n') : '(aucune)',
    '',
    ...(withMotif ? ['Réponds par { "motif": "…", "sections": { … } }. Ce bilan n’a pas encore de motif : le motif de consultation en 4 mots maximum, tiré des notes (ex. « Lombalgie chronique », « Suites de PTG »). Pas de phrase, pas de verbe conjugué, jamais le nom ni le prénom du patient. Si les notes ne permettent pas de le déterminer, renvoie "".', ''] : ['Réponds par { "sections": { … } }.', ''] ),
    'Sections à rédiger (clé : titre — contenu attendu) :',
    keys.map((k) => `- ${k} : ${SECTION_TITLES[k]} — ${guide[k]}`).join('\n'),
    '',
    'Exemples de style (forme à imiter, contenu à ne jamais reprendre) :',
    formatStyleExamples(keys, type),
  ].join('\n');
  return [{ role: 'system', content: buildSystemPrompt({ hasPrevious: Boolean(previous) }) }, { role: 'user', content: user }];
}

// Schéma strict limité aux clés demandées
function buildComposeJsonSchema(keys, withMotif = false) {
  return {
    name: 'bilan_compose',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: withMotif ? ['sections', 'motif'] : ['sections'],
      properties: {
        ...(withMotif ? { motif: { type: 'string' } } : {}),
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

// `motif` est facultatif et vaut '' par défaut : Zod retire les clés non déclarées, et la voie
// Mistral (json_object, sans schéma strict) peut l'omettre — son absence ne doit jamais faire
// échouer une rédaction.
const composeOutputSchema = z.object({ sections: z.record(z.string(), z.string()), motif: z.string().default('') });

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
async function composeSections({ bilanId, type, motif, notes, document, catalog, keys, source = 'notes', pseudo, withMotif = false, previous = null }) {
  const maskedNotes = pseudo ? pseudo.mask(notes) : notes;
  const maskedMotif = pseudo ? pseudo.mask(motif || '') : motif;
  // Le bloc antérieur est du texte relu de la base, identités résolues : il part masqué comme les notes.
  const maskedPrevious = previous ? (pseudo ? pseudo.mask(previous) : previous) : null;
  const lines = formatNarrativeMeasurements(document.measurements, catalog).map((l) => (pseudo ? pseudo.mask(l) : l));
  const table = tableMeasurementSummary(document.measurements, catalog);
  // Un libellé de mesure personnalisée est du texte libre (tapé par le kiné ou rédigé par le modèle
  // puis réhydraté) : il part masqué comme le reste. `table.entries`, qui ne sert qu'à la détection
  // de doublon, reste sur le texte réel — un nom n'y change rien.
  const tableLabels = pseudo ? table.labels.map((l) => pseudo.mask(l)) : table.labels;
  const messages = buildComposeMessages({ type, motif: maskedMotif, rawNotes: maskedNotes, lines, tableLabels, keys, source, withMotif, previous: maskedPrevious });
  logMasked(`rédaction (bilan ${bilanId}, ${source})`, `Motif : ${maskedMotif || '(aucun)'}\n${maskedNotes}${maskedPrevious ? `\n${maskedPrevious}` : ''}${lines.length ? `\nMesures : ${lines.join(' ; ')}` : ''}`, pseudo);
  const jsonSchema = buildComposeJsonSchema(keys, withMotif);

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
  const allowed = new Set([...numbersIn(maskedNotes), ...numbersIn(maskedMotif), ...numbersIn(maskedPrevious || ''), ...lines.flatMap(numbersIn), ...spoken]);
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
  // Assaini sans réhydratation : un motif contenant un jeton est rejeté, donc celui qui sort
  // ne porte aucune identité masquée et n'a rien à réhydrater.
  return { texts, warnings, motif: withMotif ? sanitizeMotif(output.motif) : '' };
}

// Lecture et gardes communes aux deux rédactions
async function loadBilanForCompose(prisma, where) {
  const bilan = await prisma.bilanKine.findFirst({ where, select: { id: true, type: true, status: true, rawNotes: true, motif: true, document: true, updatedAt: true, createdAt: true, patientId: true, patient: { select: { firstName: true, lastName: true, birthDate: true } } } });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (!bilan.document) throw new DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être rédigés par l’IA');
  // Un bilan enregistré reste rédigeable : il se corrige comme un document vivant. `writeDocument`
  // ne promeut que BROUILLON → GENERE, le statut ENREGISTRE n'est donc jamais rétrogradé.
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
async function writeDocument({ prisma, where, updatedAt, status, document, uid, generated, motif }) {
  const firstGeneration = generated && status === 'BROUILLON';
  const data = firstGeneration ? { document, status: 'GENERE' } : { document };
  // Motif hérité du bilan précédent ou déduit par la rédaction : n'est transmis que si le bilan
  // n'en avait pas déjà un (cf. appelants).
  if (motif) data.motif = motif;
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

// Bloc « Bilan précédent » d'un bilan de suivi, et motif de la référence (repris tel quel par un
// bilan de suivi qui n'a pas encore le sien). Chargé ici et non dans `composeSections` : le
// harnais eval:session appelle `composeSections` sans Prisma.
// `currentMeasurements` est explicite : la colonne « aujourd'hui » de la table d'évolution doit
// décrire le document RÉELLEMENT rédigé. Sur « Rédiger avec l'IA », c'est le document d'APRÈS
// extraction — sans quoi toute mesure tirée des notes du jour s'afficherait « — ».
async function loadPreviousBlock({ prisma, kineId, bilan, catalog, currentMeasurements }) {
  const empty = { block: null, motif: null };
  if (bilan.type === 'INITIAL' || !bilan.patientId) return empty;
  const previous = await loadReferenceBilan({
    prisma, kineId, patientId: bilan.patientId, excludeId: bilan.id,
    comparisonIds: bilan.document && bilan.document.comparison ? bilan.document.comparison.previousBilanIds : undefined,
  });
  if (!previous) return empty;
  return {
    block: buildPreviousContext({ previous, currentMeasurements: currentMeasurements ?? bilan.document.measurements, catalog, patient: bilan.patient, at: bilan.createdAt }),
    motif: previous.motif || null,
  };
}

/**
 * Rédige les sections demandées (défaut : les 7) et les écrit dans le document.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | NOTES_REQUIRED | COMPOSE_FAILED | STALE_DRAFT
 */
async function composeForBilan({ kineId, bilanId, sections, uid }) {
  const prisma = prismaService.getInstance();
  const where = { id: bilanId, kineId, isActive: true };
  const { bilan, notes } = await loadBilanForCompose(prisma, where);

  // Ordre canonique, doublons ignorés, clés inconnues ignorées (déjà filtrées par Zod en route)
  const keys = Array.isArray(sections) && sections.length ? SECTION_KEYS.filter((k) => sections.includes(k)) : SECTION_KEYS;
  const catalog = await getCatalog();
  const { block: previous, motif: inheritedMotif } = await loadPreviousBlock({ prisma, kineId, bilan, catalog });
  const pseudo = createPseudonymizer({ patient: bilan.patient, kine: await loadIdentity(prisma, kineId), at: bilan.createdAt });
  // Un bilan de suivi prolonge le motif du bilan qu'il suit : inutile de le faire deviner au modèle.
  const effectiveMotif = bilan.motif || inheritedMotif;
  // Un motif ne se déduit que d'une rédaction complète : sur une section reprise seule, la question n'a pas de sens
  const withMotif = !effectiveMotif && keys.length === SECTION_KEYS.length;
  const { texts, warnings, motif: composedMotif } = await composeSections({ bilanId, type: bilan.type, motif: effectiveMotif, notes, document: bilan.document, catalog, keys, pseudo, withMotif, previous });

  // L'appel IA a duré plusieurs secondes : on relit la version la plus fraîche et on ne
  // remplace que les sections demandées, en check-and-set sur updatedAt (comme l'autosave).
  const fresh = await prisma.bilanKine.findFirst({ where, select: { status: true, document: true, updatedAt: true, motif: true } });
  if (!fresh || !fresh.document) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  const updated = await writeDocument({ prisma, where, updatedAt: fresh.updatedAt, status: fresh.status, document: applySections(fresh.document, texts), uid, generated: true, motif: fresh.motif ? undefined : (inheritedMotif || composedMotif) });
  logger.info(`Rédaction bilan ${bilanId} : ${keys.length} section(s), ${Object.keys(warnings).length} avertissement(s)`);
  return { bilan: updated, warnings };
}

/**
 * « Rédiger avec l'IA » en un appel : extraction, acceptation automatique, rédaction des 7 sections,
 * une seule écriture. Check-and-set sur l'updatedAt lu au départ : le front a flushé et verrouille
 * l'édition pendant l'appel ; toute autre modification (autre appareil) → STALE_DRAFT.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | NOTES_REQUIRED | EXTRACTION_FAILED | COMPOSE_FAILED | STALE_DRAFT
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
  // Après l'extraction : la colonne « aujourd'hui » doit porter les mesures qu'on est en train d'écrire.
  const { block: previous, motif: inheritedMotif } = await loadPreviousBlock({ prisma, kineId, bilan, catalog, currentMeasurements: withMeasures.measurements });
  // Un bilan de suivi prolonge le motif du bilan qu'il suit : inutile de le faire deviner au modèle.
  const effectiveMotif = bilan.motif || inheritedMotif;
  const base = { prisma, where, updatedAt: bilan.updatedAt, status: bilan.status, uid };

  let composed;
  try {
    composed = await composeSections({ bilanId, type: bilan.type, motif: effectiveMotif, notes, document: withMeasures, catalog, keys: SECTION_KEYS, source, pseudo, withMotif: !effectiveMotif, previous });
  } catch (err) {
    // Les mesures acceptées ne sont pas perdues : écrites seules, le kiné relance la rédaction
    if (err instanceof DraftError && err.code === 'COMPOSE_FAILED' && accepted.length > 0) {
      await writeDocument({ ...base, document: withMeasures, generated: false });
      throw new DraftError('COMPOSE_FAILED', 502, 'Mesures ajoutées, mais la rédaction a échoué : réessaie dans un instant', { measurementsSaved: true });
    }
    throw err;
  }
  const updated = await writeDocument({ ...base, document: applySections(withMeasures, composed.texts), generated: true, motif: bilan.motif ? undefined : (inheritedMotif || composed.motif) });
  logger.info(`Rédaction depuis les notes bilan ${bilanId} : ${accepted.length} acceptée(s), ${pending.length} en suspens, ${rejected} rejetée(s), ${Object.keys(composed.warnings).length} avertissement(s)`);
  return { bilan: updated, warnings: composed.warnings, accepted, pending, rejected };
}

module.exports = {
  SECTION_GUIDES,
  getSectionGuide,
  buildSystemPrompt,
  MAX_MOTIF_WORDS,
  sanitizeMotif,
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
  loadPreviousBlock,
  composeForBilan,
  composeFromNotesForBilan,
};
