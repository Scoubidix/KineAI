'use client';

import React from 'react';
import type { Presentation } from '@/types/bilan';

interface PresentationToggleProps {
  value: Presentation;
  onChange: (p: Presentation) => void;
  disabled?: boolean;
}

// Où la mesure apparaît dans le compte-rendu : tableau de l'examen ou prose (rédacteur IA)
export default function PresentationToggle({ value, onChange, disabled }: PresentationToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-input overflow-hidden shrink-0" role="radiogroup" aria-label="Présentation">
      {(['table', 'narrative'] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          disabled={disabled}
          onClick={() => onChange(p)}
          className={`px-2 h-7 text-[11px] font-medium transition-colors ${value === p ? 'bg-[#3899aa]/15 text-[#3899aa]' : 'bg-background text-muted-foreground hover:bg-muted'}`}
        >
          {p === 'table' ? 'Tableau' : 'Littérature'}
        </button>
      ))}
    </div>
  );
}
