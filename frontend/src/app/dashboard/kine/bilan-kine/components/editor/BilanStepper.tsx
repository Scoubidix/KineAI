'use client';
import React from 'react';
import { Check } from 'lucide-react';

export type EditorStep = 'capture' | 'document';
export const STEPS: { key: EditorStep; label: string }[] = [
  { key: 'capture', label: 'Notes' },
  { key: 'document', label: 'Document' },
];

interface BilanStepperProps { step: EditorStep; onStep: (s: EditorStep) => void }

// Stepper non linéaire : toutes les étapes sont cliquables (Material Stepper)
export default function BilanStepper({ step, onStep }: BilanStepperProps) {
  const current = STEPS.findIndex((s) => s.key === step);
  return (
    <nav aria-label="Étapes du bilan" className="flex items-center justify-center gap-2 py-2">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span className={`h-0.5 w-8 sm:w-14 ${i <= current ? 'bg-[#3899aa]' : 'bg-border'}`} />}
            <button type="button" onClick={() => onStep(s.key)} aria-current={active ? 'step' : undefined} className={`flex items-center gap-1.5 text-xs sm:text-sm ${active ? 'text-[#3899aa] font-semibold' : 'text-muted-foreground'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${active ? 'bg-[#3899aa] border-[#3899aa] text-white' : done ? 'border-[#3899aa] text-[#3899aa]' : 'border-border'}`}>{done ? <Check className="h-3 w-3" /> : i + 1}</span>
              <span className={active ? '' : 'hidden sm:inline'}>{s.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
