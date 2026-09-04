'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dumbbell, Loader2 } from 'lucide-react';
import type { ExerciceModele } from '@/types/exercice';
import { useExercicesLibrary } from '@/hooks/useExercicesLibrary';
import { ExerciceCard } from './ExerciceCard';
import { ExerciceDeleteDialog, ExerciceFormDialog } from './ExerciceFormDialog';

interface ExercicesTabProps {
  enabled: boolean;
  /** Recherche et filtre de propriete, saisis dans l'en-tete de la page. */
  search: string;
  onlyMine: boolean;
  /** Catégories cochées dans la rangée de filter chips de l'en-tête (logique ET). */
  tags: string[];
  /** Incrémenté par le shell quand la card « Créer un exercice » est cliquée. */
  createSignal: number;
  /** Mode sélection : piloté par le shell, qui détient la sélection. */
  selectable?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (exercice: ExerciceModele) => void;
  /** Exercices déjà apportés par un template coché. */
  coveredByTemplateIds?: number[];
}

// Deux colonnes fixes sur mobile — en auto-fill, un minimum de 300 px n'en
// laisserait tenir qu'une seule sur un téléphone. À partir de `sm` la grille
// redevient intrinsèquement fluide : 2 colonnes à 640 px, 3 vers 940 px, etc.,
// sans palier de breakpoint à maintenir. La transition est continue.
const GRID =
  'grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]';

export function ExercicesTab({
  enabled,
  search,
  onlyMine,
  tags,
  createSignal,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  coveredByTemplateIds = [],
}: ExercicesTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExerciceModele | null>(null);
  const [deleting, setDeleting] = useState<ExerciceModele | null>(null);

  const library = useExercicesLibrary({ enabled, search, tags, onlyMine });

  const { mine: mineCount, publics: publicsCount } = library.counts;

  // Ouverture du formulaire de création demandée par le shell.
  useEffect(() => {
    if (createSignal > 0) {
      setEditing(null);
      setFormOpen(true);
    }
  }, [createSignal]);

  // Chargement automatique du lot public suivant quand la sentinelle devient visible.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasMorePublics, loadMorePublics } = library;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMorePublics) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMorePublics();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMorePublics, loadMorePublics]);

  const hasFilters = search.trim().length > 0 || tags.length > 0;
  const isEmpty = mineCount === 0 && publicsCount === 0;

  return (
    <div className="space-y-4">
      {library.isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="animate-spin w-6 h-6 text-gray-500" />
        </div>
      )}

      {library.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            {library.error}{' '}
            <Button variant="ghost" size="sm" onClick={() => void library.reload()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {!library.isLoading && !library.error && isEmpty && (
        <Card>
          <CardContent className="text-center py-10">
            <Dumbbell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {hasFilters ? 'Aucun exercice trouvé' : 'Aucun exercice disponible'}
            </h3>
            <p className="text-muted-foreground">
              {hasFilters
                ? 'Essaie une autre recherche ou retire un filtre.'
                : 'Commence par créer ton premier exercice.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bloc 1 : mes exercices */}
      {mineCount > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Mes exercices · {mineCount}
          </h3>
          <div className={GRID}>
            {library.mine.map((ex) => (
              <ExerciceCard
                key={ex.id}
                exercice={ex}
                onEdit={() => {
                  setEditing(ex);
                  setFormOpen(true);
                }}
                onDelete={() => setDeleting(ex)}
                selectable={selectable}
                selected={selectedIds.includes(ex.id)}
                onSelectChange={onToggleSelect}
                alreadyIncluded={coveredByTemplateIds.includes(ex.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Bloc 2 : bibliothèque publique */}
      {!onlyMine && publicsCount > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Bibliothèque publique · {publicsCount}
          </h3>
          <div className={GRID}>
            {library.publics.map((ex) => (
              <ExerciceCard
                key={ex.id}
                exercice={ex}
                selectable={selectable}
                selected={selectedIds.includes(ex.id)}
                onSelectChange={onToggleSelect}
                alreadyIncluded={coveredByTemplateIds.includes(ex.id)}
              />
            ))}
          </div>
          {hasMorePublics && (
            <>
              <div ref={sentinelRef} aria-hidden="true" />
              <div className="flex justify-center mt-4">
                <Button variant="outline" onClick={loadMorePublics}>
                  Charger plus
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <ExerciceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        exercice={editing}
        onSaved={() => void library.reload()}
      />

      <ExerciceDeleteDialog
        exercice={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onDeleted={() => {
          setDeleting(null);
          void library.reload();
        }}
      />
    </div>
  );
}
