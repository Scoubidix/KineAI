// Carte à vérifier tranchée : elle devient sa ligne sur place (motif « container transform » de
// Material Design 3) au lieu de disparaître d'un bloc. L'espace qu'elle occupait se referme en
// douceur sous la ligne qui reçoit la valeur, et cette ligne passe de la couleur de la carte au
// teal avant de s'éteindre ; ce qui suit glisse au lieu de sauter. Web Animations API, aucune
// bibliothèque. Animations réduites (prefers-reduced-motion, WCAG 2.3.3) : seule la couleur change.

const TEAL_TINT = 'rgba(56, 153, 170, 0.18)';
const TEAL_CLEAR = 'rgba(56, 153, 170, 0)';
const CLOSE_MS = 300;
const TINT_MS = 1000;

/** La carte telle qu'elle était à l'écran, relevée avant qu'elle ne disparaisse */
export interface CardSnapshot {
  rect: DOMRect;
  background: string;
  /** Élément qui la précédait : il referme l'espace quand aucune ligne ne reçoit de valeur */
  previous: HTMLElement | null;
}

export function snapshotCard(card: HTMLElement): CardSnapshot {
  const previous = card.previousElementSibling;
  return { rect: card.getBoundingClientRect(), background: getComputedStyle(card).backgroundColor, previous: previous instanceof HTMLElement ? previous : null };
}

/**
 * `anchor` : la ligne qui a reçu la valeur (`tint` : elle prend la couleur de la carte puis
 * s'éteint), ou l'élément qui précédait la carte. La promesse se résout quand l'espace est refermé.
 */
export function closeGap(card: CardSnapshot, anchor: HTMLElement, tint: boolean): Promise<void> {
  if (typeof anchor.animate !== 'function') return Promise.resolve();
  if (tint) {
    anchor.animate(
      [{ backgroundColor: card.background }, { backgroundColor: TEAL_TINT, offset: 0.3 }, { backgroundColor: TEAL_CLEAR }],
      { duration: TINT_MS, easing: 'ease-out' },
    );
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  // Espace laissé par la carte sous l'ancre. Une ancre qui n'était pas au contact de la carte
  // (validation dans le désordre) n'a rien à refermer.
  const gap = card.rect.bottom - anchor.getBoundingClientRect().bottom;
  if (gap <= 0 || gap > card.rect.height + 24) return Promise.resolve();
  return anchor
    .animate([{ marginBottom: `${gap}px` }, { marginBottom: '0px' }], { duration: CLOSE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    .finished.then(() => undefined, () => undefined);
}
