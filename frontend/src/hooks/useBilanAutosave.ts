'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BilanPatch, BilanRecord } from '@/types/bilan';
import { ApiError, getBilan, patchBilan, StaleDraftError } from '@/utils/bilanApi';

export type SaveState = 'idle' | 'saving' | 'saved' | 'stale' | 'offline' | 'error';

const DEBOUNCE_MS = 2000;
const RETRY_OFFLINE_MS = 5000;

/**
 * Autosave d'un bilan : debounce 2 s, un seul PATCH en vol, contrôle de concurrence
 * par expectedUpdatedAt. Sur 409 (modifié ailleurs) on s'arrête jusqu'à reload().
 * `flush()` renvoie `true` si tout est persisté (buffer vide, dernier envoi réussi),
 * `false` sinon (bilan périmé, hors ligne/429, ou erreur).
 */
export function useBilanAutosave(initial: BilanRecord) {
  const [record, setRecord] = useState<BilanRecord>(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const recordRef = useRef(record);
  const pendingRef = useRef<BilanPatch>({});
  // Promesse de l'envoi en cours (unique à la fois) : flush() l'attend avant
  // de décider s'il faut (re)lancer un nouvel envoi.
  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const staleRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { recordRef.current = record; }, [record]);

  const clearTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
  };

  // Un seul PATCH avec l'instantané courant du buffer. Publie sa propre promesse
  // dans inFlightPromiseRef pour toute la durée de l'envoi (succès ou échec).
  const doSend = useCallback((): Promise<boolean> => {
    const patch = pendingRef.current;
    pendingRef.current = {};
    setSaveState('saving');
    const promise = (async (): Promise<boolean> => {
      try {
        const { updatedAt } = await patchBilan(recordRef.current.id, patch, recordRef.current.updatedAt);
        setRecord((r) => ({ ...r, updatedAt }));
        recordRef.current = { ...recordRef.current, updatedAt };
        setSavedAt(new Date());
        setErrorMessage(null);
        setSaveState('saved');
        // Un envoi réussi rend caduque une éventuelle relance hors ligne/429 programmée
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
        setPending(Object.keys(pendingRef.current).length > 0);
        return true;
      } catch (e) {
        // On remet le patch en attente pour ne rien perdre
        pendingRef.current = { ...patch, ...pendingRef.current };
        setPending(true);
        if (e instanceof StaleDraftError) {
          staleRef.current = true;
          setSaveState('stale');
        } else if (e instanceof TypeError || (e instanceof ApiError && e.status === 429)) {
          // Hors ligne (TypeError du fetch) ou throttlé (429) : même traitement,
          // avec un délai qui respecte Retry-After s'il est fourni (429).
          setSaveState('offline');
          const retryAfterMs = e instanceof ApiError ? e.retryAfterMs : undefined;
          const delay = retryAfterMs !== undefined ? Math.max(RETRY_OFFLINE_MS, retryAfterMs) : RETRY_OFFLINE_MS;
          // On réarme retryRef à null une fois le timer déclenché, sinon le garde-fou
          // ci-dessous resterait bloqué pour le reste de la vie du hook
          retryRef.current = setTimeout(() => { retryRef.current = null; void flush(); }, delay);
        } else {
          setErrorMessage((e as Error).message);
          setSaveState('error');
        }
        return false;
      } finally {
        inFlightPromiseRef.current = null;
      }
    })();
    inFlightPromiseRef.current = promise;
    return promise;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    for (;;) {
      // Un envoi est déjà en vol (déclenché par ce flush ou un autre) : on l'attend
      // puis on réévalue l'état (un nouveau patch, ou un nouvel envoi, a pu apparaître).
      if (inFlightPromiseRef.current) {
        await inFlightPromiseRef.current;
        continue;
      }
      if (staleRef.current) return false;
      if (retryRef.current) return false; // relance hors ligne/429 déjà programmée
      if (Object.keys(pendingRef.current).length === 0) return true;
      const ok = await doSend();
      if (!ok) return false;
    }
  }, [doSend]);

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
      if (Object.keys(pendingRef.current).length === 0 && !inFlightPromiseRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => () => clearTimers(), []);

  return { record, update, flush, saveState, savedAt, pending, errorMessage, reload, replaceRecord };
}
