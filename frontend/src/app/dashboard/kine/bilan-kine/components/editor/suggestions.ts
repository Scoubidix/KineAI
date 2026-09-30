import type { CanonicalValue, DocumentMeasurement } from '@/types/bilan';

export const measurementIdentity = (m: DocumentMeasurement): string =>
  m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${m.label.trim().toLowerCase()}`;

/**
 * Ligne du tableau où arrive une mesure (attribut `data-measure-row` de MeasurementsPanel) : un
 * test latéralisé n'a qu'une ligne pour ses deux côtés, les autres ont l'identité de leur mesure.
 */
export const measureRowId = (t: { kind: 'canonical' | 'custom'; key?: string; label: string; lateralized: boolean }): string =>
  t.kind === 'custom' ? `x:${t.label.trim().toLowerCase()}` : t.lateralized ? `c:${t.key}` : `c:${t.key}:`;

export function formatCandidateValue(c: { value: CanonicalValue; unit: string | null }): string {
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
