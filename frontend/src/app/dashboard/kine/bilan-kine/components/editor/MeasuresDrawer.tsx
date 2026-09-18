'use client';
import React from 'react';
import MeasurementsPanel from '../MeasurementsPanel';
import MeasuresPane, { DRAWER_ACTIONS_ID, useDensePane } from './MeasuresPane';
import SuggestionsPanel from './SuggestionsPanel';
import { useMeasuresReference } from './useMeasuresReference';
import { emptyBilanDocument, type AiBusy, type BilanPatch, type BilanRecord, type DocumentMeasurement, type ExtractionCandidate } from '@/types/bilan';

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

  // Bilan de référence : même bloc que dans le flux séance/dictée
  const { previousValues, line: referenceLine, modal: referenceModal } = useMeasuresReference({ record, update, disabled });

  const summary = `Tests et mesures${pending > 0 ? ` · ${pending} à vérifier` : ''}`;

  const body = (
    <div className="flex flex-col gap-3 p-3">
      {candidates !== null && (
        <div id={DRAWER_SUGGESTIONS_ID}>
          <SuggestionsPanel candidates={candidates} rejectedCount={rejectedCount} measurements={doc.measurements} onMeasurementsChange={setMeasurements} onCandidatesChange={onCandidatesChange} disabled={disabled} />
        </div>
      )}
      {referenceLine}
      <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} disabled={disabled} previousValues={previousValues} quotes={quotes} dense={dense} />
    </div>
  );

  return (
    <MeasuresPane summary={summary} open={open} onOpenChange={onOpenChange} wide={wide}>
      {body}
      {referenceModal}
    </MeasuresPane>
  );
}
