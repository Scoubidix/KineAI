'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Info } from 'lucide-react';
import type { ExerciceModele } from '@/types/exercice';
import { ExerciceMedia } from '@/components/ExerciceMedia';
import { ExerciceDetailDialog } from './ExerciceDetailDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

  // On se base sur les chemins et non sur les URLs : une URL signée peut être
  // nulle parce que le fichier a disparu du bucket, ce qui n'est pas la même
  // chose qu'un exercice à refilmer.
  // Uniquement sur ses propres exercices : un kiné ne peut pas refilmer un
  // exercice de la bibliothèque publique, qu'il ne peut pas modifier.
  const needsRefilm = !exercice.isPublic && !exercice.videoPath && Boolean(exercice.gifPath);

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
            // Nom accessible de la commande de lecture (voir `alt=""` ci-dessus) :
            // sans lui, chaque carte de la grille annonce le même « Lire la
            // démonstration » générique au clavier et au lecteur d'écran.
            label={exercice.nom}
            className="aspect-video w-full bg-muted"
            // Pas de lecture au survol pendant une sélection : le geste sert à cocher.
            autoPlayOnHover={!selectable}
            // Idem pour le clic : en mode sélection, taper sur la vignette coche
            // l'exercice — c'est le flow principal « construire un programme au
            // téléphone », il prime sur la lecture. La démo y reste atteignable
            // par le « i », qui ouvre ExerciceDetailDialog et son propre média.
            playOnClick={!selectable}
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

          {/* Sa propre cible de clic, comme le « i » : sur mobile le survol
              n'existe pas, et en mode sélection un clic sur la card coche
              l'exercice. */}
          {needsRefilm && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  // Le nom accessible DOIT commencer par le texte visible :
                  // sinon un utilisateur au pilotage vocal qui dit « cliquer sur
                  // À refilmer » ne trouve pas la cible (WCAG 2.5.3, niveau A).
                  // Le « pourquoi » est porté par le contenu du popover.
                  aria-label={`À refilmer : ${exercice.nom}`}
                  // En bas à gauche, et non en haut à droite : le haut-gauche
                  // accueille déjà la pastille « déjà ajouté », large elle aussi,
                  // et sur une card de 165 px les deux se chevauchent. Le bas
                  // gauche est le seul coin libre : le « i » est en bas à
                  // droite.
                  className="absolute bottom-2 left-2 rounded-full bg-red-600 px-2 py-1 text-[10px] font-medium text-white shadow"
                >
                  À refilmer
                </button>
              </PopoverTrigger>
              <PopoverContent
                // Aligné sur le bord gauche du badge, qui vit en bas à gauche.
                align="start"
                className="w-64 text-xs leading-relaxed"
                // Radix rend ce contenu dans un Portal, mais React propage les
                // événements dans l'arbre REACT, pas dans le DOM : sans ce
                // stopPropagation, un clic dans l'explication cocherait la card.
                onClick={(e) => e.stopPropagation()}
              >
                La démo de cet exercice est en basse qualité. Refilme-la depuis
                « Modifier » : tes patients verront le mouvement bien plus nettement.
              </PopoverContent>
            </Popover>
          )}
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
