'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Délai d'intention avant de lancer l'aperçu au survol (motif YouTube/Netflix).
 * Sans lui, balayer la souris sur une grille de 25 exercices déclenche 25
 * téléchargements de plusieurs Mo — les vidéos sont en `preload="none"`, donc
 * c'est bien la lecture qui amorce le transfert. 500 ms : assez pour distinguer
 * un survol volontaire d'un passage de souris, assez court pour ne pas donner
 * l'impression que la vignette ne répond pas.
 */
const HOVER_INTENT_MS = 500;

/**
 * Délai avant le démarrage automatique dans un panneau ouvert exprès pour voir
 * l'exercice. Pas zéro : laisser le poster une demi-seconde évite que le
 * panneau s'ouvre déjà en mouvement, et laisse le fondu se voir.
 */
const OPEN_AUTOPLAY_MS = 500;

export interface ExerciceMediaProps {
  /** MP4 720p — prioritaire dès qu'il est présent. */
  videoUrl?: string | null;
  /** JPEG d'aperçu : évite d'amorcer N vidéos dans une grille. */
  posterUrl?: string | null;
  /** GIF legacy — affiché uniquement en l'absence de vidéo. */
  gifUrl?: string | null;
  alt?: string;
  /** Nom accessible de la commande lecture/pause. À renseigner quand `alt` est
      volontairement vide (nom déjà affiché en texte à côté de la vignette) —
      sinon chaque vignette d'une grille annonce le même « Lire la démonstration »
      générique, sans dire de quel exercice. Par défaut, reprend `alt`. */
  label?: string;
  /** Classes du conteneur : ratio, largeur, arrondi, fond. */
  className?: string;
  /** Classes du média. Par défaut il remplit le conteneur en `object-cover`. */
  mediaClassName?: string;
  /** Grilles kiné : lecture au survol en desktop. Désactivé en mode sélection. */
  autoPlayOnHover?: boolean;
  /** Lecture au clic / au tap sur le média lui-même. À passer à `false` là où
      le geste a déjà un rôle : carrousel (avancer d'une vignette), mode
      sélection (cocher l'exercice). Sans ça, la lecture volerait le geste. */
  playOnClick?: boolean;
  /** Démarre seule peu après l'affichage. Réservé aux surfaces qu'on ouvre
      exprès pour regarder la démo (panneau de détail) : le kiné a déjà exprimé
      son intention en cliquant, lui redemander un geste est une friction. */
  autoPlayOnMount?: boolean;
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
  label,
  className = '',
  mediaClassName = 'block h-full w-full object-cover',
  autoPlayOnHover = false,
  playOnClick = true,
  autoPlayOnMount = false,
  autoPlay,
}: ExerciceMediaProps) {
  // Nom accessible de la commande : `label` s'il est fourni, sinon `alt`.
  const playLabel = label || alt;
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

  const toggle = useCallback(() => {
    if (playing) stop();
    else play();
  }, [playing, play, stop]);

  // Survol : on n'amorce la lecture qu'après HOVER_INTENT_MS passées sur la
  // vignette. Le clic, lui, reste instantané — il exprime déjà l'intention.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverIntent = useCallback(() => {
    if (hoverTimer.current === null) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  const handleHoverStart = useCallback(() => {
    cancelHoverIntent();
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      play();
    }, HOVER_INTENT_MS);
  }, [cancelHoverIntent, play]);

  const handleHoverEnd = useCallback(() => {
    // Annuler d'abord : sinon un départ de souris avant l'échéance laisserait
    // le minuteur lancer la lecture sur une vignette qu'on a déjà quittée.
    cancelHoverIntent();
    stop();
  }, [cancelHoverIntent, stop]);

  // Le minuteur ne doit survivre ni au démontage, ni à un changement de source.
  useEffect(() => cancelHoverIntent, [cancelHoverIntent, videoUrl, gifUrl]);

  // Démarrage automatique à l'affichage, pour les surfaces ouvertes exprès.
  // `autoPlay` (pilotage externe) reste prioritaire : deux sources de vérité se
  // contrediraient. Le minuteur est annulé au démontage — un panneau refermé
  // avant l'échéance ne doit pas lancer une vidéo qui n'est plus à l'écran.
  useEffect(() => {
    if (!autoPlayOnMount || autoPlay !== undefined || !videoUrl) return;
    const timer = setTimeout(play, OPEN_AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoPlayOnMount, autoPlay, videoUrl, play]);

  // Lecture au geste : seulement si personne ne pilote déjà la lecture depuis
  // l'extérieur (`autoPlay`), sinon le clic de l'utilisateur et le parent se
  // contrediraient.
  const clickToPlay = playOnClick && autoPlay === undefined;

  // Le survol est un mécanisme d'APERÇU : il lance au survol et rembobine au
  // départ de la souris. Il n'a aucun sens là où la vidéo tourne déjà en boucle
  // parce qu'on a ouvert la surface pour ça — il reprendrait la main et
  // rembobinerait la démo au premier passage de souris. `autoPlayOnMount` le
  // désactive donc, même si un appelant passe les deux.
  const hoverEnabled = autoPlayOnHover && !isMobile && !autoPlayOnMount;

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
          onError={() => setFailed(true)}
          onMouseEnter={hoverEnabled ? handleHoverStart : undefined}
          onMouseLeave={hoverEnabled ? handleHoverEnd : undefined}
          // Rien ne se superpose plus au média : sur mobile, un bouton centré
          // masquait précisément la partie du mouvement qu'on vient regarder.
          // C'est donc la vidéo elle-même qui porte la commande.
          //
          // Elle en porte alors aussi le rôle et le nom accessibles, et devient
          // atteignable au clavier : une démonstration d'exercice n'est pas
          // décorative, un kiné qui navigue au clavier doit pouvoir la lancer
          // (WCAG 2.1.1, niveau A). Espace et Entrée sont les deux touches
          // attendues d'un `role="button"`.
          role={clickToPlay ? 'button' : undefined}
          tabIndex={clickToPlay ? 0 : undefined}
          aria-label={
            clickToPlay
              ? `${playing ? 'Arrêter' : 'Lire'} la démonstration${playLabel ? ` de ${playLabel}` : ''}`
              : alt || undefined
          }
          onClick={
            clickToPlay
              ? (e) => {
                  // Le geste sert à lire, pas à déclencher ce que fait un
                  // ancêtre cliquable.
                  e.stopPropagation();
                  toggle();
                }
              : undefined
          }
          onKeyDown={
            clickToPlay
              ? (e) => {
                  if (e.key !== ' ' && e.key !== 'Enter') return;
                  e.preventDefault();
                  e.stopPropagation();
                  toggle();
                }
              : undefined
          }
          className={`${mediaClassName}${clickToPlay ? ' cursor-pointer' : ''}`}
        />

        {/* Poster superposé, et non le seul attribut `poster` natif.
            La spec HTML ne permet pas de revenir au poster : son « show poster
            flag » tombe dès la première lecture et seul un `load()` le relève —
            au prix d'un rechargement de la vidéo. Au repos, la balise réaffiche
            donc son image 0, celle où le kiné est encore en position de départ,
            alors que le poster est pris au milieu du mouvement : le retour de
            survol sautait d'une image à l'autre.

            Une image superposée qu'on fait apparaître au repos règle les deux
            choses d'un coup — l'image de repos redevient le poster, et le
            passage se fond au lieu de couper. C'est le motif de YouTube et
            Netflix, pour cette raison précise.

            `inset-0 m-auto` recentre quel que soit le cadrage : les appelants
            passent aussi bien `h-full w-full object-cover` (grilles) que
            `w-auto max-h-[70vh] object-contain` (panneau de détail).
            `pointer-events-none` : le clic traverse et atteint la vidéo.
            `motion-reduce` : pas de fondu du tout si le système demande moins
            d'animations — c'est la première chose à vérifier si le fondu semble
            absent (Windows : Accessibilité › Effets visuels › Effets d'animation). */}
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 m-auto transition-opacity duration-700 ease-out motion-reduce:transition-none ${mediaClassName} ${
              playing ? 'opacity-0' : 'opacity-100'
            }`}
          />
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
