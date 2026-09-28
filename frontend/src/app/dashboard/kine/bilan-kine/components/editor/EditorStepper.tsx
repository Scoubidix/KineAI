'use client';
import React from 'react';
import type { EditorStep } from '../../[bilanId]/page';

const STEPS: { key: EditorStep; label: string }[] = [
  { key: 'capture', label: 'Notes' },
  { key: 'verification', label: 'Mesures' },
  { key: 'document', label: 'Document' },
];

// Indicateur d'étapes non linéaire (Material Design « stepper ») : chaque étape reste accessible,
// l'étape courante est marquée. La navigation principale reste dans les boutons de bas de page.
export default function EditorStepper({ step, onSelect, disabled }: { step: EditorStep; onSelect: (s: EditorStep) => void; disabled?: boolean }) {
  return (
    <nav aria-label="Étapes du bilan" className="flex items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const current = s.key === step;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span aria-hidden className="text-muted-foreground/60">›</span>}
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              disabled={disabled || current}
              aria-current={current ? 'step' : undefined}
              className={`min-h-8 rounded-full px-2.5 py-1 font-medium transition-colors ${current ? 'bg-[#3899aa] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50'}`}
            >
              {i + 1}. {s.label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
