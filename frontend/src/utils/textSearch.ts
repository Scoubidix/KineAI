/**
 * Normalise une chaîne pour une recherche insensible aux accents et à la casse.
 * Ex : "Léa Müller" → "lea muller"
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Vrai si tous les tokens (séparés par espaces) sont présents dans le texte cible,
 * en mode insensible aux accents et à la casse.
 * Ex : matchesAllTokens("Valentin Jean", "jean v") → true
 */
export function matchesAllTokens(target: string, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query.trim());
  if (normalizedQuery === '') return true;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const normalizedTarget = normalizeForSearch(target);
  return tokens.every((t) => normalizedTarget.includes(t));
}
