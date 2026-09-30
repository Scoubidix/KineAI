import type { BilanDocument, CanonicalValue, DocumentMeasurement, ReviewCandidate, Side } from '@/types/bilan';
import { measurementIdentity } from './suggestions';

/** Test choisi par le kiné à la place de celui que l'extraction a reconnu (« Modifier ») */
export type Retarget = Pick<ReviewCandidate, 'kind' | 'key' | 'label' | 'fieldType' | 'unit' | 'lateralized' | 'presentation'>;

/** Réponse du kiné à une ligne à vérifier : la garder (test, côté et/ou valeur choisis) ou ne pas la reprendre */
export type Resolution =
  | { kind: 'keep'; side?: Side | 'DG'; value?: CanonicalValue; retarget?: Retarget }
  | { kind: 'dismiss' };

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

const isFilled = (v: CanonicalValue | undefined) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sameValue = (a: CanonicalValue, b: CanonicalValue) => (typeof a === 'string' && typeof b === 'string' ? fold(a) === fold(b) : a === b);

/**
 * Tranche une ligne à vérifier : elle quitte la liste. « Garder » l'écrit au tableau, sous le test
 * choisi par le kiné s'il l'a changé ; « ne pas reprendre » la mémorise pour qu'une nouvelle analyse
 * ne la repropose pas.
 * Une valeur déjà saisie par le kiné n'est jamais remplacée en silence : si le côté choisi (ou une
 * valeur hors bornes) tombe sur une ligne remplie d'une autre valeur, la ligne revient à vérifier
 * comme conflit pour ce côté (« Tu avais saisi X »). Seul « Prendre X » sur un conflit la remplace.
 */
export function resolvePending(doc: BilanDocument, id: string, r: Resolution): BilanDocument {
  const review = doc.review;
  const found = review?.pending.find((p) => p.id === id);
  if (!review || !found) return doc;
  const rest = review.pending.filter((p) => p.id !== id);
  if (r.kind === 'dismiss') return { ...doc, review: { ...withDismissed(doc, { id: found.id, quote: found.quote })!, pending: rest } };
  // L'identité d'origine (id, citation) est gardée : c'est elle que la liste et les écartées connaissent
  const c: ReviewCandidate = r.retarget ? { ...found, ...r.retarget } : found;
  const proposed: CanonicalValue = r.value !== undefined ? r.value : c.value;
  // Hors bornes : la valeur brute n'est jamais écrite (le serveur la refuserait), seule une valeur
  // ressaisie par le kiné l'est ; sans elle, la ligne arrive vide
  const outOfRange = c.reasons.includes('out_of_range') && r.value === undefined;
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

/**
 * Retire des mesures du tableau (une ligne, ou les deux côtés d'un test latéralisé) ; venues des
 * notes, elles ne seront pas reproposées par une nouvelle analyse.
 */
export function removeMeasurements(doc: BilanDocument, indices: number[]): BilanDocument {
  const gone = doc.measurements.filter((_, i) => indices.includes(i));
  if (gone.length === 0) return doc;
  let next: BilanDocument = { ...doc, measurements: doc.measurements.filter((_, i) => !indices.includes(i)) };
  for (const m of gone) {
    if (m.quote && next.review) next = { ...next, review: withDismissed(next, { id: measurementIdentity(m), quote: m.quote }) };
  }
  return next;
}
