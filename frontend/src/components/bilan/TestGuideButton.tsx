'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import TestGuideDialog from './TestGuideDialog';

interface TestGuideButtonProps {
  fieldKey: string;
  label: string;
  /** Prévenu à l'ouverture / fermeture de la fiche (ex. la recherche qui se ferme au clic extérieur) */
  onOpenChange?: (open: boolean) => void;
}

/** Bouton ⓘ d'un test du catalogue. À ne rendre que si field.hasGuide. Cible ≥ 24 px (WCAG 2.5.8). */
export default function TestGuideButton({ fieldKey, label, onOpenChange }: TestGuideButtonProps) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <TestGuideDialog fieldKey={fieldKey} label={label} open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        aria-label={`Fiche pratique : ${label}`}
        title="Fiche pratique"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#3899aa] transition-colors hover:bg-[#3899aa]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-4 w-4" />
      </button>
    </TestGuideDialog>
  );
}
