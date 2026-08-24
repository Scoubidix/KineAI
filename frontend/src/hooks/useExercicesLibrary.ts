import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import type { ExerciceModele } from '@/types/exercice';
import { computeTopTags, filterExercices, parseTags, sortByNom } from '@/utils/exerciceFiltering';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

/** Taille d'un lot de rendu du bloc public. */
export const PUBLIC_PAGE_SIZE = 60;

export interface UseExercicesLibraryOptions {
  /** Le chargement n'est déclenché qu'une fois cette valeur passée à true. */
  enabled: boolean;
  search: string;
  tags: string[];
  onlyMine: boolean;
}

export interface UseExercicesLibraryResult {
  mine: ExerciceModele[];
  publics: ExerciceModele[];
  counts: { mine: number; publics: number };
  allTags: string[];
  topTags: string[];
  hasMorePublics: boolean;
  loadMorePublics: () => void;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExercicesLibrary(
  options: UseExercicesLibraryOptions,
): UseExercicesLibraryResult {
  const { enabled, search, tags, onlyMine } = options;

  const [rawMine, setRawMine] = useState<ExerciceModele[]>([]);
  const [rawPublics, setRawPublics] = useState<ExerciceModele[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visiblePublics, setVisiblePublics] = useState(PUBLIC_PAGE_SIZE);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Les deux endpoints renvoient déjà la liste complète : un seul aller-retour,
      // une seule passe de signature d'URL GCS.
      const [privateRes, publicRes] = await Promise.all([
        fetchWithAuth(`${apiUrl}/exercices/private`),
        fetchWithAuth(`${apiUrl}/exercices/public`),
      ]);
      if (!privateRes.ok || !publicRes.ok) throw new Error('Chargement des exercices impossible');
      const [privateData, publicData] = await Promise.all([
        privateRes.json(),
        publicRes.json(),
      ]);
      setRawMine(privateData);
      setRawPublics(publicData);
      setHasLoadedOnce(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Premier chargement : uniquement quand l'onglet est activé ET l'utilisateur authentifié.
  useEffect(() => {
    if (!enabled || hasLoadedOnce) return;
    const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
      if (user) void load();
    });
    return () => unsubscribe();
  }, [enabled, hasLoadedOnce, load]);

  // Toute modification des critères ramène le bloc public à son premier lot.
  // `tags` est sérialisé : sa référence change à chaque rendu du parent.
  const tagsKey = tags.join('|');
  useEffect(() => {
    setVisiblePublics(PUBLIC_PAGE_SIZE);
  }, [search, tagsKey, onlyMine]);

  const filteredMine = useMemo(
    () => sortByNom(filterExercices(rawMine, { search, tags })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawMine, search, tagsKey],
  );

  const filteredPublics = useMemo(
    () => (onlyMine ? [] : sortByNom(filterExercices(rawPublics, { search, tags }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawPublics, search, tagsKey, onlyMine],
  );

  // Suggestions calculées sur l'ensemble chargé, pas sur le résultat filtré.
  const topTags = useMemo(
    () => computeTopTags([...rawMine, ...rawPublics]),
    [rawMine, rawPublics],
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const ex of [...rawMine, ...rawPublics]) {
      for (const tag of parseTags(ex.tags)) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rawMine, rawPublics]);

  const loadMorePublics = useCallback(
    () => setVisiblePublics((n) => n + PUBLIC_PAGE_SIZE),
    [],
  );

  return {
    mine: filteredMine,
    publics: filteredPublics.slice(0, visiblePublics),
    counts: { mine: filteredMine.length, publics: filteredPublics.length },
    allTags,
    topTags,
    hasMorePublics: filteredPublics.length > visiblePublics,
    loadMorePublics,
    isLoading,
    error,
    reload: load,
  };
}
