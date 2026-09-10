'use client';

import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, PenLine, Disc, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import type { BilanPatch, BilanRecord } from '@/types/bilan';
import DictationBar from './DictationBar';
import { useDictation } from './useDictation';

export interface StepProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  // flush() renvoie Promise<boolean> (cf. useBilanAutosave) : true si tout est persisté
  flush: () => Promise<boolean>;
  replaceRecord: (r: BilanRecord) => void;
  disabled?: boolean;
  onBack?: () => void;
  onNext: () => void;
}

const PLACEHOLDER = `Note tes observations en vrac...

Ex : patient 52 ans, maçon, lombalgie chronique depuis 3 mois suite port de charge. ATCD : hernie discale L4-L5 opérée 2018. Douleur bas du dos irradiant fesse droite, EVA 5/10 repos 7/10 effort. Flexion lombaire limitée 40°, Lasègue négatif, paravertébraux contracturés...`;

export interface CaptureStepProps extends StepProps {
  /** « Rédiger avec l'IA » : extraction + acceptation + rédaction, puis étape Document */
  onCompose: () => void;
  composing: boolean;
  dictation: ReturnType<typeof useDictation>;
}

// Étape 1 : la source seule (notes écrites aujourd'hui, dictée et transcription demain).
// Les mesures se saisissent ou se corrigent dans le tiroir, disponible ici comme à l'étape Document.
export default function CaptureStep({ record, update, disabled, onNext, onCompose, composing, dictation }: CaptureStepProps) {
  const notesLength = (record.rawNotes ?? '').length;
  const hasNotes = (record.rawNotes ?? '').trim().length > 0;
  const anyText = (record.document?.sections ?? []).some((s) => s.text.trim() !== '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleComposeClick = () => { if (anyText) setConfirmOpen(true); else onCompose(); };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Dernière position de caret connue : le clic sur « Dicter » (mousedown neutralisé) garde en général
  // le focus sur le textarea, mais on retombe ici si le focus a bougé entre-temps (ex. clavier virtuel).
  const lastCaretRef = useRef<number | null>(null);
  const rememberCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>) => { lastCaretRef.current = e.currentTarget.selectionStart; };
  const caretPos = () => { const el = textareaRef.current; return el && document.activeElement === el ? el.selectionStart : (lastCaretRef.current ?? (record.rawNotes ?? '').length); };
  const dictating = dictation.state.status === 'recording' || dictation.state.inFlight > 0;
  const hint = dictating
    ? 'Transcription en cours…'
    : hasNotes
    ? 'L’IA extrait les mesures de tes notes et rédige le bilan ; tu vérifies ensuite'
    : 'Écris tes notes, ou saisis directement les mesures dans le tiroir';

  const modeChip = (icon: React.ReactNode, label: string, active: boolean) => (
    <span title={active ? undefined : 'Bientôt disponible'} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${active ? 'bg-[#3899aa]/15 text-[#3899aa]' : 'text-muted-foreground opacity-60'}`}>{icon}{label}</span>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source</span>
          <span className="flex-1" />
          {modeChip(<PenLine className="h-3 w-3" />, 'Notes', true)}
          {modeChip(<Disc className="h-3 w-3" />, 'Séance', false)}
        </div>
        <div className="flex items-center gap-2 px-1">
          <Search className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
          <span className="text-xs font-medium text-[#3899aa] shrink-0">Motif</span>
          <Input value={record.motif ?? ''} onChange={(e) => update({ motif: e.target.value })} placeholder="Ex : Lombalgie chronique, rééducation post-opératoire..." disabled={disabled} maxLength={500} className="border-0 border-b border-border/60 rounded-none bg-transparent text-sm h-8 px-2 focus-visible:ring-0" />
        </div>
        <Textarea ref={textareaRef} value={record.rawNotes ?? ''} onChange={(e) => update({ rawNotes: e.target.value })} onSelect={rememberCaret} onBlur={rememberCaret} placeholder={PLACEHOLDER} disabled={disabled} maxLength={50000} className="min-h-[320px] lg:min-h-[480px] text-sm leading-relaxed resize-y rounded-xl border-2 border-border/60 bg-white dark:bg-card p-4 focus-visible:ring-[#3899aa]/50" />
        <DictationBar state={dictation.state} disabled={!!disabled} onStart={() => { void dictation.start(caretPos()); }} onStop={dictation.stop} onRetry={dictation.retryFailed} onIgnore={dictation.ignoreFailed} />
        {notesLength > 45000 && (
          <span className="text-[10px] text-muted-foreground -mt-2 self-end px-1">{notesLength} / 50000</span>
        )}
      </div>
      <div className="sticky bottom-12 lg:bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2">
        <span className="text-[11px] text-muted-foreground hidden sm:inline">{hint}</span>
        <div className="flex items-center gap-2 ml-auto">
          {hasNotes ? (
            <>
              <Button variant="ghost" size="sm" onClick={onNext} disabled={disabled || dictating} className="h-9">Rédiger moi-même</Button>
              <Button onClick={handleComposeClick} disabled={disabled || composing || dictating} className="btn-teal rounded-full px-5 h-9">
                {composing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}Rédiger avec l’IA<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <Button onClick={onNext} disabled={disabled || dictating} className="btn-teal rounded-full px-5 h-9">Continuer<ArrowRight className="h-4 w-4 ml-1" /></Button>
          )}
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer les sections déjà rédigées ?</AlertDialogTitle>
            <AlertDialogDescription>La rédaction IA écrit les 7 sections à partir de tes notes et de tes mesures. Les textes actuels seront écrasés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); onCompose(); }} className="btn-teal">Rédiger</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
