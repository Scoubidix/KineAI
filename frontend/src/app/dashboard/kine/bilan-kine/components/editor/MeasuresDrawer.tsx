'use client';
import React from 'react';
import MeasurementsPanel from '../MeasurementsPanel';
import MeasuresPane, { DRAWER_ACTIONS_ID, useDensePane } from './MeasuresPane';
import { useMeasuresReference } from './useMeasuresReference';
import { removeMeasurement } from './review';
import { emptyBilanDocument, type BilanPatch, type BilanRecord, type DocumentMeasurement } from '@/types/bilan';

/** Ré-exporté depuis le meuble, qui en est désormais propriétaire */
export { DRAWER_ACTIONS_ID };

export interface MeasuresDrawerProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ≥ 1024 px : side sheet coplanaire ; sinon bottom sheet. Calculé une fois dans le shell. */
  wide: boolean;
}

// Tiroir Mesures aux étapes Notes et Document : saisie, modèle de bilan, bilan de référence. À
// l'étape Document, une modification se voit aussitôt dans le tableau de la page. Les lignes à
// vérifier n'y apparaissent pas : elles ne vivent qu'à l'étape Mesures (spec 2026-09-26 §3.1).
export default function MeasuresDrawer({ record, update, disabled, open, onOpenChange, wide }: MeasuresDrawerProps) {
  const doc = record.document ?? emptyBilanDocument();
  const dense = useDensePane(wide);
  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });
  // Bilan de référence : même bloc que dans le flux séance/dictée
  const { previousValues, line: referenceLine, modal: referenceModal } = useMeasuresReference({ record, update, disabled });

  return (
    <MeasuresPane summary="Tests et mesures" open={open} onOpenChange={onOpenChange} wide={wide}>
      <div className="flex flex-col gap-3 p-3">
        {referenceLine}
        <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} onRemove={(i) => update({ document: removeMeasurement(doc, i) })} disabled={disabled} previousValues={previousValues} dense={dense} />
      </div>
      {referenceModal}
    </MeasuresPane>
  );
}
