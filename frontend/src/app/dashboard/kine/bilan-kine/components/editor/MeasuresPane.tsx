'use client';
import React, { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, PanelRightClose, Ruler } from 'lucide-react';
import { useMinWidth } from './useMinWidth';

/** Hôte des actions de l'étape Document dans la barre repliée mobile (portail) */
export const DRAWER_ACTIONS_ID = 'bilan-drawer-actions';

/** Largeur du panneau latéral déplié. */
export const PANE_WIDTH = 380;
/** En dessous de cette largeur utile, une ligne de mesure ne tient plus : elle s'empile. */
const DENSE_BELOW = 460;

/**
 * Le meuble est-il trop étroit pour une ligne de mesure d'un seul tenant ?
 *
 * Pas de mesure de conteneur : les deux cas sont connus d'avance. Le panneau latéral fait
 * toujours {@link PANE_WIDTH}, donc il est toujours à l'étroit ; la feuille du bas fait la
 * largeur de l'écran, donc elle ne l'est que sur téléphone.
 */
export function useDensePane(wide: boolean): boolean {
  const roomy = useMinWidth(DENSE_BELOW);
  return wide || !roomy;
}

interface MeasuresPaneProps {
  /** Résumé affiché sur le rail et la barre repliée : « Mesures · 12 · 3 à vérifier » */
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ≥ 1024 px : side sheet coplanaire + rail ; sinon bottom sheet. Calculé une fois par l'hôte. */
  wide: boolean;
  children: React.ReactNode;
}

/**
 * Le meuble des mesures, sans son contenu : Material 3 « standard side sheet » coplanaire réduit
 * en rail au-delà de 1024 px, « standard bottom sheet » replié en barre en dessous. Deux états,
 * jamais absent de l'écran.
 *
 * Le contenu est passé en enfants : l'éditeur y met l'extraction, les templates et le bilan de
 * référence ; la correction d'un bilan enregistré n'y met que les mesures. Le meuble, lui, se
 * comporte pareil partout — c'est ce qui fait qu'on le reconnaît d'un écran à l'autre.
 */
export default function MeasuresPane({ summary, open, onOpenChange, wide, children }: MeasuresPaneProps) {
  // Focus rendu à la commande à la fermeture (pas au montage)
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (wide) {
    // Fermé, le panneau n'occupe aucune largeur et ne laisse rien sur le bord : sa commande vit
    // dans la barre d'outils du document, comme le volet de navigation de Word ou les panneaux de
    // Figma. Il reste monté pour que l'ouverture et la fermeture se fassent en glissant.
    return (
      <aside
        aria-label="Mesures du bilan"
        aria-hidden={!open}
        style={{ width: open ? PANE_WIDTH : 0 }}
        className={`shrink-0 overflow-hidden bg-white dark:bg-card transition-[width] duration-300 ease-out motion-reduce:transition-none lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100dvh-3.5rem)] ${open ? 'border-l border-border/40' : 'pointer-events-none'}`}
      >
        <div style={{ width: PANE_WIDTH }} className="flex h-full flex-col">
            <button
              ref={toggleRef}
              type="button"
              aria-expanded
              aria-label="Replier les mesures"
              title="Replier les mesures"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-[#3899aa]/[0.07] hover:bg-[#3899aa]/[0.14] transition-colors text-left w-full"
            >
              <Ruler className="h-4 w-4 text-[#3899aa] shrink-0" />
              <span className="text-sm font-semibold flex-1 min-w-0 truncate">{summary}</span>
              <span className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-[#3899aa]"><PanelRightClose className="h-[18px] w-[18px]" /></span>
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto">{open && children}</div>
        </div>
      </aside>
    );
  }

  return (
    <div role="region" aria-label="Mesures du bilan" className={`fixed inset-x-0 bottom-0 z-30 bg-white dark:bg-card border-t border-border/40 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex flex-col transition-[height] duration-200 ${open ? 'h-[calc(100dvh-3.5rem)]' : 'h-12'}`}>
      <div className="flex items-center gap-2 px-3 h-12 shrink-0 bg-[#3899aa]/[0.07]">
        <button ref={toggleRef} type="button" aria-expanded={open} aria-label={open ? 'Replier les mesures' : 'Ouvrir les mesures'} onClick={() => onOpenChange(!open)} className="flex items-center gap-2 flex-1 min-w-0 h-full text-left">
          <span className="h-1 w-8 rounded-full bg-border shrink-0" aria-hidden />
          <span className="text-sm font-medium truncate">{summary}</span>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronUp className="h-4 w-4 shrink-0" />}
        </button>
        <div id={DRAWER_ACTIONS_ID} className="flex items-center gap-1.5 shrink-0" />
      </div>
      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto border-t border-border/40">
          {children}
        </div>
      )}
    </div>
  );
}
