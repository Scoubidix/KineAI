'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { ExerciceTemplate } from '@/types/exercice';
import { useTemplatesLibrary } from '@/hooks/useTemplatesLibrary';
import { useRouter } from 'next/navigation';
import { TemplateCard } from './TemplateCard';
import { TemplateDeleteDialog } from './TemplateDeleteDialog';

interface TemplatesTabProps {
  enabled: boolean;
  /** Recherche et filtre de propriete, saisis dans l'en-tete de la page. */
  search: string;
  onlyMine: boolean;
  /** Mode sélection : piloté par le shell, qui détient la sélection. */
  selectable?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (template: ExerciceTemplate) => void;
}

// Alignee sur la grille des exercices : deux colonnes forcees sur mobile, fluide au-dela.
const GRID =
  'grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]';

export function TemplatesTab({
  enabled,
  search,
  onlyMine,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
}: TemplatesTabProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<ExerciceTemplate | null>(null);

  const library = useTemplatesLibrary({ enabled, search, onlyMine });
  const { mine: mineCount, publics: publicsCount } = library.counts;

  const hasFilters = search.trim().length > 0;
  const isEmpty = mineCount === 0 && publicsCount === 0;

  return (
    <div className="space-y-6">
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
            <div className="text-4xl mb-3">🧩</div>
            <h3 className="text-lg font-medium mb-2">
              {hasFilters ? 'Aucun template trouvé' : 'Aucun template créé'}
            </h3>
            <p className="text-muted-foreground">
              {hasFilters
                ? 'Essaie une autre recherche.'
                : 'Crée ton premier template pour gagner du temps lors de la création de programmes.'}
            </p>
          </CardContent>
        </Card>
      )}

      {mineCount > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Mes templates · {mineCount}
          </h3>
          <div className={GRID}>
            {library.mine.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onEdit={() =>
                  router.push(`/dashboard/kine/programmes/templates/${tpl.id}/edition`)
                }
                onDelete={() => setDeleting(tpl)}
                selectable={selectable}
                selected={selectedIds.includes(tpl.id)}
                onSelectChange={onToggleSelect}
              />
            ))}
          </div>
        </section>
      )}

      {!onlyMine && publicsCount > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Templates publics · {publicsCount}
          </h3>
          <div className={GRID}>
            {library.publics.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                selectable={selectable}
                selected={selectedIds.includes(tpl.id)}
                onSelectChange={onToggleSelect}
              />
            ))}
          </div>
        </section>
      )}

      <TemplateDeleteDialog
        template={deleting}
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
