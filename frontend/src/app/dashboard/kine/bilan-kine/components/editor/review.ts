import type { BilanDocument, CanonicalValue, DocumentMeasurement, ExtractionReason, ReviewCandidate, Side } from '@/types/bilan';
import { measurementIdentity } from './suggestions';

/** Réponse du kiné à une ligne à vérifier : la garder (côté et/ou résultat choisis) ou ne pas la reprendre */
export type Resolution =
  | { kind: 'keep'; side?: Side | 'DG'; value?: CanonicalValue }
  | { kind: 'dismiss' };

/** Libellés des raisons, montrés sur la ligne à vérifier (spec 2026-09-26 §2) */
export const REASON_LABELS: Record<ExtractionReason, string> = {
  name_absent: 'Le nom du test n’est pas écrit dans la citation',
  value_absent: 'La valeur n’est pas écrite dans la citation',
  result_contradicted: 'Tes notes disent le contraire',
  result_uncertain: 'Résultat incertain',
  side_absent: 'Le côté n’est pas écrit',
  side_contradicted: 'Tes notes indiquent l’autre côté',
  conflict: 'Une autre valeur est déjà saisie',
  out_of_range: 'Valeur inhabituelle, à ressaisir',
  low_confidence: 'Correspondance incertaine avec le catalogue',
};

// Borne du schéma serveur (`review.dismissed`) : au-delà, l'autosave serait refusé
const DISMISSED_MAX = 200;

const rowOf = (c: ReviewCandidate, side: Side | null, value: CanonicalValue): DocumentMeasurement =>
  c.kind === 'canonical'
    ? { kind: 'canonical', key: c.key ?? '', value, ...(side ? { side } : {}), presentation: c.presentation, origin: 'extracted', quote: c.quote }
    : { kind: 'custom', label: c.label, value: String(value ?? ''), presentation: c.presentation, origin: 'extracted', quote: c.quote };

// Remplit la ligne de même identité (ligne de modèle vide, valeur en conflit) ou l'ajoute
function upsert(measurements: DocumentMeasurement[], row: DocumentMeasurement): DocumentMeasurement[] {
  const id = measurementIdentity(row);
  const idx = measurements.findIndex((m) => measurementIdentity(m) === id);
  if (idx === -1) return [...measurements, row];
  return measurements.map((m, i) => (i === idx ? ({ ...m, value: row.value, origin: 'extracted', quote: row.quote } as DocumentMeasurement) : m));
}

const withDismissed = (doc: BilanDocument, entry: { id: string; quote: string }): BilanDocument['review'] =>
  doc.review ? { ...doc.review, dismissed: [...doc.review.dismissed, entry].slice(-DISMISSED_MAX) } : doc.review;

const RESULT_REASONS: ExtractionReason[] = ['result_uncertain', 'result_contradicted'];
const SIDE_REASONS: ExtractionReason[] = ['side_absent', 'side_contradicted'];

const isFilled = (v: CanonicalValue | undefined) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sameValue = (a: CanonicalValue, b: CanonicalValue) => (typeof a === 'string' && typeof b === 'string' ? fold(a) === fold(b) : a === b);

/**
 * Tranche une ligne à vérifier : elle quitte la liste. « Garder » l'écrit au tableau ; « ne pas
 * reprendre » la mémorise pour qu'une nouvelle analyse ne la repropose pas.
 * Une valeur déjà saisie par le kiné n'est jamais remplacée en silence : si le côté choisi (ou une
 * valeur hors bornes) tombe sur une ligne remplie d'une autre valeur, la ligne revient à vérifier
 * comme conflit pour ce côté (« Tu avais saisi X »). Seul « Prendre X » sur un conflit la remplace.
 */
export function resolvePending(doc: BilanDocument, id: string, r: Resolution): BilanDocument {
  const review = doc.review;
  const c = review?.pending.find((p) => p.id === id);
  if (!review || !c) return doc;
  const rest = review.pending.filter((p) => p.id !== id);
  if (r.kind === 'dismiss') return { ...doc, review: { ...withDismissed(doc, { id: c.id, quote: c.quote })!, pending: rest } };
  // Résultat tranché, côté encore à choisir : la ligne reste à vérifier pour le côté, jamais
  // enregistrée sans lui
  if (r.value !== undefined && r.side === undefined && c.lateralized && c.reasons.some((x) => SIDE_REASONS.includes(x))) {
    const next: ReviewCandidate = { ...c, value: r.value, reasons: c.reasons.filter((x) => !RESULT_REASONS.includes(x)) };
    return { ...doc, review: { ...review, pending: review.pending.map((p) => (p.id === id ? next : p)) } };
  }
  const outOfRange = c.reasons.includes('out_of_range');
  const proposed: CanonicalValue = r.value !== undefined ? r.value : c.value;
  // Hors bornes : ligne ajoutée vide, à ressaisir (le serveur refuserait la valeur brute)
  const value: CanonicalValue = outOfRange ? null : proposed;
  const sides: (Side | null)[] = !c.lateralized ? [null] : r.side === 'DG' ? ['D', 'G'] : [r.side ?? c.side];
  let measurements = doc.measurements;
  const conflicts: ReviewCandidate[] = [];
  for (const s of sides) {
    const row = rowOf(c, s, value);
    const rowId = measurementIdentity(row);
    const current = measurements.find((m) => measurementIdentity(m) === rowId);
    if (current && isFilled(current.value)) {
      // Conflit présenté au kiné : « Prendre X » remplace ; hors bornes, la valeur saisie reste
      const confronted = c.reasons.includes('conflict') && rowId === c.id;
      if (confronted && value === null) continue;
      if (!confronted) {
        if (sameValue(current.value, rowOf(c, s, proposed).value)) continue; // déjà saisi
        conflicts.push({ ...c, id: rowId, side: s, value: proposed, reasons: outOfRange ? ['conflict', 'out_of_range'] : ['conflict'], existingValue: current.value });
        continue;
      }
    }
    measurements = upsert(measurements, row);
  }
  const pending = [...rest.filter((p) => !conflicts.some((k) => k.id === p.id)), ...conflicts];
  return { ...doc, measurements, review: { ...review, pending } };
}

/** Retire une mesure du tableau ; venue des notes, elle ne sera pas reproposée par une nouvelle analyse. */
export function removeMeasurement(doc: BilanDocument, index: number): BilanDocument {
  const m = doc.measurements[index];
  if (!m) return doc;
  const measurements = doc.measurements.filter((_, i) => i !== index);
  if (!m.quote || !doc.review) return { ...doc, measurements };
  return { ...doc, measurements, review: withDismissed(doc, { id: measurementIdentity(m), quote: m.quote }) };
}
