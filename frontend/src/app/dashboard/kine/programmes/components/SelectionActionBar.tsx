'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { ArrowRight, User, X } from 'lucide-react';

interface SelectionActionBarProps {
  exercicesCount: number;
  templatesCount: number;
  patientName: string | null;
  onClearPatient: () => void;
  onCancel: () => void;
  onContinue: () => void;
}

/**
 * Barre d'action contextuelle du mode sélection (Material Design : contextual
 * action bar). Fixée en bas, elle survit au changement d'onglet puisque l'état
 * de sélection vit dans le shell.
 *
 * Elle épouse son contenu à partir de `sm` au lieu de s'étirer : compteur et
 * bouton restent alors côte à côte, comme dans les barres de sélection de Google
 * Drive ou Figma. Étirée, elle creusait un vide de plusieurs centaines de pixels
 * entre l'information et l'action qu'elle commande.
 */
export function SelectionActionBar({
  exercicesCount,
  templatesCount,
  patientName,
  onClearPatient,
  onCancel,
  onContinue,
}: SelectionActionBarProps) {
  // Le conteneur est `fixed`, donc il ignore le décalage que la sidebar impose
  // au contenu : sans compensation, la barre se centre sur la fenêtre et se
  // retrouve décalée d'une demi-largeur de sidebar par rapport à la grille
  // qu'elle commande. On récupère l'état pour suivre aussi le repli en icônes.
  const { state } = useSidebar();

  const total = exercicesCount + templatesCount;

  const parts: string[] = [];
  if (exercicesCount > 0) {
    parts.push(`${exercicesCount} exercice${exercicesCount > 1 ? 's' : ''}`);
  }
  if (templatesCount > 0) {
    parts.push(`${templatesCount} template${templatesCount > 1 ? 's' : ''}`);
  }
  const summary = parts.length > 0 ? parts.join(' · ') : 'Aucune sélection';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pt-3 transition-[padding] duration-200 ease-linear ${
        state === 'collapsed'
          ? 'md:pl-[calc(var(--sidebar-width-icon)_+_1rem)]'
          : 'md:pl-[calc(var(--sidebar-width)_+_1rem)]'
      }`}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      {/* Pleine largeur au doigt, ajustée au contenu dès qu'il y a la place. */}
      <div className="w-full sm:w-auto sm:max-w-[calc(100vw-2rem)] rounded-xl border bg-background/95 backdrop-blur shadow-lg px-3 py-2 flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Le libellé apparaît dès qu'il y a la place ; il est inclus dans le nom
            accessible, sans quoi un utilisateur au pilotage vocal disant
            « cliquer sur Annuler » n'atteindrait pas la cible (WCAG 2.5.3). */}
        <Button
          variant="ghost"
          onClick={onCancel}
          aria-label="Annuler la sélection"
          className="h-8 shrink-0 px-2 sm:px-3"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:ml-1.5 sm:inline">Annuler</span>
        </Button>

        {patientName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#3899aa]/10 text-[#3899aa] px-3 py-1 text-xs font-medium">
            <User className="h-3 w-3" />
            Pour {patientName}
            <button
              type="button"
              onClick={onClearPatient}
              aria-label="Retirer le patient pré-sélectionné"
              className="ml-1 hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        {/* Le compteur est l'information principale de la barre : il porte plus
            de poids que la pastille patient. Annoncé aux lecteurs d'écran à
            chaque changement.
            Il pousse le bouton à droite au doigt (`flex-1`), mais se contente de
            sa largeur dès `sm`, sinon le vide réapparaîtrait. */}
        <span
          className="text-sm font-semibold flex-1 sm:flex-none min-w-[8rem] sm:min-w-0 whitespace-nowrap"
          aria-live="polite"
        >
          {summary}
        </span>

        <Button className="btn-teal shrink-0" onClick={onContinue} disabled={total === 0}>
          Continuer
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
