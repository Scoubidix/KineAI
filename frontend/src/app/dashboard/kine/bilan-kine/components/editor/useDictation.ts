'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [state, setState] = useState<DictationState>({ available: false, supported: true, status: 'idle', elapsedMs: 0, level: 0, inFlight: 0, failed: 0, permissionDenied: false });
  const patch = useCallback((p: Partial<DictationState>) => setState((s) => ({ ...s, ...p })), []);

  const recorderRef = useRef<DictationRecorder | null>(null);
  const currentRef = useRef<Take | null>(null);       // prise en cours d'enregistrement
  const takesRef = useRef(new Set<Take>());           // prises vivantes (segments en vol ou en échec)
  const notesRef = useRef(notes);
  const knownRef = useRef(notes);                     // dernière valeur vue : détecte les éditions du kiné

  const refreshCounts = useCallback(() => {
    let inFlight = 0; let failed = 0;
    for (const t of takesRef.current) { inFlight += t.inFlight; failed += t.failed.size; }
    patch({ inFlight, failed });
  }, [patch]);

  // Éditions du kiné pendant la dictée : chaque ancre vivante suit
  useEffect(() => {
    notesRef.current = notes;
    if (notes === knownRef.current) return;
    for (const t of takesRef.current) t.anchor = shiftAnchor(knownRef.current, notes, t.anchor);
    knownRef.current = notes;
  }, [notes]);

  useEffect(() => {
    patch({ supported: pickMimeType() !== null });
    let cancelled = false;
    getDictationStatus().then((ok) => { if (!cancelled) patch({ available: ok }); }).catch(() => { if (!cancelled) patch({ available: false }); });
    return () => { cancelled = true; };
  }, [patch]);

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
      knownRef.current = current;   // notre propre écriture : pas une édition du kiné
      notesRef.current = current;
      setNotes(current);
    }
    if (!take.recording && take.inFlight === 0 && take.failed.size === 0) takesRef.current.delete(take);
    refreshCounts();
  }, [setNotes, refreshCounts]);

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
        const retryable = !api || api.status === 502 || api.status === 503 || api.status === 429;
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
    const take = currentRef.current;
    recorderRef.current = null;
    currentRef.current = null;
    if (rec) rec.stop();                 // le dernier segment part via onSegment
    if (take) { take.recording = false; drain(take); }
    patch({ status: 'idle', level: 0 });
  }, [drain, patch]);

  const start = useCallback(async (caretPos: number) => {
    if (!enabled || recorderRef.current) return;
    const mimeType = pickMimeType();
    if (!mimeType) { patch({ supported: false }); return; }
    const take: Take = { id: crypto.randomUUID(), mimeType, anchor: Math.min(Math.max(caretPos, 0), notesRef.current.length), started: true, nextIndex: 0, results: new Map(), failed: new Map(), lastText: '', inFlight: 0, recording: true };
    const rec = new DictationRecorder(mimeType, {
      onSegment: (blob, index) => { void sendSegment(take, blob, index); },
      onLevel: (level) => patch({ level }),
      onTick: (elapsedMs) => {
        patch({ elapsedMs });
        if (elapsedMs >= MAX_TAKE_MS) { stop(); onAutoStop?.(); }
      },
    });
    try {
      await rec.start();
    } catch {
      patch({ permissionDenied: true });
      return;
    }
    takesRef.current.add(take);
    currentRef.current = take;
    recorderRef.current = rec;
    patch({ status: 'recording', elapsedMs: 0, permissionDenied: false });
  }, [enabled, sendSegment, stop, onAutoStop, patch]);

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
  useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);

  // Démontage : on libère le micro ; les segments en vol terminent d'eux-mêmes
  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  return { state, start, stop, retryFailed, ignoreFailed };
}
