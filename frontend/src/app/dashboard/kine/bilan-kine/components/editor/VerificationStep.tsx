'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, ArrowRight, Sparkles, Info } from 'lucide-react';
import MeasurementsPanel from '../MeasurementsPanel';
import { useMinWidth } from './useMinWidth';
import { emptyBilanDocument, type DocumentMeasurement } from '@/types/bilan';
import type { AiBusy, ExtractionCandidate } from '@/types/bilan';
import type { StepProps } from './CaptureStep';

export interface VerificationStepProps extends StepProps {
  candidates: ExtractionCandidate[] | null; // null = aucune analyse lancée
  rejectedCount: number;
  onCandidatesChange: (next: ExtractionCandidate[]) => void;
  onAnalyze: () => void;
  onCompose: () => Promise<boolean>; // true si rédigé → l'étape passe à Document
  aiBusy: AiBusy;
}

export default function VerificationStep({ record, update, disabled, onBack, onNext }: VerificationStepProps) {
  const wide = useMinWidth(1024);
  const doc = record.document ?? emptyBilanDocument();
  // Met à jour les mesures du document
  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });

  const notes = (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Notes · lecture seule</span>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap min-h-[200px]">
        {record.motif && <p className="text-muted-foreground mb-2">Motif : {record.motif}</p>}
        {record.rawNotes?.trim() ? record.rawNotes : <span className="italic text-muted-foreground">Aucune note</span>}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1"><Info className="h-3 w-3" />L'analyse automatique des notes arrive avec la rédaction IA.</p>
    </div>
  );

  const measures = (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Mesures · côté et présentation</span>
      <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} disabled={disabled} showPresentation />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-3 sm:px-4 py-3">
        {wide ? <div className="grid grid-cols-[1.15fr_1fr] gap-4">{notes}{measures}</div> : (
          <Tabs defaultValue="mesures">
            <TabsList className="grid grid-cols-2 w-full mb-3"><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="mesures">Mesures</TabsTrigger></TabsList>
            <TabsContent value="notes">{notes}</TabsContent>
            <TabsContent value="mesures">{measures}</TabsContent>
          </Tabs>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-9"><ArrowLeft className="h-4 w-4 mr-1" />Notes</Button>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span><Button disabled className="rounded-full h-9 px-4"><Sparkles className="h-4 w-4 mr-1" />Générer le bilan</Button></span>
            </TooltipTrigger>
            <TooltipContent>Disponible avec la rédaction IA</TooltipContent>
          </Tooltip>
          <Button onClick={onNext} disabled={disabled} className="btn-teal rounded-full h-9 px-4">Rédiger moi-même <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    </div>
  );
}
