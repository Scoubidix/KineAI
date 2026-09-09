'use client';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RefreshCw, Loader2, AlertTriangle, X } from 'lucide-react';
import type { BilanSectionKey, SectionWarning } from '@/types/bilan';

interface SectionBlockProps {
  sectionKey: BilanSectionKey;
  title: string;
  text: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  /** Notes présentes : la régénération IA est possible */
  canRegenerate: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
  warning?: SectionWarning;
  onDismissWarning?: () => void;
  /** Contenu rendu par le serveur inséré entre le titre et le texte (tableaux de l'examen) */
  before?: React.ReactNode;
}

const WARNING_TEXT: Record<SectionWarning, string> = {
  unverified_number: 'Chiffre à vérifier : un nombre de ce texte n’apparaît ni dans tes notes ni dans tes mesures.',
  table_duplicate: 'Déjà dans le tableau : ce texte reprend une valeur de l’examen clinique. Reformule ou régénère.',
};

// Une section de la page : le titre du PDF, puis le paragraphe éditable, dans la mise en page
// d'impression. Une section vide n'est pas imprimée : son titre reste visible, grisé, pour écrire.
export default function SectionBlock({ sectionKey, title, text, onChange, disabled, canRegenerate, onRegenerate, regenerating, warning, onDismissWarning, before }: SectionBlockProps) {
  const empty = text.trim() === '';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const regenerate = () => { if (empty) onRegenerate?.(); else setConfirmOpen(true); };

  // Hauteur automatique : le texte grandit avec le contenu, jamais d'ascenseur interne
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <section className="bilan-section group" aria-labelledby={`section-${sectionKey}`}>
      <div className="flex items-end gap-2">
        <h2 id={`section-${sectionKey}`} className={`bilan-h2 flex-1 ${empty ? 'opacity-50' : ''}`}>{title}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mb-1 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={regenerate} disabled={disabled || !canRegenerate || regenerating} aria-label={`Régénérer « ${title} » avec l’IA`} className="h-6 w-6 p-0 text-muted-foreground">
                {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{canRegenerate ? 'Régénérer cette section avec l’IA' : 'Saisis des notes pour utiliser l’IA'}</TooltipContent>
        </Tooltip>
      </div>
      {warning && (
        <div role="status" className="mb-1 flex items-center gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{WARNING_TEXT[warning]}</span>
          {onDismissWarning && <button type="button" onClick={onDismissWarning} aria-label="Masquer l’avertissement" className="p-0.5"><X className="h-3 w-3" /></button>}
        </div>
      )}
      {before}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={5000}
        placeholder={empty ? 'Section vide, non imprimée. Rédige ici ou régénère.' : undefined}
        aria-label={title}
        className="bilan-editable block w-full resize-none overflow-hidden border-0 bg-transparent p-0 focus:outline-none disabled:opacity-60"
      />
      {text.length > 4500 && (
        <div className="text-right"><span className="text-[10px] text-muted-foreground">{text.length} / 5000</span></div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Régénérer « {title} » ?</AlertDialogTitle>
            <AlertDialogDescription>Le texte actuel de cette section sera remplacé par la rédaction IA.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); onRegenerate?.(); }} className="btn-teal">Régénérer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
