import { normalizeForSearch, matchesAllTokens } from './textSearch';

/** Forme minimale exigée par les fonctions de filtrage. */
export interface FilterableExercice {
  nom: string;
  description: string;
  tags?: string;
}

/** "Rachis, Mobilité articulaire" -> ["Rachis", "Mobilité articulaire"] */
export function parseTags(tagsString?: string | null): string[] {
  if (!tagsString) return [];
  return tagsString
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Normalise un tag pour la comparaison : sans accent, sans casse, sans espaces superflus. */
export function normalizeTag(tag: string): string {
  return normalizeForSearch(tag).trim();
}

/**
 * Vrai si l'exercice porte TOUS les tags demandés (ET), en comparaison EXACTE.
 * On ne teste pas la sous-chaîne : le backend le fait aujourd'hui avec
 * `ex.tags.includes(tag)`, ce qui fait remonter "Rachis lombaire" quand on
 * filtre sur "Rachis".
 */
export function hasAllTags(exercice: FilterableExercice, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const owned = parseTags(exercice.tags).map(normalizeTag);
  return tags.every((tag) => owned.includes(normalizeTag(tag)));
}

/** Recherche multi-mots sur nom + description + tags, insensible aux accents et à la casse. */
export function matchesSearch(exercice: FilterableExercice, query: string): boolean {
  const haystack = `${exercice.nom} ${exercice.description} ${exercice.tags ?? ''}`;
  return matchesAllTokens(haystack, query);
}

export function filterExercices<T extends FilterableExercice>(
  list: T[],
  options: { search: string; tags: string[] },
): T[] {
  return list.filter(
    (ex) => matchesSearch(ex, options.search) && hasAllTags(ex, options.tags),
  );
}

/**
 * Les `limit` tags les plus fréquents de la liste, du plus porté au moins porté,
 * départage alphabétique. Calculé sur l'ensemble chargé, jamais sur le résultat
 * filtré — sinon les suggestions changeraient à chaque frappe.
 */
export function computeTopTags(list: FilterableExercice[], limit = 8): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const ex of list) {
    for (const tag of parseTags(ex.tags)) {
      const key = normalizeTag(tag);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: tag, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
    .slice(0, limit)
    .map((entry) => entry.label);
}

export function sortByNom<T extends { nom: string }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }),
  );
}
