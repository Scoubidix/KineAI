'use client';

import React, { useRef, useState } from 'react';
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
}: ExerciceMediaProps) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMobile = useIsMobile();

  // Une URL signée peut avoir expiré (brouillon repris longtemps après) : on
  // retombe alors sur le bloc vide plutôt que sur une image cassée.
  if (videoUrl && !failed) {
    const play = () => {
      videoRef.current?.play().then(() => setPlaying(true)).catch(() => {});
    };
    const stop = () => {
      const el = videoRef.current;
      if (!el) return;
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    };

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

        {/* Sur mobile le survol n'existe pas, et le tap sur le média sert à
            cocher la card en mode sélection : la lecture a sa propre cible de
            clic, avec stopPropagation. */}
        {isMobile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (playing) stop();
              else play();
            }}
            aria-label={playing ? `Arrêter la démonstration${alt ? ` de ${alt}` : ''}` : `Lire la démonstration${alt ? ` de ${alt}` : ''}`}
            className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm"
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
