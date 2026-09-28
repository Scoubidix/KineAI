'use client';

import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import MeasurementsPanel from '../MeasurementsPanel';
import HighlightedNotes from './HighlightedNotes';
import { useMeasuresReference } from './useMeasuresReference';
import { removeMeasurement, resolvePending } from './review';
import { emptyBilanDocument, type BilanPatch, type BilanRecord, type DocumentMeasurement } from '@/types/bilan';

export interface MeasuresStepProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  disabled: boolean;
  /** ≥ 1024 px : les notes en colonne à côté du tableau ; sinon en feuille du bas */
  wide: boolean;
  onBack: () => void;
  /** « Rédiger le bilan » : le rédacteur, sur le tableau validé */
  onCompose: () => void;
  /** « Rédiger moi-même » / « Continuer » : l'étape Document sans IA */
  onSkip: () => void;
  composing: boolean;
}

const plural = (n: number, s: string) => `${s}${n > 1 ? 's' : ''}`;

// Étape Mesures (spec 2026-09-26 §3) : le tableau tel qu'il sera imprimé, pré-rempli par
// l'extraction, à relire. Les lignes à vérifier sont à leur place dans le tableau ; la pastille
// d'en-tête mène à la suivante (modèle « error summary » du GOV.UK Design System).
export default function MeasuresStep({ record, update, disabled, wide, onBack, onCompose, onSkip, composing }: MeasuresStepProps) {
  const doc = record.document ?? emptyBilanDocument();
  const pending = doc.review?.pending ?? [];
  const notes = record.rawNotes ?? '';
  const hasNotes = notes.trim().length > 0;
  const filledCount = doc.measurements.filter((m) => Boolean(m.quote)).length;
  const anyText = doc.sections.some((s) => s.text.trim() !== '');
  const [quote, setQuote] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { previousValues, line: referenceLine, modal: referenceModal } = useMeasuresReference({ record, update, disabled });

  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });
  const showQuote = (q: string) => { setQuote(q); if (!wide) setSheetOpen(true); };
  const nextPending = () => {
    const first = pending[0];
    if (first) document.getElementById(`pending-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const handleCompose = () => (anyText ? setConfirmOpen(true) : onCompose());

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 pt-6 pb-3 flex gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Annonce le décompte quand une ligne est tranchée (WCAG 4.1.3, messages d'état) */}
          <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
            <span><strong>{filledCount} {plural(filledCount, 'mesure')}</strong> {plural(filledCount, 'remplie')} depuis tes notes</span>
            {pending.length > 0 ? (
              <button type="button" onClick={nextPending} className="min-h-8 rounded-full border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {pending.length} à vérifier ↓
              </button>
            ) : filledCount > 0 ? (
              <span className="rounded-full bg-[#3899aa]/10 px-2.5 py-0.5 text-xs font-semibold text-[#3899aa]">Tout est vérifié</span>
            ) : null}
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Relis le tableau. Touche une valeur pour la corriger, la croix pour la retirer.</p>
          {referenceLine}
          <MeasurementsPanel
            measurements={doc.measurements}
            onChange={setMeasurements}
            onRemove={(i) => update({ document: removeMeasurement(doc, i) })}
            pending={pending}
            onResolve={(id, r) => update({ document: resolvePending(doc, id, r) })}
            onShowQuote={showQuote}
            disabled={disabled}
            previousValues={previousValues}
            dense={!wide}
          />
        </div>
        {wide && hasNotes && (
          <aside aria-label="Tes notes" className="sticky top-20 w-[340px] shrink-0 self-start max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-border/60 bg-white p-4 dark:bg-card">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tes notes</h2>
            <HighlightedNotes notes={notes} quote={quote} />
          </aside>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2 backdrop-blur">
        {hasNotes && pending.length > 0 && (
          <p className="mb-1.5 text-xs text-amber-700 dark:text-amber-300">
            {pending.length} {plural(pending.length, 'ligne')} à vérifier ne {pending.length > 1 ? 'seront' : 'sera'} pas {plural(pending.length, 'reprise')} si tu continues.
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={disabled} className="h-9"><ArrowLeft className="h-4 w-4 mr-1" />Notes</Button>
          <div className="flex items-center gap-2">
            {hasNotes ? (
              <>
                <Button variant="ghost" size="sm" onClick={onSkip} disabled={disabled} className="h-9">Rédiger moi-même</Button>
                <Button onClick={handleCompose} disabled={disabled || composing} className="btn-teal rounded-full px-5 h-9">
                  {composing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}Rédiger le bilan<ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            ) : (
              <Button onClick={onSkip} disabled={disabled} className="btn-teal rounded-full px-5 h-9">Continuer<ArrowRight className="h-4 w-4 ml-1" /></Button>
            )}
          </div>
        </div>
      </div>

      {!wide && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Dans tes notes</SheetTitle>
              <SheetDescription className="sr-only">Le passage cité est surligné.</SheetDescription>
            </SheetHeader>
            <div className="mt-3"><HighlightedNotes notes={notes} quote={quote} /></div>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer les sections déjà rédigées ?</AlertDialogTitle>
            <AlertDialogDescription>La rédaction écrit les 7 sections à partir de tes notes et de ton tableau. Les textes actuels seront écrasés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); onCompose(); }} className="btn-teal">Rédiger</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {referenceModal}
    </div>
  );
}
