'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Loader2, Ruler, Save, Sparkles } from 'lucide-react';
import MeasurementsPanel from '../MeasurementsPanel';
import SuggestionsPanel from './SuggestionsPanel';
import TemplateEditorModal from '../TemplateEditorModal';
import CompareWithPreviousModal, { type SelectedBilan } from '../CompareWithPreviousModal';
import { addReferenceRows } from './suggestions';
import { usePreviousReference, type ReferenceBilan } from './usePreviousReference';
import { emptyBilanDocument, BILAN_TYPE_LABELS, type AiBusy, type BilanPatch, type BilanRecord, type DocumentMeasurement, type ExtractionCandidate, type TemplateItem } from '@/types/bilan';

/** Ancre des suggestions (le bouton « Vérifier » du bandeau y fait défiler) */
export const DRAWER_SUGGESTIONS_ID = 'bilan-drawer-suggestions';
/** Hôte des actions de l'étape Document dans la barre repliée mobile (portail) */
export const DRAWER_ACTIONS_ID = 'bilan-drawer-actions';

export interface MeasuresDrawerProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  disabled: boolean;
  candidates: ExtractionCandidate[] | null;
  rejectedCount: number;
  onCandidatesChange: (next: ExtractionCandidate[]) => void;
  onAnalyze: () => void;
  aiBusy: AiBusy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ≥ 1024 px : side sheet coplanaire + rail ; sinon bottom sheet. Calculé une fois dans le shell. */
  wide: boolean;
}

// Tiroir Mesures (spec flux deux étapes §4) : la surface unique des mesures, montée dans le shell,
// visible aux deux étapes. Desktop : Material 3 « standard side sheet » réduit en rail.
// Mobile : « standard bottom sheet » replié en barre. Deux états, jamais absent de l'écran.
export default function MeasuresDrawer({ record, update, disabled, candidates, rejectedCount, onCandidatesChange, onAnalyze, aiBusy, open, onOpenChange, wide }: MeasuresDrawerProps) {
  const doc = record.document ?? emptyBilanDocument();
  const hasNotes = (record.rawNotes ?? '').trim().length > 0;
  const pending = candidates?.length ?? 0;
  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const templateItems = useMemo<TemplateItem[]>(() => doc.measurements.map((m) => (m.kind === 'canonical' ? { kind: 'canonical', key: m.key } : { kind: 'custom', label: m.label })), [doc.measurements]);
  const isFollowUp = !!record.patientId && record.type !== 'INITIAL';

  // Bilan de référence (plan 3b) : sélection (évolution PDF) + lignes ajoutées vides, à ressaisir.
  // knownKeys null (catalogue non chargé) → aucune ligne canonique ajoutée, les lignes libres passent.
  const applyReference = (ref: ReferenceBilan, ids: number[]) =>
    update({ document: { ...doc, measurements: addReferenceRows(doc.measurements, ref.measurements, knownKeys ?? new Set()), comparison: { previousBilanIds: ids } } });
  const { reference, loading: referenceLoading, error: referenceError, previousValues, knownKeys } = usePreviousReference({
    patientId: record.patientId, type: record.type, excludeId: record.id, hasComparison: doc.comparison !== undefined, comparisonIds: doc.comparison?.previousBilanIds,
    onAutoSelect: (ref) => applyReference(ref, [ref.id]),
  });
  const handleCompareSelect = (bilans: SelectedBilan[]) => {
    if (bilans.length === 0) {
      update({ document: { ...doc, comparison: { previousBilanIds: [] }, measurements: doc.measurements.filter((m) => !(m.origin === 'previous' && (m.value === null || m.value === ''))) } });
      return;
    }
    const latest = [...bilans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    applyReference({ id: latest.id, type: latest.type, createdAt: latest.createdAt, measurements: latest.measurements }, bilans.map((b) => b.id));
  };
  const extraCount = Math.max((doc.comparison?.previousBilanIds?.length ?? 1) - 1, 0);
  // Bilan repassé en INITIAL : la comparaison n'a plus de sens, on la retire (les lignes restent)
  useEffect(() => {
    if (record.type === 'INITIAL' && doc.comparison !== undefined) update({ document: { ...doc, comparison: undefined } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.type]);

  // Focus rendu à la commande à la fermeture (pas au montage)
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const summary = `Mesures · ${doc.measurements.length}${pending > 0 ? ` · ${pending} à vérifier` : ''}`;

  const analyzeButton = (
    <Button variant="outline" size="sm" onClick={onAnalyze} disabled={disabled || !hasNotes || aiBusy !== null} className="h-7 text-xs rounded-full" title={hasNotes ? 'Repère les mesures citées dans tes notes, sans rédiger' : 'Saisis des notes pour analyser'}>
      {aiBusy === 'extract' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Analyser les notes
    </Button>
  );

  const body = (
    <div className="flex flex-col gap-3 p-3">
      {candidates !== null && (
        <div id={DRAWER_SUGGESTIONS_ID}>
          <SuggestionsPanel candidates={candidates} rejectedCount={rejectedCount} measurements={doc.measurements} onMeasurementsChange={setMeasurements} onCandidatesChange={onCandidatesChange} disabled={disabled} />
        </div>
      )}
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
  );

  const modals = (
    <>
      <TemplateEditorModal open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} mode="private" template={null} initialItems={templateItems} onSaved={() => {}} />
      {record.patientId && (
        <CompareWithPreviousModal open={compareOpen} onOpenChange={setCompareOpen} patientId={record.patientId} excludeId={record.id} initialSelectedIds={doc.comparison?.previousBilanIds ?? []} onSelect={handleCompareSelect} />
      )}
    </>
  );

  if (wide) {
    return (
      <aside aria-label="Mesures du bilan" className={`shrink-0 border-l border-border/40 bg-background flex flex-col lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100dvh-4rem)] transition-[width] duration-200 ${open ? 'w-[380px]' : 'w-10'}`}>
        {open ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
              <Ruler className="h-4 w-4 text-[#3899aa] shrink-0" />
              <span className="text-sm font-semibold flex-1 truncate">{summary}</span>
              {analyzeButton}
              <Button ref={toggleRef} variant="ghost" size="sm" aria-expanded aria-label="Replier les mesures" onClick={() => onOpenChange(false)} className="h-7 w-7 p-0"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
          </>
        ) : (
          <button ref={toggleRef} type="button" aria-expanded={false} aria-label="Ouvrir les mesures" onClick={() => onOpenChange(true)} className="flex-1 flex flex-col items-center gap-2 py-3 hover:bg-muted/50">
            <ChevronLeft className="h-4 w-4" />
            <Ruler className="h-4 w-4 text-[#3899aa]" />
            <span className="text-xs font-medium [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{summary}</span>
            {pending > 0 && <span className="rounded-full bg-[#3899aa] text-white text-[10px] px-1.5">{pending}</span>}
          </button>
        )}
        {modals}
      </aside>
    );
  }

  return (
    <div role="region" aria-label="Mesures du bilan" className={`fixed inset-x-0 bottom-0 z-30 bg-background border-t border-border/40 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex flex-col transition-[height] duration-200 ${open ? 'h-[calc(100dvh-4rem)]' : 'h-12'}`}>
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <button ref={toggleRef} type="button" aria-expanded={open} aria-label={open ? 'Replier les mesures' : 'Ouvrir les mesures'} onClick={() => onOpenChange(!open)} className="flex items-center gap-2 flex-1 min-w-0 h-full text-left">
          <span className="h-1 w-8 rounded-full bg-border shrink-0" aria-hidden />
          <span className="text-sm font-medium truncate">{summary}</span>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronUp className="h-4 w-4 shrink-0" />}
        </button>
        <div id={DRAWER_ACTIONS_ID} className="flex items-center gap-1.5 shrink-0" />
      </div>
      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto border-t border-border/40">
          <div className="flex justify-end px-3 pt-2">{analyzeButton}</div>
          {body}
        </div>
      )}
      {modals}
    </div>
  );
}
