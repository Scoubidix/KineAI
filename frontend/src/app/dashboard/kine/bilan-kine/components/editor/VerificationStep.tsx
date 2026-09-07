'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Save, History } from 'lucide-react';
import MeasurementsPanel from '../MeasurementsPanel';
import SuggestionsPanel from './SuggestionsPanel';
import HighlightedNotes from './HighlightedNotes';
import TemplateEditorModal from '../TemplateEditorModal';
import CompareWithPreviousModal, { type SelectedBilan } from '../CompareWithPreviousModal';
import { useMinWidth } from './useMinWidth';
import { addReferenceRows } from './suggestions';
import { usePreviousReference, type ReferenceBilan } from './usePreviousReference';
import { emptyBilanDocument, BILAN_TYPE_LABELS, type AiBusy, type DocumentMeasurement, type ExtractionCandidate, type TemplateItem } from '@/types/bilan';
import type { StepProps } from './CaptureStep';

export interface VerificationStepProps extends StepProps {
  candidates: ExtractionCandidate[] | null; // null = aucune analyse lancée
  rejectedCount: number;
  onCandidatesChange: (next: ExtractionCandidate[]) => void;
  onAnalyze: () => void;
  onCompose: () => Promise<boolean>; // true si rédigé → l'étape passe à Document
  aiBusy: AiBusy;
}

export default function VerificationStep({ record, update, disabled, onBack, onNext, candidates, rejectedCount, onCandidatesChange, onAnalyze, onCompose, aiBusy }: VerificationStepProps) {
  const wide = useMinWidth(1024);
  const doc = record.document ?? emptyBilanDocument();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasNotes = (record.rawNotes ?? '').trim().length > 0;
  const pending = candidates?.length ?? 0;
  const anyText = doc.sections.some((s) => s.text.trim() !== '');
  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const templateItems = useMemo<TemplateItem[]>(() => doc.measurements.map((m) => (m.kind === 'canonical' ? { kind: 'canonical', key: m.key } : { kind: 'custom', label: m.label })), [doc.measurements]);
  const [compareOpen, setCompareOpen] = useState(false);
  const isFollowUp = !!record.patientId && record.type !== 'INITIAL';
  // Pose la sélection (évolution PDF) et ajoute les lignes de la référence, vides, à ressaisir.
  // knownKeys null (catalogue non chargé) → aucune ligne canonique ajoutée (Set vide), les
  // lignes libres passent toujours ; comparison est posé dans tous les cas.
  const applyReference = (ref: ReferenceBilan, ids: number[]) =>
    update({ document: { ...doc, measurements: addReferenceRows(doc.measurements, ref.measurements, knownKeys ?? new Set()), comparison: { previousBilanIds: ids } } });
  const { reference, loading: referenceLoading, error: referenceError, previousValues, knownKeys } = usePreviousReference({
    patientId: record.patientId, type: record.type, excludeId: record.id, hasComparison: doc.comparison !== undefined, comparisonIds: doc.comparison?.previousBilanIds,
    onAutoSelect: (ref) => applyReference(ref, [ref.id]),
  });
  const handleCompareSelect = (bilans: SelectedBilan[]) => {
    if (bilans.length === 0) {
      update({
        document: {
          ...doc,
          comparison: { previousBilanIds: [] },
          measurements: doc.measurements.filter((m) => !(m.origin === 'previous' && (m.value === null || m.value === ''))),
        },
      });
      return;
    }
    const latest = [...bilans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    applyReference({ id: latest.id, type: latest.type, createdAt: latest.createdAt, measurements: latest.measurements }, bilans.map((b) => b.id));
  };
  const extraCount = Math.max((doc.comparison?.previousBilanIds?.length ?? 1) - 1, 0);

  // Bilan repassé en INITIAL : la comparaison n'a plus de sens, on la retire (les lignes déjà
  // ajoutées restent, le kiné les retire s'il veut).
  useEffect(() => {
    if (record.type === 'INITIAL' && doc.comparison !== undefined) update({ document: { ...doc, comparison: undefined } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.type]);

  // Clic croisé desktop : extrait ↔ suggestion
  const focus = (id: string, target: 'cand' | 'quote') => {
    setActiveId(id);
    document.getElementById(`${target}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const generate = async () => {
    setConfirmOpen(false);
    if (await onCompose()) onNext();
  };
  const handleGenerateClick = () => { if (pending > 0 || anyText) setConfirmOpen(true); else void generate(); };

  const notes = (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Notes · lecture seule</span>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap min-h-[200px]">
        {record.motif && <p className="text-muted-foreground mb-2">Motif : {record.motif}</p>}
        {hasNotes ? (wide && candidates ? <HighlightedNotes notes={record.rawNotes ?? ''} quotes={candidates.map((c) => ({ id: c.id, quote: c.quote }))} activeId={activeId} onSelect={(id) => focus(id, 'cand')} /> : record.rawNotes) : <span className="italic text-muted-foreground">Aucune note</span>}
      </div>
      {candidates === null && hasNotes && (
        <Button variant="outline" size="sm" onClick={onAnalyze} disabled={disabled} className="self-start h-8 text-xs rounded-full">{aiBusy === 'extract' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Analyser les notes</Button>
      )}
    </div>
  );

  const measures = (
    <div className="flex flex-col gap-3">
      {candidates !== null && (
        <SuggestionsPanel candidates={candidates} rejectedCount={rejectedCount} measurements={doc.measurements} onMeasurementsChange={setMeasurements} onCandidatesChange={onCandidatesChange} disabled={disabled} activeId={activeId} onFocusQuote={(id) => focus(id, 'quote')} />
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mesures · côté et présentation</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSaveTemplateOpen(true)} disabled={disabled || templateItems.length === 0} className="h-7 text-xs"><Save className="h-3 w-3 mr-1" />Sauvegarder le template</Button>
        </div>
        {isFollowUp && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground px-1">
            <History className="h-3.5 w-3.5 text-[#3899aa]" />
            {referenceLoading ? <span>Recherche du bilan de référence…</span>
              : referenceError ? <span>Bilans antérieurs indisponibles pour le moment</span>
              : reference ? <span>Référence : {BILAN_TYPE_LABELS[reference.type]} du {new Date(reference.createdAt).toLocaleDateString('fr-FR')}{extraCount > 0 && ` (+${extraCount} pour l’évolution)`}</span>
              : <span>Aucun bilan antérieur enregistré pour ce patient</span>}
            <Button type="button" variant="link" size="sm" onClick={() => setCompareOpen(true)} disabled={disabled} className="h-6 px-1 text-xs">{reference ? 'Changer' : 'Choisir'}</Button>
          </div>
        )}
        <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} disabled={disabled} showPresentation previousValues={previousValues} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-3 sm:px-4 py-3">
        {wide ? <div className="grid grid-cols-[1.15fr_1fr] gap-4">{notes}{measures}</div> : (
          <Tabs defaultValue="mesures">
            <TabsList className="grid grid-cols-2 w-full mb-3"><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="mesures">Mesures{pending > 0 && <span className="ml-1 rounded-full bg-[#3899aa] text-white px-1.5 text-[10px]">{pending}</span>}</TabsTrigger></TabsList>
            <TabsContent value="notes">{notes}</TabsContent>
            <TabsContent value="mesures">{measures}</TabsContent>
          </Tabs>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={disabled} className="h-9"><ArrowLeft className="h-4 w-4 mr-1" />Notes</Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onNext} disabled={disabled} className="h-9">Rédiger moi-même</Button>
          <Button onClick={handleGenerateClick} disabled={disabled || !hasNotes} className="btn-teal rounded-full h-9 px-4">{aiBusy === 'compose' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}Générer le bilan <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
      <TemplateEditorModal open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} mode="private" template={null} initialItems={templateItems} onSaved={() => {}} />
      {record.patientId && (
        <CompareWithPreviousModal open={compareOpen} onOpenChange={setCompareOpen} patientId={record.patientId} excludeId={record.id} initialSelectedIds={doc.comparison?.previousBilanIds ?? []} onSelect={handleCompareSelect} />
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{anyText ? 'Remplacer les sections déjà rédigées ?' : `${pending} suggestion${pending > 1 ? 's' : ''} non traitée${pending > 1 ? 's' : ''}`}</AlertDialogTitle>
            <AlertDialogDescription>
              {anyText
                ? `La rédaction IA écrit les 7 sections à partir de tes notes et de tes mesures. Les textes actuels seront écrasés.${pending > 0 ? ' Les suggestions non traitées seront ignorées : seules les mesures acceptées entrent dans le bilan.' : ''}`
                : 'Elles seront ignorées : seules les mesures acceptées entrent dans le bilan. Tu pourras revenir à cette étape ensuite.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revenir aux suggestions</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void generate(); }} className="btn-teal">Générer quand même</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
