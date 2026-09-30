'use client';

import React, { useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import MeasurementsPanel from '../MeasurementsPanel';
import HighlightedNotes from './HighlightedNotes';
import { useMeasuresReference } from './useMeasuresReference';
import { removeMeasurements, resolvePending, type Resolution } from './review';
import { emptyBilanDocument, type BilanPatch, type BilanRecord, type DocumentMeasurement } from '@/types/bilan';

export interface MeasuresStepProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  disabled: boolean;
  /** ≥ 1024 px : les notes en colonne à côté du tableau ; sinon en feuille du bas */
  wide: boolean;
  /** « Rédiger le bilan » : le rédacteur, sur le tableau validé */
  onCompose: () => void;
  /** « Continuer » (sans notes) : l'étape Document sans IA. Avec des notes, le stepper y mène. */
  onSkip: () => void;
  composing: boolean;
}

const plural = (n: number, s: string) => `${s}${n > 1 ? 's' : ''}`;

// Étape Mesures (spec 2026-09-26 §3) : le tableau tel qu'il sera imprimé, pré-rempli par
// l'extraction, à relire. Les lignes à vérifier sont à leur place dans le tableau ; la pastille du
// bas de page mène à la suivante (modèle « error summary » du GOV.UK Design System).
export default function MeasuresStep({ record, update, disabled, wide, onCompose, onSkip, composing }: MeasuresStepProps) {
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
  // Amène une carte au centre de l'écran et lui donne le focus
  const goToCard = (el: HTMLElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };
  // Première carte à vérifier dans l'ordre de l'écran (pas celui de la liste)
  const nextPending = () => goToCard(document.querySelector<HTMLElement>('[data-pending]'));
  // Carte tranchée : elle disparaît avec le bouton touché ; l'écran passe à la suivante (la
  // première restante après la dernière) au lieu de laisser le focus retomber en haut de page
  // (WCAG 2.4.3)
  const handleResolve = (id: string, r: Resolution) => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-pending]'));
    const i = cards.findIndex((el) => el.id === `pending-${id}`);
    const next = (cards[i + 1] ?? (i > 0 ? cards[0] : undefined))?.id;
    update({ document: resolvePending(doc, id, r) });
    if (next) setTimeout(() => goToCard(document.getElementById(next)), 0);
  };
  // « Vérifier » dans la confirmation : la fenêtre rend le focus au bouton qui l'a ouverte, on le
  // redirige vers la carte
  const verifyAfterCloseRef = useRef(false);
  const handleCompose = () => (pending.length > 0 || anyText ? setConfirmOpen(true) : onCompose());

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 pt-6 pb-3 flex gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Annonce le décompte quand une ligne est tranchée (WCAG 4.1.3, messages d'état) */}
          {hasNotes && (
            <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
              {filledCount === 0 && pending.length === 0 ? (
                <span>Aucun test trouvé dans tes notes, ajoute-les ou rédige directement.</span>
              ) : (
                <>
                  <span><strong>{filledCount} {plural(filledCount, 'mesure')}</strong> {plural(filledCount, 'remplie')} depuis tes notes</span>
                  {pending.length === 0 && <span className="rounded-full bg-[#3899aa]/10 px-2.5 py-0.5 text-xs font-semibold text-[#3899aa]">Tout est vérifié</span>}
                </>
              )}
            </div>
          )}
          {referenceLine}
          <MeasurementsPanel
            measurements={doc.measurements}
            onChange={setMeasurements}
            onRemove={(indices) => update({ document: removeMeasurements(doc, indices) })}
            pending={pending}
            onResolve={handleResolve}
            onShowQuote={showQuote}
            disabled={disabled}
            previousValues={previousValues}
            dense={!wide}
            hideProgress
          />
        </div>
        {wide && hasNotes && (
          <aside aria-label="Tes notes" className="sticky top-20 w-[340px] shrink-0 self-start max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-border/60 bg-white p-4 dark:bg-card">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tes notes</h2>
            <HighlightedNotes notes={notes} quote={quote} />
          </aside>
        )}
      </div>

      {/* Une seule ligne : la pastille mène à la prochaine carte, l'avertissement « non reprises »
          n'apparaît qu'au clic sur « Rédiger le bilan ». Notes et Document passent par le stepper. */}
      <div className="sticky bottom-0 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          {pending.length > 0 ? (
            <button type="button" onClick={nextPending} aria-label={`${pending.length} ${plural(pending.length, 'mesure')} à vérifier, aller à la suivante`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />{pending.length} à vérifier<ArrowDown className="h-3.5 w-3.5" />
            </button>
          ) : <span />}
          {hasNotes ? (
            <Button onClick={handleCompose} disabled={disabled || composing} className="btn-teal rounded-full px-5 h-9">
              {composing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}Rédiger le bilan<ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={onSkip} disabled={disabled} className="btn-teal rounded-full px-5 h-9">Continuer<ArrowRight className="h-4 w-4 ml-1" /></Button>
          )}
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

      {/* Une seule confirmation, quels que soient les motifs : lignes non vérifiées, texte déjà rédigé */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onCloseAutoFocus={(e) => { if (verifyAfterCloseRef.current) { verifyAfterCloseRef.current = false; e.preventDefault(); nextPending(); } }}>
          {pending.length > 0 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{pending.length} {plural(pending.length, 'mesure')} non {plural(pending.length, 'vérifiée')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {pending.length > 1 ? 'Elles ne seront pas reprises' : 'Elle ne sera pas reprise'} dans le bilan.{anyText ? ' Les sections déjà rédigées seront aussi remplacées.' : ''}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => { setConfirmOpen(false); onCompose(); }} className="border border-input bg-transparent text-foreground hover:bg-muted">Rédiger quand même</AlertDialogAction>
                {/* Choix sûr, focalisé à l'ouverture (Radix place le focus sur Cancel) */}
                <AlertDialogCancel onClick={() => { verifyAfterCloseRef.current = true; }} className="btn-teal border-0 hover:text-white">Vérifier</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Remplacer les sections déjà rédigées ?</AlertDialogTitle>
                <AlertDialogDescription>La rédaction écrit les 7 sections à partir de tes notes et de ton tableau. Les textes actuels seront écrasés.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => { setConfirmOpen(false); onCompose(); }} className="btn-teal">Rédiger</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
      {referenceModal}
    </div>
  );
}
