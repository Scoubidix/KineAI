'use client';

import React from 'react';
import type { Side } from '@/types/bilan';

interface SideSelectorProps {
  value: Side | undefined;
  onChange: (side: Side | undefined) => void;
  disabled?: boolean;
}

const OPTIONS: { key: Side | undefined; label: string; title: string }[] = [
  { key: 'D', label: 'D', title: 'Droite' },
  { key: 'G', label: 'G', title: 'Gauche' },
  { key: undefined, label: '—', title: 'Côté non précisé' },
];

// Choix du côté pour une mesure latéralisée (D / G / non précisé)
export default function SideSelector({ value, onChange, disabled }: SideSelectorProps) {
  return (
    <div className="inline-flex rounded-md border border-input overflow-hidden shrink-0" role="radiogroup" aria-label="Côté">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={`px-2 h-8 text-xs font-medium transition-colors ${value === o.key ? 'bg-[#3899aa] text-white' : 'bg-background text-foreground hover:bg-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
