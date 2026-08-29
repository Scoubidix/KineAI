'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExerciceMedia } from '@/components/ExerciceMedia';

export interface CarouselSlide {
  id: number;
  nom: string;
  videoUrl?: string | null;
  posterUrl?: string | null;
  gifUrl?: string | null;
}

interface MediaCarouselProps {
  slides: CarouselSlide[];
  /** Index affiché, piloté par le parent pour rester synchronisé avec la liste. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Le clic sur le média avance d'un cran — désactivé en mode sélection,
      où le clic sert à cocher la card. */
  advanceOnClick?: boolean;
}

const SLIDE_MS = 3500;

/**
 * Défilement des vignettes d'un template, avec des pastilles pour circuler dans
 * la liste.
 *
 * Le défilement ne part jamais tout seul : il démarre au survol en desktop, et au
 * premier appui sur mobile. Il s'arrête quand la souris quitte la card, qui
 * revient alors à sa première vignette — comme une prévisualisation au survol.
 *
 * Étant déclenché par l'utilisateur, il satisfait par construction le critère
 * WCAG 2.2.2 (« Pause, Stop, Hide »). Le réglage système « réduire les
 * animations » désactive en plus le défilement automatique ; la navigation
 * manuelle par les pastilles reste disponible.
 */
export function MediaCarousel({
  slides,
  index,
  onIndexChange,
  advanceOnClick = true,
}: MediaCarouselProps) {
  const [active, setActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (!active || reducedMotion || slides.length < 2) return;
    const timer = window.setInterval(
      () => onIndexChange((indexRef.current + 1) % slides.length),
      SLIDE_MS,
    );
    return () => window.clearInterval(timer);
  }, [active, reducedMotion, slides.length, onIndexChange]);

  if (slides.length === 0) {
    return <div className="aspect-video bg-muted" aria-hidden="true" />;
  }

  const current = slides[Math.min(index, slides.length - 1)];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Premier appui : on lance le défilement sans sauter de vignette. Les appuis
    // suivants avancent d'un cran. Sur desktop le survol a déjà activé, donc un
    // clic avance directement.
    if (!active) {
      setActive(true);
      return;
    }
    onIndexChange((index + 1) % slides.length);
  };

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => {
        setActive(false);
        onIndexChange(0);
      }}
      onClick={advanceOnClick ? handleClick : undefined}
    >
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${Math.min(index, slides.length - 1) * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div key={slide.id} className="w-full shrink-0">
            <ExerciceMedia
              videoUrl={slide.videoUrl}
              posterUrl={slide.posterUrl}
              gifUrl={slide.gifUrl}
              // Décoratif : le nom de la vignette courante est déjà affiché en
              // surimpression juste en dessous. Sans ça, les diapositives hors
              // écran — montées en permanence, seulement décalées en CSS —
              // gagneraient toutes un nom accessible qu'elles n'avaient pas.
              alt=""
              className="aspect-video w-full bg-muted"
              // Le carrousel pilote la lecture lui-même. Le survol ne peut pas
              // le faire : une diapositive amenée sous un curseur immobile par
              // la transition CSS ne reçoit pas de `mouseenter`, donc seule la
              // toute première vignette s'animerait. En pilotant, on retrouve le
              // comportement du GIF — la vignette visible bouge dès que le
              // carrousel est actif, au survol sur desktop comme au premier
              // appui sur mobile — et on n'anime que celle-là.
              autoPlay={active && i === index}
              // Pas de lecture au clic : ici le tap sert à avancer d'une
              // vignette, et la lecture lui volerait le geste.
              playOnClick={false}
            />
          </div>
        ))}
      </div>

      {/* Pastilles jusqu'à six exercices, compteur au-delà : au-delà, les points
          deviennent illisibles et impossibles à viser au doigt. */}
      {slides.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">
          {slides.length <= 6 ? (
            <div className="flex items-center gap-1.5">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Voir ${slide.nom}`}
                  aria-current={i === index}
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange(i);
                  }}
                  className={`h-1.5 rounded-full transition-all drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
                    i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/90'
                  }`}
                />
              ))}
            </div>
          ) : (
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
              {index + 1} / {slides.length}
            </span>
          )}
        </div>
      )}

      {/* Nom de l'exercice affiché, pour relier la vignette à la liste dessous. */}
      <span className="absolute bottom-1.5 left-2 max-w-[60%] truncate text-[10px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {current?.nom}
      </span>
    </div>
  );
}
