'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, correctDictation, getDictationStatus, transcribeDictationSegment } from '@/utils/bilanApi';
import { DictationRecorder, pickMimeType } from './dictationRecorder';
import { cleanSegment, insertSegment, shiftAnchor } from './dictationText';
import { decodeToMono16k, encodeWav, sliceAtSilences, TARGET_RATE } from './audioSlicer';

export const MAX_TAKE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

export interface DictationState {
  available: boolean;          // worker configuré et prêt (statut serveur)
  supported: boolean;          // MediaRecorder + format audio disponibles
  phase: 'idle' | 'recording' | 'transcribing' | 'correcting';
  starting: boolean;           // start() en cours (avant que le micro soit acquis) : évite un double départ
  elapsedMs: number;
  level: number;               // 0..1
  inFlight: number;            // segments envoyés, pas encore revenus (toutes prises)
  failed: number;              // segments en échec définitif, en attente de Réessayer / Ignorer
  segmentsDone: number;        // segments transcrits (toutes prises vivantes)
  segmentsTotal: number | null; // total connu (prises arrêtées) ; null tant qu'une prise vivante n'a pas de total
  permissionDenied: boolean;
  importing: boolean;          // décodage et découpe d'un fichier importé en cours
}

/** Résultat d'un import de fichier : `ok`, ou la raison du refus (à afficher par l'appelant) */
export type ImportResult = 'ok' | 'busy' | 'unavailable' | 'invalid' | 'too_long';

// Une prise : ses segments, son ancre d'insertion, son contexte
interface Take {
  id: string;
  mimeType: string;
  anchor: number;
  results: Map<number, string>;
  failed: Map<number, Blob>;
  lastText: string;            // dernier segment revenu : contexte du suivant
  inFlight: number;
  recording: boolean;
  sent: number;                 // segments envoyés
  total: number | null;         // total de segments, connu à l'arrêt de la prise
  correcting: boolean;          // passe de correction en cours avant insertion unique
}

export interface UseDictationArgs {
  bilanId: number;
  notes: string;
  setNotes: (notes: string) => void;
  enabled: boolean;
  onAutoStop?: () => void;
}

export function useDictation({ bilanId, notes, setNotes, enabled, onAutoStop }: UseDictationArgs) {
  const [state, setState] = useState<DictationState>({ available: false, supported: true, phase: 'idle', starting: false, elapsedMs: 0, level: 0, inFlight: 0, failed: 0, segmentsDone: 0, segmentsTotal: null, permissionDenied: false, importing: false });
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
    let inFlight = 0; let failed = 0; let done = 0; let total: number | null = 0; let correcting = false;
    for (const t of takesRef.current) {
      inFlight += t.inFlight; failed += t.failed.size; done += t.results.size;
      if (t.total === null) total = null; else if (total !== null) total += t.total;
      if (t.correcting) correcting = true;
    }
    const recording = recorderRef.current !== null;
    const phase: DictationState['phase'] = recording ? 'recording' : correcting ? 'correcting' : (inFlight > 0 || failed > 0) ? 'transcribing' : 'idle';
    patch({ inFlight, failed, segmentsDone: done, segmentsTotal: total, phase });
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

  // Prise terminée (plus rien en vol, aucun échec en attente, enregistrement arrêté) : assemblage,
  // correction, insertion unique à l'ancre. Sur échec de la correction, le texte brut est inséré.
  const finalizeTake = useCallback(async (take: Take) => {
    // Prise pas encore prête (segment en vol, échec en attente, encore en enregistrement) : juste
    // rafraîchir les compteurs (ex. un segment revenu pendant l'enregistrement, ou un échec à signaler).
    if (take.recording || take.inFlight > 0 || take.failed.size > 0 || take.correcting) { refreshCounts(); return; }
    const raw = cleanSegment([...take.results.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t).join(' '));
    if (!raw) { takesRef.current.delete(take); refreshCounts(); return; }
    take.correcting = true;
    refreshCounts();
    let text = raw;
    try { text = (await correctDictation(bilanId, { text: raw, mode: 'dictation' })).text || raw; } catch { /* texte brut */ }
    const r = insertSegment(notesRef.current, take.anchor, text, true);
    const delta = r.notes.length - notesRef.current.length;
    for (const other of takesRef.current) if (other !== take && other.anchor >= take.anchor) other.anchor += delta;
    if (r.notes !== notesRef.current) { knownRef.current = r.notes; notesRef.current = r.notes; setNotesRef.current(r.notes); }
    takesRef.current.delete(take);
    refreshCounts();
  }, [bilanId, refreshCounts]);

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
    void finalizeTake(take);
  }, [bilanId, finalizeTake, refreshCounts]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    currentRef.current = null;
    // Le dernier segment part via onSegment, puis le recorder déclenche onStopped (enregistré dans start())
    // une fois cet envoi effectivement lancé : c'est ce callback qui ferme la prise (recording=false, finalizeTake).
    if (rec) rec.stop();
    patch({ level: 0 });
    refreshCounts();
  }, [patch, refreshCounts]);

  const start = useCallback(async (caretPos: number) => {
    if (!enabled || startingRef.current || recorderRef.current) return;
    if (!availableRef.current) {
      const ok = await refreshAvailability();
      if (!ok) return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) { patch({ supported: false }); return; }
    const take: Take = { id: crypto.randomUUID(), mimeType, anchor: Math.min(Math.max(caretPos, 0), notesRef.current.length), results: new Map(), failed: new Map(), lastText: '', inFlight: 0, recording: true, sent: 0, total: null, correcting: false };
    startingRef.current = true;
    patch({ starting: true });
    const rec = new DictationRecorder(mimeType, {
      onSegment: (blob, index) => { take.sent += 1; void sendSegment(take, blob, index); },
      onLevel: (level) => patch({ level }),
      onTick: (elapsedMs) => {
        patch({ elapsedMs });
        if (elapsedMs >= MAX_TAKE_MS) { stop(); onAutoStopRef.current?.(); }
      },
      onStopped: () => { take.recording = false; take.total = take.sent; void finalizeTake(take); },
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
    patch({ starting: false, elapsedMs: 0, permissionDenied: false });
    refreshCounts();
  }, [enabled, sendSegment, stop, finalizeTake, patch, refreshAvailability, refreshCounts]);

  // Import d'un fichier audio (mémo vocal, enregistrement de test) : même chaîne que le micro,
  // les tranches partent en parallèle comme des segments d'une prise, insérées à l'ancre du curseur.
  const importingRef = useRef(false);
  const importFile = useCallback(async (file: Blob, caretPos: number): Promise<ImportResult> => {
    if (!enabled || startingRef.current || recorderRef.current || importingRef.current) return 'busy';
    if (!availableRef.current && !(await refreshAvailability())) return 'unavailable';
    importingRef.current = true;
    patch({ importing: true });
    try {
      let pcm: Float32Array;
      try { pcm = await decodeToMono16k(file); } catch { return 'invalid'; }
      if (pcm.length < TARGET_RATE) return 'invalid';                       // moins d'une seconde
      if (pcm.length > (MAX_TAKE_MS / 1000) * TARGET_RATE) return 'too_long';
      const take: Take = { id: crypto.randomUUID(), mimeType: 'audio/wav', anchor: Math.min(Math.max(caretPos, 0), notesRef.current.length), results: new Map(), failed: new Map(), lastText: '', inFlight: 0, recording: true, sent: 0, total: null, correcting: false };
      takesRef.current.add(take);
      const slices = sliceAtSilences(pcm);
      take.sent = slices.length; take.total = slices.length;
      slices.forEach((slice, index) => { void sendSegment(take, encodeWav(slice), index); });
      take.recording = false;
      void finalizeTake(take);
      return 'ok';
    } finally {
      importingRef.current = false;
      patch({ importing: false });
    }
  }, [enabled, refreshAvailability, sendSegment, finalizeTake, patch]);

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
      void finalizeTake(take);
    }
  }, [finalizeTake]);

  // Fermeture d'onglet pendant une prise ou avec des segments en vol : confirmation native
  useEffect(() => {
    const busy = state.phase !== 'idle';
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.phase]);

  // Désactivation (bilan verrouillé, IA en cours) pendant une prise : arrêt propre
  useEffect(() => { if (!enabled && recorderRef.current) stop(); }, [enabled, stop]);

  // Démontage : on libère le micro ; les segments en vol terminent d'eux-mêmes
  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  return { state, start, stop, importFile, retryFailed, ignoreFailed };
}
