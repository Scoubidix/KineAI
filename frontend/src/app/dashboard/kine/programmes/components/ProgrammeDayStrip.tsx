'use client';

import React from 'react';
import type { DayState } from '@/utils/programmeStats';

const CLASSES: Record<DayState, string> = {
  validated: 'bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a]',
  missed: 'bg-destructive/70',
  today: 'bg-white/40 ring-1 ring-white/70',
  future: 'bg-white/20',
};

interface ProgrammeDayStripProps {
  states: DayState[];
  /** Variante sur fond clair (panneau de détail) plutôt que sur le bloc teal. */
  onLight?: boolean;
}

const LIGHT_CLASSES: Record<DayState, string> = {
  validated: 'bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a]',
  missed: 'bg-destructive/70',
  today: 'bg-muted ring-1 ring-[#3899aa]',
  future: 'bg-muted',
};

/**
 * Un segment par jour du programme, sans plafond : les segments s'amincissent
 * plutôt que de tronquer la durée réelle.
 */
export function ProgrammeDayStrip({ states, onLight = false }: ProgrammeDayStripProps) {
  const palette = onLight ? LIGHT_CLASSES : CLASSES;

  return (
    <div className="flex gap-[2px]" aria-hidden="true">
      {states.map((state, i) => (
        <div
          key={i}
          className={`h-2 flex-1 min-w-[2px] rounded-full ${palette[state]}`}
        />
      ))}
    </div>
  );
}
