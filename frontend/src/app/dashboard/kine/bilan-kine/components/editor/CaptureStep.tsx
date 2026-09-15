'use client';

import React, { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowRight, PanelRightOpen, Sparkles, Loader2 } from 'lucide-react';
import type { BilanPatch, BilanRecord } from '@/types/bilan';
import DictationBar from './DictationBar';
import { useToast } from '@/hooks/use-toast';
import type { ImportResult } from './useDictation';
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
  /** Ouvre le panneau des mesures : fermé, il n'a pas de rail (cf. MeasuresPane) */
  onOpenMeasures: () => void;
  measuresOpen: boolean;
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
export default function CaptureStep({ record, update, disabled, onNext, onCompose, composing, dictation, onOpenMeasures, measuresOpen }: CaptureStepProps) {
  const notesLength = (record.rawNotes ?? '').length;
  const hasNotes = (record.rawNotes ?? '').trim().length > 0;
  const anyText = (record.document?.sections ?? []).some((s) => s.text.trim() !== '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleComposeClick = () => { if (anyText) setConfirmOpen(true); else onCompose(); };
  const { toast } = useToast();
  const IMPORT_MESSAGES: Partial<Record<ImportResult, { title: string; description?: string }>> = {
    invalid: { title: 'Fichier audio illisible', description: 'Formats acceptés : wav, mp3, m4a, webm, ogg, d’au moins une seconde' },
    too_long: { title: 'Audio trop long', description: '10 minutes maximum par import' },
    unavailable: { title: 'Dictée indisponible pour le moment' },
  };
  const handleImport = (file: File) => {
    void dictation.importFile(file, caretPos()).then((r) => { const m = IMPORT_MESSAGES[r]; if (m) toast({ ...m, variant: 'destructive' }); });
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Dernière position de caret connue : le clic sur « Dicter » (mousedown neutralisé) garde en général
  // le focus sur le textarea, mais on retombe ici si le focus a bougé entre-temps (ex. clavier virtuel).
  const lastCaretRef = useRef<number | null>(null);
  const rememberCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>) => { lastCaretRef.current = e.currentTarget.selectionStart; };
  const caretPos = () => { const el = textareaRef.current; return el && document.activeElement === el ? el.selectionStart : (lastCaretRef.current ?? (record.rawNotes ?? '').length); };
  const dictating = dictation.state.phase !== 'idle';
  const hint = dictation.state.phase === 'correcting'
    ? 'Correction des termes en cours…'
    : dictating
    ? 'Transcription en cours…'
    : '';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 pt-8 pb-3 flex flex-col gap-3">
        {/* Surface d'écriture, pas champ de formulaire : ni bordure ni fond, colonne mesurée à
            ~68 caractères et interligne aéré. Le curseur suffit à signaler le focus dans une
            zone de texte — c'est ce que font les éditeurs de document. */}
        <Textarea ref={textareaRef} value={record.rawNotes ?? ''} onChange={(e) => update({ rawNotes: e.target.value })} onSelect={rememberCaret} onBlur={rememberCaret} placeholder={PLACEHOLDER} disabled={disabled} maxLength={50000} className="mx-auto w-full max-w-[68ch] min-h-[320px] lg:min-h-[480px] text-[15px] leading-[1.75] resize-y rounded-none border-0 bg-transparent dark:bg-transparent px-0 py-1 focus-visible:ring-0" />
        <DictationBar
          state={dictation.state}
          disabled={!!disabled}
          onStart={() => { void dictation.start(caretPos()); }}
          onStop={dictation.stop}
          onImport={handleImport}
          onRetry={dictation.retryFailed}
          onIgnore={dictation.ignoreFailed}
          trailing={measuresOpen ? undefined : (
            <Button variant="outline" size="sm" onClick={onOpenMeasures} className="h-8 rounded-full text-xs border-[#3899aa]/50 text-[#3899aa] hover:bg-[#3899aa]/10">
              <PanelRightOpen className="h-3.5 w-3.5 mr-1" />Tests et mesures
            </Button>
          )}
        />
        {notesLength > 45000 && (
          <span className="text-[10px] text-muted-foreground -mt-2 self-end px-1">{notesLength} / 50000</span>
        )}
      </div>
      <div className="sticky bottom-12 lg:bottom-0 flex items-center justify-between gap-2 px-3 sm:px-4 py-2">
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
            <Button onClick={onNext} disabled={disabled || dictating} className="btn-teal rounded-full px-5 h-9">Continuer sans note<ArrowRight className="h-4 w-4 ml-1" /></Button>
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
