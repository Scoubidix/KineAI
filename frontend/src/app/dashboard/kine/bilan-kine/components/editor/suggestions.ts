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

// Forme « plate » d'un texte (NFD sans diacritiques, minuscules) avec la correspondance
// index plat → index dans la chaîne NFD, pour retrouver un extrait à la casse et aux accents près.
function flatten(text: string): { plain: string; map: number[]; nfd: string } {
  const nfd = text.normalize('NFD');
  let plain = '';
  const map: number[] = [];
  for (let i = 0; i < nfd.length; i += 1) {
    const code = nfd.charCodeAt(i);
    if (code >= 0x300 && code <= 0x36f) continue;
    plain += nfd[i].toLowerCase();
    map.push(i);
  }
  return { plain, map, nfd };
}

/** Positions (dans `notes.normalize('NFD')`) des extraits cités, triées, sans chevauchement. */
export function findQuoteRanges(notes: string, quotes: { id: string; quote: string }[]): { id: string; start: number; end: number }[] {
  const { plain, map } = flatten(notes);
  const ranges: { id: string; start: number; end: number }[] = [];
  for (const q of quotes) {
    const needle = flatten(q.quote.trim()).plain;
    if (!needle) continue;
    const idx = plain.indexOf(needle);
    if (idx === -1) continue;
    ranges.push({ id: q.id, start: map[idx], end: map[idx + needle.length - 1] + 1 });
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: typeof ranges = [];
  let cursor = 0;
  for (const r of ranges) { if (r.start >= cursor) { out.push(r); cursor = r.end; } }
  return out;
}
