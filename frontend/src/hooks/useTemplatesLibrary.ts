import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { matchesAllTokens } from '@/utils/textSearch';
import { sortByNom } from '@/utils/exerciceFiltering';
import type { ExerciceTemplate } from '@/types/exercice';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export interface UseTemplatesLibraryOptions {
  enabled: boolean;
  search: string;
  onlyMine: boolean;
}

export interface UseTemplatesLibraryResult {
  mine: ExerciceTemplate[];
  publics: ExerciceTemplate[];
  counts: { mine: number; publics: number };
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Même contrat que useExercicesLibrary, sans pagination : les templates
 * restent peu nombreux, il n'y a rien à tronquer.
 */
export function useTemplatesLibrary(
  options: UseTemplatesLibraryOptions,
): UseTemplatesLibraryResult {
  const { enabled, search, onlyMine } = options;

  const [rawMine, setRawMine] = useState<ExerciceTemplate[]>([]);
  const [rawPublics, setRawPublics] = useState<ExerciceTemplate[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [privateRes, publicRes] = await Promise.all([
        fetchWithAuth(`${apiUrl}/exercice-templates/private`),
        fetchWithAuth(`${apiUrl}/exercice-templates/public`),
      ]);
      if (!privateRes.ok || !publicRes.ok) throw new Error('Chargement des templates impossible');
      const [privateData, publicData] = await Promise.all([privateRes.json(), publicRes.json()]);
      setRawMine(privateData);
      setRawPublics(publicData);
      setHasLoadedOnce(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || hasLoadedOnce) return;
    const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
      if (user) void load();
    });
    return () => unsubscribe();
  }, [enabled, hasLoadedOnce, load]);

  const filterList = (list: ExerciceTemplate[]) =>
    sortByNom(
      list.filter((tpl) => matchesAllTokens(`${tpl.nom} ${tpl.description ?? ''}`, search)),
    );

  const filteredMine = useMemo(
    () => filterList(rawMine),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawMine, search],
  );

  const filteredPublics = useMemo(
    () => (onlyMine ? [] : filterList(rawPublics)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawPublics, search, onlyMine],
  );

  return {
    mine: filteredMine,
    publics: filteredPublics,
    counts: { mine: filteredMine.length, publics: filteredPublics.length },
    isLoading,
    error,
    reload: load,
  };
}
