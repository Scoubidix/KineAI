'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Info } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ExerciceTemplate } from '@/types/exercice';
import { MediaCarousel } from './MediaCarousel';
import { TemplateDetailDialog } from './TemplateDetailDialog';

/** Hauteur maximale de la liste d'exercices, en lignes. */
const ROWS = 3;
/** Colonnes au-delà desquelles les noms deviennent trop étroits pour être lus. */
const MAX_COLS = 3;

interface TemplateCardProps {
  template: ExerciceTemplate;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Mode sélection : la vignette entière devient cochable. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (template: ExerciceTemplate) => void;
}

/**
 * Même grammaire que la card d'exercice : le média est le bloc encadré, le reste
 * vit en dessous. Un template contenant plusieurs exercices, le média est un
 * carrousel lent plutôt qu'une vignette unique.
 */
export function TemplateCard({
  template,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelectChange,
}: TemplateCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const isMobile = useIsMobile();

  const items = useMemo(
    () => [...(template.items ?? [])].sort((a, b) => a.ordre - b.ordre),
    [template.items],
  );

  // Une colonne sur mobile, jusqu'à trois colonnes de trois au-delà. Le reste
  // est résumé par un « + N autres » plutôt que d'allonger la card.
  const maxVisible = isMobile ? ROWS : ROWS * MAX_COLS;
  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - visibleItems.length;

  const slides = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        nom: item.exerciceModele.nom,
        gifUrl: item.exerciceModele.gifUrl ?? null,
      })),
    [items],
  );

  return (
    <>
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_320px]">
        <div
          className={`card-hover relative overflow-hidden rounded-xl ${
            selectable ? 'cursor-pointer' : ''
          } ${selected ? 'ring-2 ring-[#3899aa]' : ''}`}
          onClick={selectable ? () => onSelectChange?.(template) : undefined}
        >
          <MediaCarousel
            slides={slides}
            index={index}
            onIndexChange={setIndex}
            advanceOnClick={!selectable}
          />

          {selectable && (
            <div className="absolute top-2 left-2">
              <span
                role="checkbox"
                aria-checked={selected}
                aria-label={`Sélectionner ${template.nom}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    onSelectChange?.(template);
                  }
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 shadow transition-colors ${
                  selected
                    ? 'bg-[#3899aa] border-[#3899aa] text-white'
                    : 'bg-white/90 border-white text-transparent'
                }`}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            </div>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="absolute top-1 right-1 h-8 w-8 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] hover:bg-white/20 hover:text-white"
            aria-label={`Détail de ${template.nom}`}
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(true);
            }}
          >
            <Info className="h-5 w-5" />
          </Button>
        </div>

        <p className="mt-2 text-sm sm:text-base font-medium break-words">{template.nom}</p>

        {/* Les exercices du template, sur trois lignes maximum : au-delà, la
            liste part en colonnes. Celui qui défile est mis en avant, pour
            relier la vignette à la liste.
            Sur mobile la card fait ~165 px : deux colonnes y donneraient 75 px
            par nom, donc on reste sur une seule colonne et on tronque la liste. */}
        <ol
          className="mt-1 grid gap-x-3 gap-y-0.5"
          style={{
            gridTemplateRows: `repeat(${Math.min(ROWS, visibleItems.length)}, minmax(0, 1fr))`,
            gridAutoFlow: isMobile ? 'row' : 'column',
            // Sans largeur contrainte, les colonnes se dimensionnent sur le nom
            // le plus long et débordent de la card : la troncature ne s'applique
            // qu'à une piste bornée.
            gridAutoColumns: 'minmax(0, 1fr)',
          }}
        >
          {visibleItems.map((item, i) => (
            <li
              key={item.id}
              title={item.exerciceModele.nom}
              className={`truncate text-xs transition-colors ${
                i === index ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {item.exerciceModele.nom}
            </li>
          ))}
        </ol>

        {hiddenCount > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground/80">+ {hiddenCount} autres</p>
        )}
      </div>

      <TemplateDetailDialog
        template={template}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={
          !selectable && !template.isPublic && onEdit
            ? () => {
                setDetailOpen(false);
                onEdit();
              }
            : undefined
        }
        onDelete={
          !selectable && !template.isPublic && onDelete
            ? () => {
                setDetailOpen(false);
                onDelete();
              }
            : undefined
        }
      />
    </>
  );
}
