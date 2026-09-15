'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { History, Loader2 } from 'lucide-react';
import MeasurementsPanel from '../MeasurementsPanel';
import MeasuresPane, { DRAWER_ACTIONS_ID, useDensePane } from './MeasuresPane';
import SuggestionsPanel from './SuggestionsPanel';
import CompareWithPreviousModal, { type SelectedBilan } from '../CompareWithPreviousModal';
import { addReferenceRows } from './suggestions';
import { usePreviousReference, type ReferenceBilan } from './usePreviousReference';
import { emptyBilanDocument, BILAN_TYPE_LABELS, type AiBusy, type BilanPatch, type BilanRecord, type DocumentMeasurement, type ExtractionCandidate } from '@/types/bilan';

/** Ancre des suggestions (le bouton « Vérifier » du bandeau y fait défiler) */
export const DRAWER_SUGGESTIONS_ID = 'bilan-drawer-suggestions';
/** Ré-exporté depuis le meuble, qui en est désormais propriétaire */
export { DRAWER_ACTIONS_ID };

export interface MeasuresDrawerProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  disabled: boolean;
  candidates: ExtractionCandidate[] | null;
  rejectedCount: number;
  onCandidatesChange: (next: ExtractionCandidate[]) => void;
  aiBusy: AiBusy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ≥ 1024 px : side sheet coplanaire + rail ; sinon bottom sheet. Calculé une fois dans le shell. */
  wide: boolean;
  /** Citations des mesures acceptées automatiquement, par identité de mesure, le temps de la session */
  quotes: Map<string, string>;
}

// Tiroir Mesures (spec flux deux étapes §4) : la surface unique des mesures, montée dans le shell,
// visible aux deux étapes. Desktop : Material 3 « standard side sheet » réduit en rail.
// Mobile : « standard bottom sheet » replié en barre. Deux états, jamais absent de l'écran.
export default function MeasuresDrawer({ record, update, disabled, candidates, rejectedCount, onCandidatesChange, aiBusy, open, onOpenChange, wide, quotes }: MeasuresDrawerProps) {
  const doc = record.document ?? emptyBilanDocument();
  const dense = useDensePane(wide);
  const pending = candidates?.length ?? 0;
  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });
  const [compareOpen, setCompareOpen] = useState(false);
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

  const summary = `Tests et mesures${pending > 0 ? ` · ${pending} à vérifier` : ''}`;

  const body = (
    <div className="flex flex-col gap-3 p-3">
      {candidates !== null && (
        <div id={DRAWER_SUGGESTIONS_ID}>
          <SuggestionsPanel candidates={candidates} rejectedCount={rejectedCount} measurements={doc.measurements} onMeasurementsChange={setMeasurements} onCandidatesChange={onCandidatesChange} disabled={disabled} />
        </div>
      )}
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
      <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} disabled={disabled} previousValues={previousValues} quotes={quotes} dense={dense} />
    </div>
  );

  const modals = (
    <>
      {record.patientId && (
        <CompareWithPreviousModal open={compareOpen} onOpenChange={setCompareOpen} patientId={record.patientId} excludeId={record.id} initialSelectedIds={doc.comparison?.previousBilanIds ?? []} onSelect={handleCompareSelect} />
      )}
    </>
  );

  return (
    <MeasuresPane summary={summary} open={open} onOpenChange={onOpenChange} wide={wide}>
      {body}
      {modals}
    </MeasuresPane>
  );
}
