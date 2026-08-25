'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export interface ExerciceMediaProps {
  /** MP4 720p — prioritaire dès qu'il est présent. */
  videoUrl?: string | null;
  /** JPEG d'aperçu : évite d'amorcer N vidéos dans une grille. */
  posterUrl?: string | null;
  /** GIF legacy — affiché uniquement en l'absence de vidéo. */
  gifUrl?: string | null;
  alt?: string;
  /** Classes du conteneur : ratio, largeur, arrondi, fond. */
  className?: string;
  /** Classes du média. Par défaut il remplit le conteneur en `object-cover`. */
  mediaClassName?: string;
  /** Grilles kiné : lecture au survol en desktop. Désactivé en mode sélection. */
  autoPlayOnHover?: boolean;
  /** À passer à `false` là où le tap a déjà un rôle (carrousel : avancer d'une
      vignette). Sans ça, le bouton centré capterait le geste. */
  showPlayButton?: boolean;
  /** Lecture pilotée par le parent : `true` lance, `false` arrête et rembobine.
      Le carrousel s'en sert pour animer la seule vignette visible — le survol ne
      peut pas suffire là-bas, car une diapositive amenée sous le curseur par la
      transition CSS ne reçoit jamais de `mouseenter`. */
  autoPlay?: boolean;
}

/**
 * Le seul endroit du frontend qui décide quoi afficher pour un exercice :
 * vidéo si `videoUrl`, sinon GIF legacy, sinon bloc vide. Règle auto-descriptive,
 * aucun drapeau à maintenir — et une seule logique à retirer en phase de sortie.
 *
 * `muted` est obligatoire : sans lui, aucun navigateur n'autorise la lecture
 * automatique. Les MP4 produits n'ont de toute façon pas de piste audio.
 */
export function ExerciceMedia({
  videoUrl,
  posterUrl,
  gifUrl,
  alt = '',
  className = '',
  mediaClassName = 'block h-full w-full object-cover',
  autoPlayOnHover = false,
  showPlayButton = true,
  autoPlay,
}: ExerciceMediaProps) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMobile = useIsMobile();

  // Les URLs signées sont régénérées à chaque chargement de la liste : le même
  // composant (la grille est clée sur l'id de l'exercice, pas sur l'URL) reçoit
  // une nouvelle URL pour le même exercice. Sans cette remise à zéro, un échec
  // de chargement passager — wifi, hoquet GCS, signature refusée pour dérive
  // d'horloge — laisserait la vignette grise définitivement, alors que l'URL
  // suivante est parfaitement valide.
  useEffect(() => {
    setFailed(false);
    setPlaying(false);
  }, [videoUrl, gifUrl]);

  const play = useCallback(() => {
    videoRef.current?.play().then(() => setPlaying(true)).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setPlaying(false);
  }, []);

  // Pilotage externe. `undefined` = personne ne pilote, on laisse le survol et
  // le bouton faire leur travail.
  useEffect(() => {
    if (autoPlay === undefined) return;
    if (autoPlay) play();
    else stop();
  }, [autoPlay, play, stop]);

  // Une URL signée peut avoir expiré (brouillon repris longtemps après) : on
  // retombe alors sur le bloc vide plutôt que sur une image cassée.
  if (videoUrl && !failed) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <video
          ref={videoRef}
          // `#t=0.1` force iOS à peindre une image plutôt qu'un cadre noir quand
          // `preload` est ignoré (Safari, navigateur intégré WhatsApp). Le
          // fragment n'est ni envoyé au serveur, ni couvert par la signature.
          src={`${videoUrl}#t=0.1`}
          poster={posterUrl ?? undefined}
          // Avec un poster, rien n'est téléchargé avant la lecture : une grille
          // de 25 cards charge 25 vignettes au lieu d'amorcer 25 vidéos.
          preload={posterUrl ? 'none' : 'metadata'}
          muted
          loop
          playsInline
          aria-label={alt || undefined}
          onError={() => setFailed(true)}
          onMouseEnter={autoPlayOnHover && !isMobile ? play : undefined}
          onMouseLeave={autoPlayOnHover && !isMobile ? stop : undefined}
          className={mediaClassName}
        />

        {/* Bouton de lecture, monté dès que `showPlayButton` (true par défaut)
            — c'est ce qui le rend atteignable au clavier. Une démonstration
            d'exercice n'est pas décorative : sans ce bouton, un kiné qui navigue
            au clavier ne voit jamais le mouvement, seulement une image figée
            (WCAG 2.1.1, niveau A). `showPlayButton={false}` le retire là où le
            tap a déjà un rôle (carrousel : avancer d'une vignette) — sans ça,
            le bouton centré capterait le geste.

            Sur mobile le survol n'existe pas : le bouton reste visible en
            permanence, comme aujourd'hui.

            Sur desktop il n'apparaît QU'À la prise de focus clavier, et reste
            `pointer-events-none` le reste du temps. C'est délibéré : le révéler
            au survol placerait une cible de clic de 44 px au centre de la card,
            qui avalerait le clic servant à cocher l'exercice en mode sélection.
            Le comportement souris existant est donc strictement inchangé — le
            survol continue de lancer l'aperçu, et rien d'autre ne bouge.

            `stopPropagation` : lancer la lecture ne coche jamais l'exercice. */}
        {showPlayButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (playing) stop();
              else play();
            }}
            aria-label={playing ? `Arrêter la démonstration${alt ? ` de ${alt}` : ''}` : `Lire la démonstration${alt ? ` de ${alt}` : ''}`}
            className={`absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-opacity ${
              isMobile
                ? ''
                : 'opacity-0 pointer-events-none focus-visible:opacity-100 focus-visible:pointer-events-auto'
            }`}
          >
            {playing ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" />
            )}
          </button>
        )}
      </div>
    );
  }

  if (gifUrl && !failed) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={gifUrl}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={mediaClassName}
        />
      </div>
    );
  }

  return <div className={`${className} bg-muted`} aria-hidden="true" />;
}
