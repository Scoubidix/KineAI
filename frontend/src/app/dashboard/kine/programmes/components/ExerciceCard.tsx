'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Info } from 'lucide-react';
import type { ExerciceModele } from '@/types/exercice';
import { ExerciceMedia } from '@/components/ExerciceMedia';
import { ExerciceDetailDialog } from './ExerciceDetailDialog';

interface ExerciceCardProps {
  exercice: ExerciceModele;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Mode sélection : la vignette entière devient cochable. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (exercice: ExerciceModele) => void;
  /** Déjà apporté par un template coché : signalé, et non cochable. */
  alreadyIncluded?: boolean;
}

/**
 * La card, c'est la vidéo. Le nom et le « i » vivent en dessous, sur le fond de
 * page, sans habillage (pattern des grilles vidéo type YouTube / Google Photos).
 * Description, tags et actions sont dans le panneau ouvert par le « i ».
 */
export function ExerciceCard({
  exercice,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelectChange,
  alreadyIncluded = false,
}: ExerciceCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  const handleMediaClick = () => {
    if (!selectable || alreadyIncluded) return;
    onSelectChange?.(exercice);
  };

  return (
    <>
      {/* content-visibility : le navigateur saute le rendu des cards hors écran. */}
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_220px]">
        {/* Média de la card : logique déléguée à ExerciceMedia (vidéo, GIF
            legacy ou bloc vide selon l'exercice). */}
        <div
          className={`card-hover relative overflow-hidden rounded-xl ${
            selectable && !alreadyIncluded ? 'cursor-pointer' : ''
          } ${selected ? 'ring-2 ring-[#3899aa]' : ''} ${alreadyIncluded ? 'opacity-60' : ''}`}
          onClick={selectable ? handleMediaClick : undefined}
        >
          {/* Emplacement média 16:9 : la hauteur est réservée même sans média,
              pour qu'aucun décalage de mise en page (CLS) ne se produise.
              `object-cover` recadre une source qui n'est pas en 16:9 — le
              cadrage complet reste visible dans le panneau de détail. */}
          <ExerciceMedia
            videoUrl={exercice.videoUrl}
            posterUrl={exercice.posterUrl}
            gifUrl={exercice.gifUrl}
            // Décoratif : le nom est déjà affiché en texte juste sous la
            // vignette, le répéter le ferait annoncer deux fois.
            alt=""
            className="aspect-video w-full bg-muted"
            // Pas de lecture au survol pendant une sélection : le geste sert à cocher.
            autoPlayOnHover={!selectable}
          />

          {/* Coche de sélection : ronde et blanche, le seul badge qui restera
              lisible sur une vignette vidéo (pattern Google Photos). */}
          {selectable && (
            <div className="absolute top-2 left-2">
              {alreadyIncluded ? (
                <span className="rounded-full bg-white/90 text-[10px] font-medium text-gray-700 px-2 py-1 shadow">
                  déjà ajouté
                </span>
              ) : (
                <span
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={`Sélectionner ${exercice.nom}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleMediaClick();
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
              )}
            </div>
          )}

          {/* « i » posé sur la vidéo, en bas à droite. Sans pastille : c'est
              l'ombre portée qui le détache de l'image, claire ou sombre.
              Clic isolé pour ne pas déclencher la sélection. */}
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-1 right-1 h-8 w-8 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] hover:bg-white/20 hover:text-white"
            aria-label={`Détail de ${exercice.nom}`}
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(true);
            }}
          >
            <Info className="h-5 w-5" />
          </Button>
        </div>

        {/* Nom, sous la vignette. Il passe à la ligne plutôt que d'être tronqué :
            la grille aligne les vignettes par rangée, seule la hauteur de la
            rangée s'adapte. */}
        <p className="mt-2 text-sm sm:text-base font-medium break-words">{exercice.nom}</p>
      </div>

      <ExerciceDetailDialog
        exercice={exercice}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        // Pas d'action de modification pendant une sélection, ni sur un exercice public.
        onEdit={
          !selectable && !exercice.isPublic && onEdit
            ? () => {
                setDetailOpen(false);
                onEdit();
              }
            : undefined
        }
        onDelete={
          !selectable && !exercice.isPublic && onDelete
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
