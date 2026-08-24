import { useCallback, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export interface ProgrammeListItem {
  id: number;
  titre: string;
  description: string;
  duree: number;
  dateDebut: string;
  dateFin: string;
  isArchived: boolean;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
  };
  sessionValidations: {
    date: string;
    isValidated: boolean;
    painLevel: number | null;
    difficultyLevel: number | null;
  }[];
  _count: {
    exercices: number;
    chatSessions: number;
  };
}

export interface UseProgrammesListOptions {
  /** Le chargement n'est déclenché qu'une fois cette valeur passée à true. */
  enabled: boolean;
}

export interface UseProgrammesListResult {
  programmes: ProgrammeListItem[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Liste de tous les programmes du kiné.
 * Vit dans le shell : l'onglet Programmes l'affiche, et le sélecteur de patient
 * s'en sert pour repérer les patients qui ont déjà un programme en cours.
 */
export function useProgrammesList({ enabled }: UseProgrammesListOptions): UseProgrammesListResult {
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${apiUrl}/programmes/kine/all`);
      if (!res.ok) throw new Error('Erreur lors du chargement des programmes');
      setProgrammes(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Chargement paresseux, comme les deux autres onglets : inutile de ramener
  // tous les programmes et leurs validations si le kiné reste sur Exercices.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!enabled || hasLoadedOnce) return;
    const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
      if (user) {
        setHasLoadedOnce(true);
        void load();
      } else {
        setIsLoading(false);
        setError('Non authentifié');
      }
    });
    return () => unsubscribe();
  }, [enabled, hasLoadedOnce, load]);

  return { programmes, isLoading, error, reload: load };
}
