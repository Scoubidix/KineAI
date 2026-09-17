// Contexte du bilan précédent fourni au rédacteur pour un bilan de suivi (spec 2026-09-17).
// `buildPreviousContext` est PUR : aucun accès base. Le harnais eval:session appelle composeSections
// sans Prisma, et le bloc doit pouvoir s'y fabriquer de la même façon qu'en production.
const { formatValue, isFilled, getMeasurements, formatDateFr, BILAN_TYPE_LABELS, measurementId } = require('./bilanRenderer/format');
const { SECTION_TITLES } = require('./bilanDocument');
const { computeAge } = require('./pseudonymService');

// L'examen et les limitations du bilan précédent décrivent un état clinique passé : les envoyer,
// c'est inviter le modèle à le confondre avec l'état du jour (frontière posée par la spec
// sections-frontières du 2026-09-13). L'objectif chiffré passe par la table d'évolution.
const CONTEXT_SECTION_KEYS = ['anamnese', 'antecedents', 'diagnostic', 'objectifs', 'traitement'];
const SECTION_CHARS_MAX = 600;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Délai en clair, calculé par le serveur : une arithmétique de dates ne se délègue pas à un LLM. */
function formatDelay(from, to) {
  const days = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS));
  if (days < 14) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `il y a ${weeks} semaines`;
  const months = Math.round(days / 30);
  return months < 24 ? `il y a ${months} mois` : `il y a ${Math.round(days / 365)} ans`;
}

/**
 * Remplace l'âge du patient à la date du bilan précédent par le jeton `[âge]`.
 * `TOKEN_TYPES` du pseudonymiseur ne couvre pas l'âge (il n'existe qu'en résolution, `[âge]` →
 * valeur) : sans ce remplacement, « 29 ans » part en clair et le modèle recopie un âge périmé.
 */
function maskAge(text, age) {
  if (age === null || age === undefined) return text;
  return text.replace(new RegExp(`\\b${age}\\s+ans\\b`, 'g'), '[âge] ans');
}

/** « Libellé (côté) : valeur précédente → valeur du jour », une ligne par mesure renseignée avant. */
function buildEvolutionLines(previousMeasurements, currentMeasurements, catalog) {
  const byKey = new Map((catalog || []).map((f) => [f.key, f]));
  const currentById = new Map((currentMeasurements || []).map((m) => [measurementId(m), m]));
  const lines = [];
  for (const p of previousMeasurements) {
    if (!isFilled(p.value)) continue;
    if (p.presentation === 'narrative') continue; // même exclusion que le tableau d'évolution imprimé
    const field = p.kind === 'canonical' ? byKey.get(p.key) : null;
    if (p.kind === 'canonical' && !field) continue; // clé retirée du catalogue
    const label = `${field ? field.label : p.label}${p.side ? ` (${p.side})` : ''}`;
    const before = field ? formatValue(field, p.value) : String(p.value);
    const now = currentById.get(measurementId(p));
    const after = now && isFilled(now.value) ? (field ? formatValue(field, now.value) : String(now.value)) : '—';
    lines.push(`- ${label} : ${before} → ${after}`);
  }
  return lines;
}

/**
 * Bloc « Bilan précédent » à insérer dans le prompt du rédacteur, ou null s'il n'y a pas de
 * référence. Le texte sort EN CLAIR : c'est l'appelant qui le masque (`pseudo.mask`), comme les notes.
 * @param {{ previous: object|null, currentMeasurements: Array, catalog: Array, patient: object|null, at: Date }} args
 * @returns {string|null}
 */
function buildPreviousContext({ previous, currentMeasurements, catalog, patient, at }) {
  if (!previous) return null;
  const parts = [
    `Bilan précédent — ${BILAN_TYPE_LABELS[previous.type] || previous.type} du ${formatDateFr(previous.createdAt)} (${formatDelay(previous.createdAt, at)})`,
  ];
  if (previous.motif) parts.push(`Motif : ${previous.motif}`);

  // Bilan hérité : `document` est null, seules les mesures de `structuredData` existent.
  const sections = new Map(((previous.document && previous.document.sections) || []).map((s) => [s.key, s.text]));
  const age = patient ? computeAge(patient.birthDate, previous.createdAt) : null;
  for (const key of CONTEXT_SECTION_KEYS) {
    const raw = String(sections.get(key) || '').trim();
    if (!raw) continue;
    const truncated = raw.length > SECTION_CHARS_MAX ? `${raw.slice(0, SECTION_CHARS_MAX)}…` : raw;
    parts.push(`[${SECTION_TITLES[key]}] ${maskAge(truncated, age)}`);
  }

  const lines = buildEvolutionLines(getMeasurements(previous), currentMeasurements, catalog);
  if (lines.length) parts.push('', 'Évolution des mesures (précédent → aujourd’hui) :', ...lines);
  return parts.join('\n');
}

const REFERENCE_SELECT = { id: true, type: true, motif: true, createdAt: true, document: true, structuredData: true };

/**
 * Bilan de référence d'un bilan de suivi — même règle que le front (`usePreviousReference`) :
 * le plus récent des bilans choisis pour la comparaison, sinon le dernier bilan ENREGISTRE du
 * patient. Filtré sur le kiné, le patient et `isActive` : `comparison.previousBilanIds` est un
 * tableau libre du document, il ne garantit rien sur l'appartenance ni sur la suppression.
 */
async function loadReferenceBilan({ prisma, kineId, patientId, excludeId, comparisonIds }) {
  if (!patientId) return null;
  // Sélection volontairement vidée par le kiné (le front écrit `previousBilanIds: []` quand il
  // retire la comparaison) : on ne devine pas de référence, même règle que `usePreviousReference`.
  if (Array.isArray(comparisonIds) && comparisonIds.length === 0) return null;
  const base = { kineId, patientId, isActive: true };
  const ids = (Array.isArray(comparisonIds) ? comparisonIds : []).filter(Number.isInteger);
  const where = ids.length
    ? { ...base, status: { not: 'BROUILLON' }, id: { in: ids, not: excludeId } }
    : { ...base, status: 'ENREGISTRE', id: { not: excludeId } };
  const rows = await prisma.bilanKine.findMany({ where, select: REFERENCE_SELECT, orderBy: { createdAt: 'desc' }, take: 1 });
  return rows[0] || null;
}

module.exports = { buildPreviousContext, loadReferenceBilan };
