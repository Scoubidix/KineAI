'use client';
import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RefreshCw, Loader2, AlertTriangle, X } from 'lucide-react';
import type { BilanSectionKey } from '@/types/bilan';

interface SectionCardProps {
  sectionKey: BilanSectionKey;
  title: string;
  text: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  /** Notes présentes : la régénération IA est possible */
  canRegenerate: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
  warning?: 'unverified_number';
  onDismissWarning?: () => void;
}

export default function SectionCard({ sectionKey, title, text, onChange, disabled, canRegenerate, onRegenerate, regenerating, warning, onDismissWarning }: SectionCardProps) {
  const empty = text.trim() === '';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const regenerate = () => { if (empty) onRegenerate?.(); else setConfirmOpen(true); };
  return (
    <section className={`rounded-lg border ${empty ? 'border-border/40' : 'border-border/70'} bg-white dark:bg-card`} aria-labelledby={`section-${sectionKey}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <h3 id={`section-${sectionKey}`} className={`text-sm font-semibold ${empty ? 'text-muted-foreground' : ''}`}>{title}{empty && <span className="ml-2 text-[10px] font-normal">· vide</span>}</h3>
        <Tooltip>
          <TooltipTrigger asChild><span><Button variant="ghost" size="sm" onClick={regenerate} disabled={disabled || !canRegenerate || regenerating} aria-label="Régénérer cette section avec l’IA" className="h-7 w-7 p-0">{regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</Button></span></TooltipTrigger>
          <TooltipContent>{canRegenerate ? 'Régénérer avec l’IA' : 'Saisis des notes pour utiliser l’IA'}</TooltipContent>
        </Tooltip>
      </div>
      {warning === 'unverified_number' && (
        <div role="status" className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-1.5 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Chiffre à vérifier : un nombre de ce texte n’apparaît ni dans tes notes ni dans tes mesures.</span>
          {onDismissWarning && <button type="button" onClick={onDismissWarning} aria-label="Masquer l’avertissement" className="p-0.5"><X className="h-3 w-3" /></button>}
        </div>
      )}
      <Textarea value={text} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={5000} placeholder="Rédige ici ou laisse vide (la section ne sera pas imprimée)" className="min-h-[72px] border-0 rounded-none rounded-b-lg text-sm leading-relaxed resize-y focus-visible:ring-0" />
      {text.length > 4500 && (
        <div className="px-3 pb-1.5 text-right"><span className="text-[10px] text-muted-foreground">{text.length} / 5000</span></div>
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
