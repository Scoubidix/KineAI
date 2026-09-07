'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Search, PenLine, Mic, Disc, ArrowRight, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import type { BilanPatch, BilanRecord } from '@/types/bilan';

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
  onAnalyze: () => void;
  analyzing: boolean;
  /** Une analyse a déjà été faite : les suggestions sont en mémoire à l'étape Mesures */
  analyzed: boolean;
  /** Les notes ont changé depuis cette analyse */
  notesChanged: boolean;
}

// Étape 1 : la source seule (notes écrites aujourd'hui, dictée et transcription demain).
// Les mesures se saisissent à l'étape suivante, à partir des suggestions de l'analyse.
export default function CaptureStep({ record, update, disabled, onNext, onAnalyze, analyzing, analyzed, notesChanged }: CaptureStepProps) {
  const notesLength = (record.rawNotes ?? '').length;
  const hasNotes = (record.rawNotes ?? '').trim().length > 0;

  const modeChip = (icon: React.ReactNode, label: string, active: boolean) => (
    <span title={active ? undefined : 'Bientôt disponible'} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${active ? 'bg-[#3899aa]/15 text-[#3899aa]' : 'text-muted-foreground opacity-60'}`}>{icon}{label}</span>
  );

  // Trois états du pied de page : jamais analysé / analysé et notes inchangées / analysé puis notes modifiées
  const analyzeIsPrimary = !analyzed || notesChanged;
  const hint = !analyzed
    ? 'L’analyse repère les tests et mesures cités dans tes notes ; tu valides ensuite'
    : notesChanged ? 'Notes modifiées depuis l’analyse : relance-la pour des suggestions à jour' : 'Suggestions prêtes à l’étape Mesures';

  const analyzeButton = (primary: boolean) => (
    <Button onClick={onAnalyze} disabled={disabled || !hasNotes} variant={primary ? 'default' : 'ghost'} size={primary ? 'default' : 'sm'} className={primary ? 'btn-teal rounded-full px-5 h-9' : 'h-9'}>
      {analyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : analyzed ? <RefreshCw className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
      {analyzed ? 'Ré-analyser les notes' : 'Analyser les notes'}
      {primary && <ArrowRight className="h-4 w-4 ml-1" />}
    </Button>
  );
  const continueButton = (primary: boolean) => (
    <Button onClick={onNext} disabled={disabled} variant={primary ? 'default' : 'ghost'} size={primary ? 'default' : 'sm'} className={primary ? 'btn-teal rounded-full px-5 h-9' : 'h-9'}>
      {analyzed ? 'Continuer' : 'Continuer sans analyser'}
      {primary && <ArrowRight className="h-4 w-4 ml-1" />}
    </Button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source</span>
          <span className="flex-1" />
          {modeChip(<PenLine className="h-3 w-3" />, 'Notes', true)}
          {modeChip(<Mic className="h-3 w-3" />, 'Dicter', false)}
          {modeChip(<Disc className="h-3 w-3" />, 'Séance', false)}
        </div>
        <div className="flex items-center gap-2 px-1">
          <Search className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
          <span className="text-xs font-medium text-[#3899aa] shrink-0">Motif</span>
          <Input value={record.motif ?? ''} onChange={(e) => update({ motif: e.target.value })} placeholder="Ex : Lombalgie chronique, rééducation post-opératoire..." disabled={disabled} maxLength={500} className="border-0 border-b border-border/60 rounded-none bg-transparent text-sm h-8 px-2 focus-visible:ring-0" />
        </div>
        <Textarea value={record.rawNotes ?? ''} onChange={(e) => update({ rawNotes: e.target.value })} placeholder={PLACEHOLDER} disabled={disabled} maxLength={50000} className="min-h-[320px] lg:min-h-[480px] text-sm leading-relaxed resize-y rounded-xl border-2 border-border/60 bg-white dark:bg-card p-4 focus-visible:ring-[#3899aa]/50" />
        {notesLength > 45000 && (
          <span className="text-[10px] text-muted-foreground -mt-2 self-end px-1">{notesLength} / 50000</span>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2">
        <span className="text-[11px] text-muted-foreground hidden sm:inline">{hint}</span>
        <div className="flex items-center gap-2 ml-auto">
          {analyzeIsPrimary ? <>{continueButton(false)}{analyzeButton(true)}</> : <>{analyzeButton(false)}{continueButton(true)}</>}
        </div>
      </div>
    </div>
  );
}
