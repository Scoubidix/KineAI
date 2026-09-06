'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BilanPatch, BilanRecord } from '@/types/bilan';
import { getBilan, patchBilan, StaleDraftError } from '@/utils/bilanApi';

export type SaveState = 'idle' | 'saving' | 'saved' | 'stale' | 'offline' | 'error';

const DEBOUNCE_MS = 2000;
const RETRY_OFFLINE_MS = 5000;

/**
 * Autosave d'un bilan : debounce 2 s, un seul PATCH en vol, contrôle de concurrence
 * par expectedUpdatedAt. Sur 409 (modifié ailleurs) on s'arrête jusqu'à reload().
 */
export function useBilanAutosave(initial: BilanRecord) {
  const [record, setRecord] = useState<BilanRecord>(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const recordRef = useRef(record);
  const pendingRef = useRef<BilanPatch>({});
  const inFlightRef = useRef(false);
  const staleRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { recordRef.current = record; }, [record]);

  const clearTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
  };

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (staleRef.current || inFlightRef.current) return;
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    inFlightRef.current = true;
    setSaveState('saving');
    try {
      const { updatedAt } = await patchBilan(recordRef.current.id, patch, recordRef.current.updatedAt);
      setRecord((r) => ({ ...r, updatedAt }));
      recordRef.current = { ...recordRef.current, updatedAt };
      setSavedAt(new Date());
      setErrorMessage(null);
      setSaveState('saved');
      // Un envoi réussi rend caduque une éventuelle relance hors ligne programmée
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    } catch (e) {
      // On remet le patch en attente pour ne rien perdre
      pendingRef.current = { ...patch, ...pendingRef.current };
      if (e instanceof StaleDraftError) {
        staleRef.current = true;
        setSaveState('stale');
      } else if (e instanceof TypeError) {
        setSaveState('offline');
        // On réarme retryRef à null une fois le timer déclenché, sinon le garde-fou
        // ci-dessous resterait bloqué pour le reste de la vie du hook
        retryRef.current = setTimeout(() => { retryRef.current = null; void flush(); }, RETRY_OFFLINE_MS);
      } else {
        setErrorMessage((e as Error).message);
        setSaveState('error');
      }
    } finally {
      inFlightRef.current = false;
      const still = Object.keys(pendingRef.current).length > 0;
      setPending(still);
      // Un patch est arrivé pendant l'envoi : on repart sans attendre le debounce
      // (sauf si on est bloqué par un 409, ou si un essai hors ligne est déjà programmé)
      if (still && !staleRef.current && !retryRef.current) void flush();
    }
  }, []);

  const update = useCallback((patch: BilanPatch) => {
    setRecord((r) => ({ ...r, ...patch }));
    recordRef.current = { ...recordRef.current, ...patch };
    pendingRef.current = { ...pendingRef.current, ...patch };
    setPending(true);
    if (staleRef.current) return; // plus d'envoi tant que non rechargé
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
  }, [flush]);

  const reload = useCallback(async () => {
    clearTimers();
    const fresh = await getBilan(recordRef.current.id);
    pendingRef.current = {};
    staleRef.current = false;
    recordRef.current = fresh;
    setRecord(fresh);
    setPending(false);
    setErrorMessage(null);
    setSaveState('idle');
  }, []);

  const replaceRecord = useCallback((r: BilanRecord) => {
    recordRef.current = r;
    setRecord(r);
  }, []);

  // Avertit avant de quitter si une sauvegarde est en attente
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingRef.current).length === 0 && !inFlightRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => () => clearTimers(), []);

  return { record, update, flush, saveState, savedAt, pending, errorMessage, reload, replaceRecord };
}
