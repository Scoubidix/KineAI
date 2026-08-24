'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
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
 */
export function SelectionActionBar({
  exercicesCount,
  templatesCount,
  patientName,
  onClearPatient,
  onCancel,
  onContinue,
}: SelectionActionBarProps) {
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
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pt-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-3xl rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-3 flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Quitter le mode sélection"
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
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

        {/* Le compteur est annoncé aux lecteurs d'écran à chaque changement. */}
        <span className="text-sm font-medium flex-1 min-w-[8rem]" aria-live="polite">
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
