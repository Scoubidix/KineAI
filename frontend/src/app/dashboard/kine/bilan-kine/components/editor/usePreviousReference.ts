'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { legacyToDocumentMeasurements } from '../CompareWithPreviousModal';
import { measurementIdentity } from './suggestions';
import type { BilanDocument, BilanType, CanonicalValue, DocumentMeasurement, StructuredData } from '@/types/bilan';

export interface ReferenceBilan { id: number; type: BilanType; createdAt: string; measurements: DocumentMeasurement[] }
interface BilanSummary { id: number; type: BilanType; status: string; createdAt: string }

const API = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetchWithAuth(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { success?: boolean } & T;
  return json.success ? json : null;
}

async function fetchReference(patientId: number, summary: BilanSummary): Promise<ReferenceBilan | null> {
  const r = await fetchJson<{ bilan: { document: BilanDocument | null; structuredData: StructuredData | null } }>(`${API}/api/patients/${patientId}/bilans/${summary.id}`);
  if (!r) return null;
  return { id: summary.id, type: summary.type, createdAt: summary.createdAt, measurements: r.bilan.document?.measurements ?? legacyToDocumentMeasurements(r.bilan.structuredData ?? null) };
}

/** Valeurs renseignées du bilan de référence, indexées par identité de mesure (même schéma que le document). */
export function toPreviousValues(measurements: DocumentMeasurement[]): Map<string, CanonicalValue> {
  const map = new Map<string, CanonicalValue>();
  for (const m of measurements) if (m.value !== null && m.value !== '') map.set(measurementIdentity(m), m.value);
  return map;
}

const latestOf = <T extends { createdAt: string }>(items: T[]): T | undefined =>
  [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

/**
 * Bilan de référence d'un bilan de suivi (patient rattaché, type ≠ INITIAL) :
 * - si `document.comparison` existe : le plus récent des bilans sélectionnés ;
 * - sinon : le dernier bilan ENREGISTRE du patient, et `onAutoSelect` est appelé une seule fois
 *   pour que l'étape pose `comparison` et pré-remplisse les lignes.
 */
export function usePreviousReference(args: { patientId: number | null; type: BilanType; excludeId: number; comparisonIds: number[] | undefined; onAutoSelect: (ref: ReferenceBilan) => void }) {
  const { patientId, type, excludeId, comparisonIds, onAutoSelect } = args;
  const [reference, setReference] = useState<ReferenceBilan | null>(null);
  const [loading, setLoading] = useState(false);
  const autoDoneRef = useRef(false);
  const onAutoSelectRef = useRef(onAutoSelect);
  onAutoSelectRef.current = onAutoSelect;
  const idsKey = (comparisonIds ?? []).join(',');

  useEffect(() => {
    if (!patientId || type === 'INITIAL') { setReference(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const list = await fetchJson<{ bilans: BilanSummary[] }>(`${API}/api/patients/${patientId}/bilans`);
      if (!list || cancelled) return;
      const ids = idsKey ? idsKey.split(',').map(Number) : [];
      const others = list.bilans.filter((b) => b.id !== excludeId);
      const pool = ids.length ? others.filter((b) => ids.includes(b.id)) : others.filter((b) => b.status === 'ENREGISTRE');
      const latest = latestOf(pool);
      if (!latest) { if (!cancelled) setReference(null); return; }
      const ref = await fetchReference(patientId, latest);
      if (cancelled || !ref) return;
      setReference(ref);
      if (!ids.length && !autoDoneRef.current) { autoDoneRef.current = true; onAutoSelectRef.current(ref); }
    })().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId, type, excludeId, idsKey]);

  const previousValues = useMemo(() => (reference ? toPreviousValues(reference.measurements) : undefined), [reference]);
  return { reference, loading, previousValues };
}
