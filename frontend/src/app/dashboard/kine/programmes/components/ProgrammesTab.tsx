'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { matchesAllTokens } from '@/utils/textSearch';
import { AlertCircle, Calendar, Plus } from 'lucide-react';
import type { ProgrammeListItem } from '@/hooks/useProgrammesList';
import { ProgrammeCard } from './ProgrammeCard';

// Même grille que les onglets Exercices et Templates.
const GRID =
  'grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]';

interface ProgrammesTabProps {
  programmes: ProgrammeListItem[];
  /** Recherche saisie dans l'en-tête de la page (titre ou nom du patient). */
  search: string;
  isLoading: boolean;
  error: string | null;
  onReload: () => void;
  /** Entre en mode sélection pour créer un programme. */
  onCreateProgramme: () => void;
}

export function ProgrammesTab({
  programmes,
  search,
  isLoading,
  error,
  onReload,
  onCreateProgramme,
}: ProgrammesTabProps) {
  // La recherche par titre ou par nom de patient suffit : le statut reste lisible
  // sur chaque card, il n'a plus besoin d'un filtre dédié.
  const filteredProgrammes = programmes.filter((programme) =>
    matchesAllTokens(
      `${programme.titre} ${programme.patient.firstName} ${programme.patient.lastName}`,
      search,
    ),
  );

  const hasSearch = search.trim().length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement des programmes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Erreur de chargement</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={onReload}>Réessayer</Button>
        </div>
      </div>
    );
  }

  if (filteredProgrammes.length === 0) {
    return (
      <Card className="card-hover">
        <CardContent className="text-center py-12">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-foreground">Aucun programme trouvé</h3>
          <p className="text-muted-foreground mb-4">
            {hasSearch
              ? 'Aucun programme ne correspond à ta recherche.'
              : "Tu n'as pas encore créé de programmes."}
          </p>
          {!hasSearch && (
            <Button className="btn-teal" onClick={onCreateProgramme}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un programme
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={GRID}>
      {filteredProgrammes.map((programme) => (
        <ProgrammeCard key={programme.id} programme={programme} onDeleted={onReload} />
      ))}
    </div>
  );
}
