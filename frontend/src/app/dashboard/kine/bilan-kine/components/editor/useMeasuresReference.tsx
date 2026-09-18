'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { History } from 'lucide-react';
import CompareWithPreviousModal, { type SelectedBilan } from '../CompareWithPreviousModal';
import { addReferenceRows } from './suggestions';
import { usePreviousReference, type ReferenceBilan } from './usePreviousReference';
import { emptyBilanDocument, BILAN_TYPE_LABELS, type BilanPatch, type BilanRecord, type CanonicalValue } from '@/types/bilan';

interface UseMeasuresReferenceArgs {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  disabled: boolean;
  /** Faux tant qu'une écriture concurrente est possible (traitement serveur d'une séance) */
  autoSelect?: boolean;
}

export interface MeasuresReference {
  /** Valeurs du bilan de référence, à passer à MeasurementsPanel (« préc. … ») */
  previousValues: Map<string, CanonicalValue> | undefined;
  /** Ligne « Référence : … · Changer », nulle hors bilan de suivi */
  line: React.ReactNode;
  modal: React.ReactNode;
}

/**
 * Le bloc « bilan de référence » des mesures, partagé par l'éditeur (tiroir Mesures) et par le
 * flux séance/dictée : choix de la référence, lignes du bilan précédent ajoutées vides, valeur
 * antérieure affichée à côté du champ. Un seul mécanisme, quel que soit le mode de saisie.
 *
 * À appeler dans le parent, jamais dans les enfants de `MeasuresPane` : replié, le meuble ne rend
 * pas ses enfants, et la référence cesserait de se charger.
 */
export function useMeasuresReference({ record, update, disabled, autoSelect = true }: UseMeasuresReferenceArgs): MeasuresReference {
  const doc = record.document ?? emptyBilanDocument();
  const [compareOpen, setCompareOpen] = useState(false);
  const isFollowUp = !!record.patientId && record.type !== 'INITIAL';

  // Bilan de référence (plan 3b) : sélection (évolution PDF) + lignes ajoutées vides, à ressaisir.
  // knownKeys null (catalogue non chargé) → aucune ligne canonique ajoutée, les lignes libres passent.
  const applyReference = (ref: ReferenceBilan, ids: number[]) =>
    update({ document: { ...doc, measurements: addReferenceRows(doc.measurements, ref.measurements, knownKeys ?? new Set()), comparison: { previousBilanIds: ids } } });
  const { reference, loading, error, previousValues, knownKeys } = usePreviousReference({
    patientId: record.patientId, type: record.type, excludeId: record.id, hasComparison: doc.comparison !== undefined, comparisonIds: doc.comparison?.previousBilanIds,
    onAutoSelect: (ref) => applyReference(ref, [ref.id]), autoSelect,
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

  const line = isFollowUp ? (
    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground px-1">
      <History className="h-3.5 w-3.5 text-[#3899aa]" />
      {loading ? <span>Recherche du bilan de référence…</span>
        : error ? <span>Bilans antérieurs indisponibles pour le moment</span>
        : reference ? <span>Référence : {BILAN_TYPE_LABELS[reference.type]} du {new Date(reference.createdAt).toLocaleDateString('fr-FR')}{extraCount > 0 && ` (+${extraCount} pour l’évolution)`}</span>
        : <span>Aucun bilan antérieur enregistré pour ce patient</span>}
      <Button type="button" variant="link" size="sm" onClick={() => setCompareOpen(true)} disabled={disabled} className="h-6 px-1 text-xs">{reference ? 'Changer' : 'Choisir'}</Button>
    </div>
  ) : null;

  const modal = record.patientId ? (
    <CompareWithPreviousModal open={compareOpen} onOpenChange={setCompareOpen} patientId={record.patientId} excludeId={record.id} initialSelectedIds={doc.comparison?.previousBilanIds ?? []} onSelect={handleCompareSelect} />
  ) : null;

  return { previousValues, line, modal };
}
