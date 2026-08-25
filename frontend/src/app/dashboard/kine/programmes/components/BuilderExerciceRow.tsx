'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GripVertical, X } from 'lucide-react';
import type { BuilderDraftExercice } from '@/hooks/useBuilderDraft';
import { ExerciceMedia } from '@/components/ExerciceMedia';

/**
 * Borne la saisie au minimum accepté par l'API. Un champ vidé donne
 * `Number('') === 0`, une saisie invalide donne `NaN` : sans ce garde-fou
 * l'enregistrement part puis échoue en 400, avec un message qui ne dit même pas
 * quelle ligne est en cause.
 */
function atLeast(value: string, min: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : min;
}

interface BuilderExerciceRowProps {
  exercice: BuilderDraftExercice;
  index: number;
  onChange: (index: number, patch: Partial<BuilderDraftExercice>) => void;
  onRemove: (index: number) => void;
}

export function BuilderExerciceRow({
  exercice,
  index,
  onChange,
  onRemove,
}: BuilderExerciceRowProps) {
  // dnd-kit fournit nativement les capteurs clavier : le réordonnancement est
  // donc réalisable sans souris (WCAG 2.1.1).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercice.exerciceId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  // Aperçu 16:9 nu, hors du bloc — même grammaire que les cards de la
  // bibliothèque : le média est le visuel, l'encadré porte les réglages.
  // Sur mobile il passe au-dessus et prend toute la largeur : côte à côte, le
  // bloc de réglages est bien plus haut que la vignette et laisse une gouttière
  // vide sur toute la hauteur.
  const mediaClass =
    'flex-1 min-w-0 sm:flex-none sm:w-72 aspect-video rounded-lg sm:self-center';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3"
    >
      {/* `sm:contents` dissout ce conteneur à partir de sm : poignée et vignette
          redeviennent alors des enfants directs de la ligne. */}
      <div className="flex items-center gap-3 sm:contents">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground sm:mt-4"
          aria-label={`Déplacer ${exercice.nom}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <ExerciceMedia
          videoUrl={exercice.videoUrl}
          posterUrl={exercice.posterUrl}
          gifUrl={exercice.gifUrl}
          alt={exercice.nom}
          className={`${mediaClass} bg-muted`}
          autoPlayOnHover
        />
      </div>

      <Card className={`flex-1 min-w-0 ${isDragging ? 'shadow-lg' : ''}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">
                <span className="text-muted-foreground mr-2">{index + 1}.</span>
                {exercice.nom}
              </p>
              {exercice.fromTemplate && (
                <Badge variant="outline" className="mt-1 text-[10px]">
                  ▸ {exercice.fromTemplate.nom}
                </Badge>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 hover:bg-red-100 hover:text-red-600"
              onClick={() => onRemove(index)}
              aria-label={`Retirer ${exercice.nom}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Séries</Label>
              <Input
                type="number"
                min="1"
                value={exercice.series}
                onChange={(e) => onChange(index, { series: atLeast(e.target.value, 1) })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Répétitions</Label>
              <Input
                type="number"
                min="1"
                value={exercice.repetitions}
                onChange={(e) => onChange(index, { repetitions: atLeast(e.target.value, 1) })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Travail (sec)</Label>
              <Input
                type="number"
                min="0"
                value={exercice.tempsTravail}
                onChange={(e) => onChange(index, { tempsTravail: atLeast(e.target.value, 0) })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Repos (sec)</Label>
              <Input
                type="number"
                min="0"
                value={exercice.tempsRepos}
                onChange={(e) => onChange(index, { tempsRepos: atLeast(e.target.value, 0) })}
                className="text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Consigne (optionnel)</Label>
            <textarea
              value={exercice.instructions}
              onChange={(e) => onChange(index, { instructions: e.target.value })}
              placeholder="Instructions particulières..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
