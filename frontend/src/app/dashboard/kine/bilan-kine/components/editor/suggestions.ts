import type { CanonicalValue, DocumentMeasurement, ExtractionCandidate, Side } from '@/types/bilan';

export const measurementIdentity = (m: DocumentMeasurement): string =>
  m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${m.label.trim().toLowerCase()}`;

export const candidateIdentity = (c: ExtractionCandidate, side: Side | null): string =>
  c.kind === 'canonical' ? `c:${c.key}:${side ?? ''}` : `x:${c.label.trim().toLowerCase()}`;

const isFilled = (v: CanonicalValue | undefined): boolean => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const same = (a: CanonicalValue, b: CanonicalValue): boolean => (typeof a === 'string' && typeof b === 'string' ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b);

/** Valeur déjà saisie et différente pour cette identité (le côté peut avoir été changé après l'analyse). */
export function findConflict(measurements: DocumentMeasurement[], c: ExtractionCandidate, side: Side | null): CanonicalValue | undefined {
  const id = candidateIdentity(c, side);
  const existing = measurements.find((m) => measurementIdentity(m) === id);
  if (!existing || !isFilled(existing.value)) return undefined;
  return same(existing.value, c.value) ? undefined : existing.value;
}

/** Accepte un candidat : remplace la valeur d'une ligne existante (même identité) ou ajoute la mesure. */
export function applyCandidate(measurements: DocumentMeasurement[], c: ExtractionCandidate, side: Side | null): DocumentMeasurement[] {
  // Hors bornes : on ajoute la ligne vide, le kiné saisit la valeur (Zod refuserait la valeur brute au PATCH)
  const value: CanonicalValue = c.warning === 'out_of_range' ? null : c.value;
  const next: DocumentMeasurement = c.kind === 'canonical'
    ? { kind: 'canonical', key: c.key ?? '', value, ...(side ? { side } : {}), presentation: c.presentation, origin: 'extracted' }
    : { kind: 'custom', label: c.label, value: String(value ?? ''), presentation: c.presentation, origin: 'extracted' };
  const id = measurementIdentity(next);
  const idx = measurements.findIndex((m) => measurementIdentity(m) === id);
  if (idx === -1) return [...measurements, next];
  return measurements.map((m, i) => (i === idx ? { ...m, value: next.value, origin: 'extracted' } as DocumentMeasurement : m));
}

export function formatCandidateValue(c: ExtractionCandidate): string {
  if (typeof c.value === 'boolean') return c.value ? 'Positif' : 'Négatif';
  if (c.value === null) return '—';
  if (typeof c.value === 'number') return c.unit ? (c.unit.startsWith('/') ? `${c.value}${c.unit}` : `${c.value} ${c.unit}`) : String(c.value);
  return c.value;
}

/**
 * Lignes du bilan de référence absentes du document, ajoutées VIDES (origine « previous ») :
 * le kiné ressaisit la mesure du jour, la valeur antérieure s'affiche à côté de la ligne.
 * `knownKeys`, si fourni, filtre les lignes canoniques dont la clé n'existe plus au catalogue
 * (le validateur serveur rejette toute clé inconnue) ; les lignes libres passent toujours.
 */
export function addReferenceRows(current: DocumentMeasurement[], reference: DocumentMeasurement[], knownKeys?: Set<string>): DocumentMeasurement[] {
  const seen = new Set(current.map(measurementIdentity));
  const added: DocumentMeasurement[] = [];
  for (const m of reference) {
    if (m.kind === 'canonical' && knownKeys && !knownKeys.has(m.key)) continue;
    const id = measurementIdentity(m);
    if (seen.has(id)) continue;
    seen.add(id);
    added.push(m.kind === 'canonical' ? { ...m, value: null, origin: 'previous' } : { ...m, value: '', origin: 'previous' });
  }
  return [...current, ...added];
}
