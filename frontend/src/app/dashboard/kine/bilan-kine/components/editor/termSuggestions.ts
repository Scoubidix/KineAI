import type { CanonicalField } from '@/types/bilan';

/** Repli agressif : on compare des suites de lettres, sans accent, sans espace ni ponctuation.
 *  C'est ce qui rapproche « la saigue » de « Lasègue » — deux caractères d'écart une fois replié. */
const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Distance de Levenshtein, une seule ligne de travail (les chaînes comparées font quelques dizaines de caractères). */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Termes du catalogue les plus proches de ce que la dictée a écrit.
 * Le seuil suit la longueur du mot : deux caractères d'écart sur un mot court, davantage sur un long.
 */
export function suggestTerms(heard: string, fields: CanonicalField[], limit = 4): string[] {
  const h = fold(heard);
  if (!h) return [];
  const seen = new Set<string>();
  const scored: { term: string; d: number }[] = [];
  for (const f of fields) {
    for (const t of [f.label, ...(Array.isArray(f.aliases) ? f.aliases : [])]) {
      const k = fold(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      scored.push({ term: t, d: distance(h, k) });
    }
  }
  const maxDistance = Math.max(2, Math.round(h.length * 0.4));
  return scored
    .filter((s) => s.d <= maxDistance)
    .sort((a, b) => a.d - b.d || a.term.length - b.term.length)
    .slice(0, limit)
    .map((s) => s.term);
}
