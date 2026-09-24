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
const { SECTION_KEYS, SECTION_TITLES, proseSignatures } = require('./bilanDocument');
const { DraftError, PATIENT_SELECT, loadIdentity } = require('./bilanDraftService');
const { createPseudonymizer } = require('./pseudonymService');
const { BILAN_TYPE_LABELS } = require('./bilanRenderer/format');
const { wordsToDigits, wordValues, ordinalValues } = require('../utils/frenchNumbers');
const { buildPreviousContext, loadReferenceBilan } = require('./bilanPreviousContext');

const SECTION_TEXT_MAX = 5000;

// Origine des notes : « notes » (saisies ou dictées par le kiné) ou « dialogue » (transcription
// d'une séance, lue directement par le rédacteur).
const SOURCES = ['notes', 'dialogue'];
const DIALOGUE_GUIDE = `L'entrée est la transcription d'un dialogue entre le kinésithérapeute et son patient, sans indication de locuteur : tu déduis qui parle du contenu (le kiné examine, mesure, explique et prescrit ; le patient décrit, répond, raconte). « Les notes » désignent ce dialogue. Tu ne rapportes que ce qui a été dit, avec les mots du kiné quand il formule lui-même. Ignore le hors-sujet (vie privée, organisation, stationnement) sauf s'il éclaire la plainte ou les objectifs. Une valeur corrigée par le locuteur juste après : garder la valeur finale. Le diagnostic n'est rempli que si le kiné l'a formulé ; les objectifs sont ceux énoncés par le patient et le kiné ; le traitement reprend le plan, les consignes et les exercices donnés pendant la séance.`;

const { STYLE_EXAMPLES } = require('../data/bilanStyleExamples');

// Guides de section, par type de bilan : une table de routage (spec 2026-09-23). Ils disent OÙ va
// chaque information, pas comment l'écrire — la forme et la fidélité sont énoncées une seule fois,
// dans la consigne système. Aucune consigne d'interprétation : le rédacteur met en forme, il ne
// conclut pas. Le diagnostic garde son « → chaîne vide » explicite : c'est la section la plus exposée.
const INITIAL_GUIDE = {
  anamnese: 'commence exactement par « [Prénom] [NOM], [âge] ans, » puis le métier s’il est noté, puis « consulte pour » le motif. Ensuite ce que le patient rapporte : ancienneté, circonstances d’apparition, mécanisme, évolution, ce qui soulage ou aggrave, retentissement, attentes, contexte. Rien de ce que le kiné a constaté ou mesuré lui-même.',
  antecedents: 'antécédents médicaux, chirurgicaux et traumatiques, traitements en cours',
  examen: 'ce que le kiné a constaté et mesuré lui-même le jour du bilan : observation, palpation, mobilité, qualité du mouvement, tests que les notes nomment avec leur résultat, valeurs notées. Les constats, sans conclusion.',
  limitations: 'limitations d’activité et restrictions de participation rapportées dans les notes',
  diagnostic: 'l’orientation diagnostique que les notes portent, dans les termes du kiné. Les notes n’en portent pas → chaîne vide.',
  objectifs: 'les objectifs formulés dans les notes ou par le patient',
  traitement: 'le plan, le protocole et les consignes présents dans les notes',
};

// Anamnèse commune aux bilans de suivi : même gabarit obligatoire qu'au bilan initial, un rappel en
// une seule phrase (l'histoire est déjà écrite dans le bilan précédent), puis ce que le patient
// rapporte le jour du suivi — sans quoi ces éléments des notes n'auraient aucune section.
const FOLLOW_UP_ANAMNESE = 'commence exactement par « [Prénom] [NOM], [âge] ans, » puis un rappel en une seule phrase : le motif de la prise en charge et son ancienneté, tirés du bloc « Bilan précédent ». Ensuite ce que le patient rapporte dans les notes du jour : son ressenti depuis le dernier bilan, les événements nouveaux, ses plaintes actuelles, ses attentes. Ne raconte pas à nouveau l’histoire que porte le bilan précédent (mécanisme, circonstances d’apparition). Rien de ce que le kiné a constaté ou mesuré lui-même.';

const FOLLOW_UP_ANTECEDENTS = 'les antécédents du bloc « Bilan précédent », repris tels quels, complétés de ceux qu’ajoutent les notes du jour';

const INTERMEDIAIRE_GUIDE = {
  anamnese: FOLLOW_UP_ANAMNESE,
  antecedents: FOLLOW_UP_ANTECEDENTS,
  examen: INITIAL_GUIDE.examen,
  limitations: 'limitations d’activité et restrictions de participation qui persistent, telles que les notes du jour les rapportent',
  diagnostic: 'ce que les notes du jour disent de l’évolution par rapport au bilan précédent, dans les termes du kiné. Décris l’évolution en mots : ne chiffre jamais une mesure présentée en tableau. Les notes ne disent rien de l’évolution → chaîne vide.',
  objectifs: 'les objectifs du bloc « Bilan précédent », statués si les notes les statuent, plus les nouveaux objectifs que portent les notes',
  traitement: 'ce que les notes disent de la suite du plan : ce qui est reconduit, ce qui change, les consignes du jour',
};

const FINAL_GUIDE = {
  anamnese: FOLLOW_UP_ANAMNESE,
  antecedents: FOLLOW_UP_ANTECEDENTS,
  examen: INITIAL_GUIDE.examen,
  limitations: 'limitations d’activité et restrictions de participation résiduelles rapportées dans les notes',
  diagnostic: 'ce que les notes retiennent du résultat obtenu et de ce qui persiste, dans les termes du kiné. Décris l’évolution en mots : ne chiffre jamais une mesure présentée en tableau. Rien dans les notes → chaîne vide.',
  objectifs: 'le statut final de chaque objectif du bloc « Bilan précédent », tel que les notes le donnent. Aucun objectif futur.',
  traitement: 'les conseils de sortie présents dans les notes : autonomie, entretien, reprise d’activité, critères de reconsultation',
};

const SECTION_GUIDES = { INITIAL: INITIAL_GUIDE, INTERMEDIAIRE: INTERMEDIAIRE_GUIDE, FINAL: FINAL_GUIDE };

/** Consignes du type demandé ; repli sur INITIAL pour un type inconnu (jamais d'appel sans guide). */
const getSectionGuide = (type) => SECTION_GUIDES[type] || SECTION_GUIDES.INITIAL;

// Consigne système (spec 2026-09-23) : la mission de l'ancien module, une seule règle de fidélité,
// la forme. `hasPrevious` : un bloc « Bilan précédent » accompagne les notes ; la règle de fidélité
// doit alors le nommer, sinon le modèle s'interdit de s'en servir.
function buildSystemPrompt({ hasPrevious = false } = {}) {
  const sources = hasPrevious
    ? 'les notes, le motif, le bloc « Bilan précédent » ou les mesures fournies'
    : 'les notes, le motif ou les mesures fournies';
  const previousRule = hasPrevious
    ? '\nLe bloc « Bilan précédent » décrit un bilan antérieur : sers-t\'en pour le rappel, les antécédents et l\'évolution, jamais pour décrire l\'état du jour.'
    : '';
  return `Tu mets en forme les notes d'un kinésithérapeute en un bilan kinésithérapique, en français. Tu dispatches chaque information dans la section à laquelle elle appartient et tu la reformules en phrases fluides. Tu ne résumes pas, tu ne synthétises pas, tu ne complètes pas, tu n'interprètes pas. Tu renvoies uniquement un objet JSON, avec exactement les clés demandées dans le message qui suit.

Règle de fidélité — elle prime sur tout le reste :
Tout ce que tu écris doit se trouver dans ${sources}. Rien ne s'ajoute : ni un chiffre, ni un test, ni une manœuvre, ni un signe, ni une hypothèse, ni un pronostic, ni un plan. Un élément absent des notes n'existe pas dans le bilan — y compris pour dire qu'il est négatif, normal, absent ou sans particularité. Un test que les notes déclarent explicitement non réalisé peut être rapporté comme tel. Si les notes ne disent rien pour une section, renvoie une chaîne vide "" pour cette section.${previousRule}

Forme :
- Troisième personne, présent, phrases complètes. Ni titre, ni puce, ni retour à la ligne superflu.
- Deux à quatre phrases par section, une seule si les notes sont pauvres. Les antécédents restent en forme brève.
- Chaque information n'est écrite qu'une seule fois, dans sa section.
- Écris les valeurs notées par le kiné (degrés, cotations, EVA, distances), sauf celles listées comme déjà présentées en tableau : celles-là ne sont ni citées ni chiffrées.
- Les jetons entre crochets ([NOM], [Tiers 1], [Date de naissance]…) se recopient tels quels : ne les remplace jamais, n'essaie pas de deviner ce qu'ils cachent. Les jetons [Prénom], [NOM] et [âge] de la première phrase de l'anamnèse sont un gabarit obligatoire : écris-les toujours, dans cet ordre, même si les notes ne nomment personne, même si elles portent un autre nom.

Des exemples te sont fournis : chacun montre des notes et le bilan qui en a été tiré. Imite leur forme et la façon dont ils restent collés aux notes. Ne reprends jamais leur contenu, qui concerne d'autres patients.`;
}

// Exemples du type demandé : les notes de l'exemple, puis le bilan qui en a été tiré, limité aux
// sections demandées (les autres coûtent des tokens sans rien apporter). Les notes restent complètes :
// c'est le lien notes → texte que le modèle doit voir. Libellé distinct de « Notes du kiné », qui
// désigne les vraies notes dans le même message. Un type sans exemple retombe sur ceux du bilan initial.
function formatStyleExamples(keys, type) {
  const examples = STYLE_EXAMPLES[type] || STYLE_EXAMPLES.INITIAL;
  return examples.map((ex) => [
    `Exemple — ${ex.title}`,
    'Notes de l’exemple :',
    '"""',
    ex.notes,
    '"""',
    'Bilan tiré de ces notes :',
    ...keys.map((k) => `[${SECTION_TITLES[k]}] ${ex.sections[k]}`),
  ].join('\n')).join('\n\n');
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
    'Exemples (des notes et le bilan qui en a été tiré — forme à imiter, contenu à ne jamais reprendre) :',
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

  // Une séance comme une dictée laisse ses nombres en lettres dans les notes (« cent vingt degrés »,
  // « trois sur dix », « le quatrième mois ») et la rédaction les écrit en chiffres : l'ensemble
  // autorisé les accepte, sinon chaque valeur dictée serait « non vérifiée »
  const spoken = [...numbersIn(wordsToDigits(maskedNotes)), ...wordValues(maskedNotes).map(String), ...ordinalValues(maskedNotes).map(String)];
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

// Un examen (ré)écrit par l'IA a reçu les mesures en prose du moment : on en garde l'empreinte, pour
// signaler au kiné toute mesure en prose ajoutée ou modifiée après coup (spec 2026-09-23 §6).
// Une reprise d'une autre section ne la touche pas.
const applySections = (document, texts) => ({
  ...document,
  sections: document.sections.map((s) => (texts[s.key] !== undefined ? { ...s, text: texts[s.key] } : s)),
  ...(texts.examen !== undefined ? { proseBasis: proseSignatures(document.measurements) } : {}),
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
// La colonne « aujourd'hui » de la table d'évolution porte les mesures du document rédigé, c'est-à-dire
// celles que le kiné a saisies : sans saisie, elle affiche « — ».
async function loadPreviousBlock({ prisma, kineId, bilan, catalog }) {
  const empty = { block: null, motif: null };
  if (bilan.type === 'INITIAL' || !bilan.patientId) return empty;
  const previous = await loadReferenceBilan({
    prisma, kineId, patientId: bilan.patientId, excludeId: bilan.id,
    comparisonIds: bilan.document && bilan.document.comparison ? bilan.document.comparison.previousBilanIds : undefined,
  });
  if (!previous) return empty;
  return {
    block: buildPreviousContext({ previous, currentMeasurements: bilan.document.measurements, catalog, patient: bilan.patient, at: bilan.createdAt }),
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
  // `fresh.motif` (relu, pas `bilan.motif` lu avant l'appel) est la garde anti-STALE_DRAFT : si le
  // kiné a saisi un motif pendant l'appel au modèle, celui-ci ne doit jamais être écrasé après coup
  // par un motif hérité ou déduit sur la base d'un état désormais périmé.
  const fresh = await prisma.bilanKine.findFirst({ where, select: { status: true, document: true, updatedAt: true, motif: true } });
  if (!fresh || !fresh.document) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  // L'héritage (`inheritedMotif`) n'est PAS gardé par `keys.length`, contrairement à `withMotif`
  // ci-dessus : cette garde n'existe que pour ne pas faire deviner un motif au modèle sur une
  // section isolée (« la question n'a pas de sens »). Reprendre le motif du bilan précédent est un
  // héritage déterministe et gratuit, jamais une déduction, et il n'écrase jamais un motif déjà
  // saisi (cf. `fresh.motif` ci-dessus) : rien ne justifie de le bloquer sur une reprise partielle.
  const updated = await writeDocument({ prisma, where, updatedAt: fresh.updatedAt, status: fresh.status, document: applySections(fresh.document, texts), uid, generated: true, motif: fresh.motif ? undefined : (inheritedMotif || composedMotif) });
  logger.info(`Rédaction bilan ${bilanId} : ${keys.length} section(s), ${Object.keys(warnings).length} avertissement(s)`);
  return { bilan: updated, warnings };
}

/**
 * « Rédiger avec l'IA » en un appel : rédaction des 7 sections depuis les notes, une seule écriture.
 * L'extraction est débranchée (spec 2026-09-23) : les mesures du document sont celles que le kiné a
 * saisies, rien n'y est ajouté. L'enveloppe `accepted / pending / rejected` est conservée, vide, pour
 * le front et `BilanJob.result`. Check-and-set sur l'updatedAt lu au départ : le front a flushé et
 * verrouille l'édition pendant l'appel ; toute autre modification (autre appareil) → STALE_DRAFT.
 * @throws {DraftError} BILAN_NOT_FOUND | LEGACY_BILAN | NOTES_REQUIRED | COMPOSE_FAILED | STALE_DRAFT
 */
async function composeFromNotesForBilan({ kineId, bilanId, uid, source = 'notes' }) {
  const prisma = prismaService.getInstance();
  const where = { id: bilanId, kineId, isActive: true };
  const { bilan, notes } = await loadBilanForCompose(prisma, where);
  const catalog = await getCatalog();
  if (!SOURCES.includes(source)) throw new Error(`source de rédaction inconnue : ${source}`);

  const pseudo = createPseudonymizer({ patient: bilan.patient, kine: await loadIdentity(prisma, kineId), at: bilan.createdAt });
  const { block: previous, motif: inheritedMotif } = await loadPreviousBlock({ prisma, kineId, bilan, catalog });
  // Un bilan de suivi prolonge le motif du bilan qu'il suit : inutile de le faire deviner au modèle.
  const effectiveMotif = bilan.motif || inheritedMotif;
  const composed = await composeSections({ bilanId, type: bilan.type, motif: effectiveMotif, notes, document: bilan.document, catalog, keys: SECTION_KEYS, source, pseudo, withMotif: !effectiveMotif, previous });
  const updated = await writeDocument({ prisma, where, updatedAt: bilan.updatedAt, status: bilan.status, uid, document: applySections(bilan.document, composed.texts), generated: true, motif: bilan.motif ? undefined : (inheritedMotif || composed.motif) });
  logger.info(`Rédaction depuis les notes bilan ${bilanId} : ${Object.keys(composed.warnings).length} avertissement(s)`);
  return { bilan: updated, warnings: composed.warnings, accepted: [], pending: [], rejected: 0 };
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
