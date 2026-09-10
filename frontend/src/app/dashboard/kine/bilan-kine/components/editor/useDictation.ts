'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, getDictationStatus, transcribeDictationSegment } from '@/utils/bilanApi';
import { DictationRecorder, pickMimeType } from './dictationRecorder';
import { drainReady, insertSegment, shiftAnchor } from './dictationText';

export const MAX_TAKE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

export interface DictationState {
  available: boolean;          // worker configuré et prêt (statut serveur)
  supported: boolean;          // MediaRecorder + format audio disponibles
  status: 'idle' | 'recording';
  starting: boolean;           // start() en cours (avant que le micro soit acquis) : évite un double départ
  elapsedMs: number;
  level: number;               // 0..1
  inFlight: number;            // segments envoyés, pas encore revenus (toutes prises)
  failed: number;              // segments en échec définitif, en attente de Réessayer / Ignorer
  permissionDenied: boolean;
}

// Une prise : ses segments, son ancre d'insertion, son contexte
interface Take {
  id: string;
  mimeType: string;
  anchor: number;
  started: boolean;            // vrai jusqu'à la première insertion (séparateur de début de prise)
  nextIndex: number;
  results: Map<number, string>;
  failed: Map<number, Blob>;
  lastText: string;            // dernier segment revenu : contexte du suivant
  inFlight: number;
  recording: boolean;
}

export interface UseDictationArgs {
  bilanId: number;
  notes: string;
  setNotes: (notes: string) => void;
  enabled: boolean;
  onAutoStop?: () => void;
}

export function useDictation({ bilanId, notes, setNotes, enabled, onAutoStop }: UseDictationArgs) {
  const [state, setState] = useState<DictationState>({ available: false, supported: true, status: 'idle', starting: false, elapsedMs: 0, level: 0, inFlight: 0, failed: 0, permissionDenied: false });
  const patch = useCallback((p: Partial<DictationState>) => setState((s) => ({ ...s, ...p })), []);

  const recorderRef = useRef<DictationRecorder | null>(null);
  const startingRef = useRef(false);   // start() en vol (avant que recorderRef soit posé) : bloque un second départ
  const availableRef = useRef(false);  // dernière disponibilité connue, lue en synchrone dans start()
  const currentRef = useRef<Take | null>(null);       // prise en cours d'enregistrement
  const takesRef = useRef(new Set<Take>());           // prises vivantes (segments en vol ou en échec)
  const notesRef = useRef(notes);
  const knownRef = useRef(notes);                     // dernière valeur vue : détecte les éditions du kiné

  // Dernières valeurs de setNotes / onAutoStop, tenues a jour a chaque rendu : évite de recréer les
  // callbacks stables ci-dessous a chaque changement d'identité de ces props côté parent.
  const setNotesRef = useRef(setNotes);
  setNotesRef.current = setNotes;
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;

  const refreshCounts = useCallback(() => {
    let inFlight = 0; let failed = 0;
    for (const t of takesRef.current) { inFlight += t.inFlight; failed += t.failed.size; }
    patch({ inFlight, failed });
  }, [patch]);

  // Éditions du kiné pendant la dictée : chaque ancre vivante suit. En layout effect pour s'exécuter
  // avant qu'un segment revenu (setState React) ne lise notesRef/knownRef sur une frappe pas encore prise en compte.
  useLayoutEffect(() => {
    notesRef.current = notes;
    if (notes === knownRef.current) return;
    for (const t of takesRef.current) t.anchor = shiftAnchor(knownRef.current, notes, t.anchor);
    knownRef.current = notes;
  }, [notes]);

  // Statut du worker : mis en cache 30 s côté serveur (cf. bilanApi). Rafraîchi au montage, puis
  // toutes les 30 s tant qu'indisponible (le worker peut redémarrer pendant la session), et avant
  // chaque tentative de départ si la dernière valeur connue est « indisponible ».
  const refreshAvailability = useCallback(async () => {
    const ok = await getDictationStatus().catch(() => false);
    availableRef.current = ok;
    patch({ available: ok });
    return ok;
  }, [patch]);

  useEffect(() => {
    patch({ supported: pickMimeType() !== null });
  }, [patch]);

  useEffect(() => { void refreshAvailability(); }, [refreshAvailability]);

  useEffect(() => {
    if (state.available) return;
    const timer = setInterval(() => { void refreshAvailability(); }, 30_000);
    return () => clearInterval(timer);
  }, [state.available, refreshAvailability]);

  // Insère les segments contigus prêts d'une prise, puis retire la prise si elle est terminée
  const drain = useCallback((take: Take) => {
    const { texts, nextIndex } = drainReady(take.nextIndex, take.results, new Set(take.failed.keys()));
    take.nextIndex = nextIndex;
    if (texts.length > 0) {
      let current = notesRef.current;
      let pos = take.anchor;
      for (const t of texts) {
        const r = insertSegment(current, pos, t, take.started);
        if (r.notes !== current) take.started = false;
        current = r.notes; pos = r.pos;
      }
      const delta = current.length - notesRef.current.length;
      // Les autres prises vivantes placées après cette insertion se décalent
      for (const other of takesRef.current) if (other !== take && other.anchor >= take.anchor) other.anchor += delta;
      take.anchor = pos;
      if (current !== notesRef.current) {
        knownRef.current = current;   // notre propre écriture : pas une édition du kiné
        notesRef.current = current;
        setNotesRef.current(current);
      }
    }
    if (!take.recording && take.inFlight === 0 && take.failed.size === 0) takesRef.current.delete(take);
    refreshCounts();
  }, [refreshCounts]);

  const sendSegment = useCallback(async (take: Take, blob: Blob, index: number) => {
    take.inFlight += 1;
    refreshCounts();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const r = await transcribeDictationSegment(bilanId, { blob, mimeType: take.mimeType, takeId: take.id, index, prevText: take.lastText });
        take.results.set(index, r.text);
        if (r.text.trim()) take.lastText = r.text;
        break;
      } catch (e) {
        const api = e instanceof ApiError ? e : null;
        if (api && api.status === 422) { take.results.set(index, ''); break; }     // audio invalide : ignoré
        // Service désactivé : inutile de réessayer, ce sera toujours refusé
        const retryable = !api || ((api.status === 502 || api.status === 503 || api.status === 429) && api.code !== 'DICTATION_DISABLED');
        if (retryable && attempt < MAX_ATTEMPTS) { await new Promise((resolve) => setTimeout(resolve, api?.retryAfterMs ?? RETRY_DELAY_MS)); continue; }
        take.failed.set(index, blob);
        break;
      }
    }
    take.inFlight -= 1;
    drain(take);
  }, [bilanId, drain, refreshCounts]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    currentRef.current = null;
    // Le dernier segment part via onSegment, puis le recorder déclenche onStopped (enregistré dans start())
    // une fois cet envoi effectivement lancé : c'est ce callback qui ferme la prise (recording=false, drain).
    if (rec) rec.stop();
    patch({ status: 'idle', level: 0 });
  }, [patch]);

  const start = useCallback(async (caretPos: number) => {
    if (!enabled || startingRef.current || recorderRef.current) return;
    if (!availableRef.current) {
      const ok = await refreshAvailability();
      if (!ok) return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) { patch({ supported: false }); return; }
    const take: Take = { id: crypto.randomUUID(), mimeType, anchor: Math.min(Math.max(caretPos, 0), notesRef.current.length), started: true, nextIndex: 0, results: new Map(), failed: new Map(), lastText: '', inFlight: 0, recording: true };
    startingRef.current = true;
    patch({ starting: true });
    const rec = new DictationRecorder(mimeType, {
      onSegment: (blob, index) => { void sendSegment(take, blob, index); },
      onLevel: (level) => patch({ level }),
      onTick: (elapsedMs) => {
        patch({ elapsedMs });
        if (elapsedMs >= MAX_TAKE_MS) { stop(); onAutoStopRef.current?.(); }
      },
      onStopped: () => { take.recording = false; drain(take); },
    });
    try {
      await rec.start();
    } catch (e) {
      // NotAllowedError/SecurityError : permission refusée. NotFoundError/NotReadableError : pas de micro
      // utilisable, meme message que « permission refusée » côté UI. Autre chose : format non supporté.
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotFoundError' || e.name === 'NotReadableError')) {
        patch({ permissionDenied: true, starting: false });
      } else {
        patch({ supported: false, starting: false });
      }
      startingRef.current = false;
      return;
    }
    takesRef.current.add(take);
    currentRef.current = take;
    recorderRef.current = rec;
    startingRef.current = false;
    patch({ status: 'recording', starting: false, elapsedMs: 0, permissionDenied: false });
  }, [enabled, sendSegment, stop, drain, patch, refreshAvailability]);

  const retryFailed = useCallback(() => {
    for (const take of takesRef.current) {
      const items = [...take.failed.entries()];
      take.failed = new Map();
      for (const [index, blob] of items) void sendSegment(take, blob, index);
    }
  }, [sendSegment]);

  const ignoreFailed = useCallback(() => {
    for (const take of [...takesRef.current]) {
      for (const index of take.failed.keys()) take.results.set(index, '');
      take.failed = new Map();
      drain(take);
    }
  }, [drain]);

  // Fermeture d'onglet pendant une prise ou avec des segments en vol : confirmation native
  useEffect(() => {
    const busy = state.status === 'recording' || state.inFlight > 0;
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.status, state.inFlight]);

  // Désactivation (bilan verrouillé, IA en cours) pendant une prise : arrêt propre
  useEffect(() => { if (!enabled && recorderRef.current) stop(); }, [enabled, stop]);

  // Démontage : on libère le micro ; les segments en vol terminent d'eux-mêmes
  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  return { state, start, stop, retryFailed, ignoreFailed };
}
