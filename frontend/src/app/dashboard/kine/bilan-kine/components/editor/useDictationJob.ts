'use client';
// Flux « Dicter → Bilan » (plan 7b) : le recorder coupe des segments, chacun est envoyé au serveur
// sans attendre la transcription ; « Générer » clôt l'enregistrement, puis on sonde l'avancement.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, createJob, finishJob, getDictationStatus, getJob, retryJob as apiRetryJob, skipFailedSegments, uploadJobSegment } from '@/utils/bilanApi';
import type { BilanJobView } from '@/types/bilan';
import { DictationRecorder, pickMimeType } from './dictationRecorder';
import { decodeToMono16k, encodeWav, sliceAtSilences, TARGET_RATE } from './audioSlicer';
import { displayProgress, isProcessing } from './dictationJobProgress';

export const MAX_TAKE_MS = 10 * 60 * 1000;
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;
const POLL_MS = 2_000;
const TICK_MS = 250;
// Même borne que le serveur (bilanJobRules) : au-delà, l'envoi serait refusé sans explication
const MAX_SEGMENTS = 500;
// Envois d'un import : plusieurs dizaines de segments d'un coup saturent la connexion
const IMPORT_CONCURRENCY = 3;

export type JobPhase = 'idle' | 'recording' | 'stopped' | 'processing' | 'done' | 'failed';
export type ImportResult = 'ok' | 'busy' | 'unavailable' | 'invalid' | 'too_long';
/** Raison pour laquelle une prise n'a pas pu démarrer (affichée sous l'invite de l'écran) */
export type StartError = 'done' | 'busy' | 'finalized' | 'limit' | 'network';

export interface DictationJobState {
  available: boolean;        // worker configuré et prêt
  supported: boolean;        // MediaRecorder + format audio disponibles
  phase: JobPhase;
  starting: boolean;         // start() en cours (avant que le micro soit acquis)
  elapsedMs: number;         // chrono de la prise en cours
  totalMs: number;           // durée cumulée des prises (affichée après Stop)
  level: number;             // 0..1 vumètre
  permissionDenied: boolean;
  importing: boolean;
  segmentsSent: number;      // segments acquittés par le serveur (202)
  uploading: number;         // envois en cours
  uploadFailed: number;      // envois en échec définitif (blobs gardés en mémoire pour « Réessayer l'envoi »)
  interrupted: boolean;      // traitement RECORDING retrouvé après rechargement : la prise avait été coupée
  generating: boolean;       // « Générer » en cours d'appel
  generateError: boolean;    // dernière tentative de « Générer » en échec (hors 409, le kiné recliquera)
  startError: StartError | null;   // dernière prise refusée (traitement terminé, occupé, bilan enregistré…)
  job: BilanJobView | null;
  progress: number;          // 0..1 affiché, jamais décroissant
}

export interface UseDictationJobArgs {
  bilanId: number;
  initialJob: BilanJobView | null;
  enabled: boolean;
  onAutoStop?: () => void;
}

interface PendingUpload { blob: Blob; mimeType: string }

/** Pourquoi la création du traitement a échoué, dans les termes de l'écran. */
const startErrorOf = (e: unknown): StartError => {
  if (e instanceof ApiError) return e.code === 'ALREADY_FINALIZED' ? 'finalized' : e.status === 409 ? 'busy' : 'network';
  if (e instanceof Error && e.message === 'JOB_DONE') return 'done';
  return 'network';
};

const phaseOf = (job: BilanJobView | null, recording: boolean, hasSegments: boolean): JobPhase => {
  if (recording) return 'recording';
  if (!job) return hasSegments ? 'stopped' : 'idle';
  if (job.status === 'RECORDING') return hasSegments ? 'stopped' : 'idle';
  if (isProcessing(job.status)) return 'processing';
  return job.status === 'DONE' ? 'done' : 'failed';
};

export function useDictationJob({ bilanId, initialJob, enabled, onAutoStop }: UseDictationJobArgs) {
  const [state, setState] = useState<DictationJobState>({
    available: false, supported: true, phase: phaseOf(initialJob, false, (initialJob?.nextIndex ?? 0) > 0), starting: false, elapsedMs: 0, totalMs: 0, level: 0,
    permissionDenied: false, importing: false, segmentsSent: initialJob?.nextIndex ?? 0, uploading: 0, uploadFailed: 0,
    interrupted: initialJob?.status === 'RECORDING' && (initialJob.nextIndex ?? 0) > 0, generating: false, generateError: false, startError: null, job: initialJob, progress: initialJob?.progress ?? 0,
  });
  const patch = useCallback((p: Partial<DictationJobState>) => setState((s) => ({ ...s, ...p })), []);

  const jobRef = useRef<BilanJobView | null>(initialJob);
  const nextIndexRef = useRef(initialJob?.nextIndex ?? 0);
  const recorderRef = useRef<DictationRecorder | null>(null);
  const startingRef = useRef(false);
  // Incrémenté à chaque start()/stop()/désactivation : la demande de micro peut durer plusieurs
  // secondes, un Stop ou une désactivation pendant ce temps ne doit pas laisser un enregistreur publié.
  const startTokenRef = useRef(0);
  const availableRef = useRef(false);
  const uploadingRef = useRef(0);
  const sentRef = useRef(initialJob?.nextIndex ?? 0);
  const failedRef = useRef(new Map<number, PendingUpload>());
  const takeStartMsRef = useRef(0);
  const stageRef = useRef<{ status: string | null; startedAt: number }>({ status: initialJob?.status ?? null, startedAt: Date.now() });
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;

  const setJob = useCallback((job: BilanJobView | null) => {
    jobRef.current = job;
    if (job) {
      nextIndexRef.current = Math.max(nextIndexRef.current, job.nextIndex);
      if (stageRef.current.status !== job.status) stageRef.current = { status: job.status, startedAt: Date.now() };
    }
    patch({ job, phase: phaseOf(job, recorderRef.current !== null, nextIndexRef.current > 0) });
  }, [patch]);

  const refreshUploads = useCallback(() => {
    patch({ uploading: uploadingRef.current, uploadFailed: failedRef.current.size, segmentsSent: sentRef.current, phase: phaseOf(jobRef.current, recorderRef.current !== null, nextIndexRef.current > 0) });
  }, [patch]);

  // Disponibilité du worker (cache serveur 30 s) : au montage puis toutes les 30 s tant qu'indisponible
  const refreshAvailability = useCallback(async () => {
    const ok = await getDictationStatus().catch(() => false);
    availableRef.current = ok;
    patch({ available: ok });
    return ok;
  }, [patch]);
  useEffect(() => { patch({ supported: pickMimeType() !== null }); }, [patch]);
  useEffect(() => { void refreshAvailability(); }, [refreshAvailability]);
  useEffect(() => {
    if (state.available) return;
    const timer = setInterval(() => { void refreshAvailability(); }, 30_000);
    return () => clearInterval(timer);
  }, [state.available, refreshAvailability]);

  // Le traitement est créé au premier segment (Dicter ou import), pas à l'ouverture de l'écran
  const ensureJob = useCallback(async () => {
    if (jobRef.current && jobRef.current.status === 'RECORDING') return jobRef.current;
    // Un traitement terminé ne se remet pas à zéro depuis cet écran : le bilan est déjà rédigé
    if (jobRef.current?.status === 'DONE') throw new Error('JOB_DONE');
    const job = await createJob(bilanId);
    nextIndexRef.current = job.nextIndex;
    sentRef.current = 0;
    failedRef.current = new Map();
    setJob(job);
    refreshUploads();
    return job;
  }, [bilanId, setJob, refreshUploads]);

  const uploadSegment = useCallback(async (index: number, upload: PendingUpload) => {
    uploadingRef.current += 1;
    refreshUploads();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        await uploadJobSegment(bilanId, { blob: upload.blob, index, mimeType: upload.mimeType });
        sentRef.current += 1;
        break;
      } catch (e) {
        const api = e instanceof ApiError ? e : null;
        const retryable = !api || api.status === 502 || api.status === 503 || api.status === 429;
        if (retryable && attempt < MAX_UPLOAD_ATTEMPTS) { await new Promise((r) => setTimeout(r, api?.retryAfterMs ?? RETRY_DELAY_MS)); continue; }
        failedRef.current.set(index, upload);
        break;
      }
    }
    uploadingRef.current -= 1;
    refreshUploads();
  }, [bilanId, refreshUploads]);

  const stop = useCallback(() => {
    startTokenRef.current += 1;
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) rec.stop();
    patch({ level: 0 });
    refreshUploads();
  }, [patch, refreshUploads]);

  /** Nouvelle prise (« Dicter », « Dicter la suite ») : les indices continuent après ceux déjà envoyés. */
  const start = useCallback(async () => {
    if (!enabled || startingRef.current || recorderRef.current) return;
    // La demande de micro peut durer plusieurs secondes ; un Stop ou une désactivation pendant ce
    // temps ne doit pas laisser un enregistreur publié : `token` sert de point d'annulation.
    startingRef.current = true;
    patch({ starting: true, startError: null });
    const token = ++startTokenRef.current;
    if (!availableRef.current && !(await refreshAvailability())) { startingRef.current = false; patch({ starting: false }); return; }
    const mimeType = pickMimeType();
    if (!mimeType) { startingRef.current = false; patch({ starting: false, supported: false }); return; }
    try {
      await ensureJob();
    } catch (e) {
      startingRef.current = false;
      patch({ starting: false, startError: startErrorOf(e) });
      return;
    }
    const base = nextIndexRef.current;
    const rec = new DictationRecorder(mimeType, {
      onSegment: (blob, index) => {
        const i = base + index;
        // Borne serveur atteinte : le segment serait refusé, on coupe la prise et on invite à générer
        if (i >= MAX_SEGMENTS) { stop(); patch({ startError: 'limit' }); return; }
        nextIndexRef.current = Math.max(nextIndexRef.current, i + 1);
        void uploadSegment(i, { blob, mimeType });
      },
      onLevel: (level) => patch({ level }),
      onTick: (elapsedMs) => {
        patch({ elapsedMs, totalMs: takeStartMsRef.current + elapsedMs });
        if (elapsedMs >= MAX_TAKE_MS) { stop(); onAutoStopRef.current?.(); }
      },
      onStopped: () => { refreshUploads(); },
    });
    try {
      await rec.start();
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotFoundError' || e.name === 'NotReadableError');
      patch(denied ? { permissionDenied: true, starting: false } : { supported: false, starting: false });
      startingRef.current = false;
      return;
    }
    if (token !== startTokenRef.current) { rec.stop(); startingRef.current = false; patch({ starting: false }); return; }
    recorderRef.current = rec;
    startingRef.current = false;
    takeStartMsRef.current = state.totalMs;
    patch({ starting: false, elapsedMs: 0, permissionDenied: false, interrupted: false, phase: 'recording' });
  }, [enabled, refreshAvailability, ensureJob, uploadSegment, stop, patch, state.totalMs]);

  /** Fichier audio (mémo vocal, test sans micro) : découpé aux silences, envoyé comme une prise. */
  const importingRef = useRef(false);
  const importFile = useCallback(async (file: Blob): Promise<ImportResult> => {
    if (!enabled || startingRef.current || recorderRef.current || importingRef.current) return 'busy';
    if (!availableRef.current && !(await refreshAvailability())) return 'unavailable';
    importingRef.current = true;
    patch({ importing: true, startError: null });
    try {
      let pcm: Float32Array;
      try { pcm = await decodeToMono16k(file); } catch { return 'invalid'; }
      if (pcm.length < TARGET_RATE) return 'invalid';
      if (pcm.length > (MAX_TAKE_MS / 1000) * TARGET_RATE) return 'too_long';
      try { await ensureJob(); } catch (e) { patch({ startError: startErrorOf(e) }); return 'busy'; }
      const base = nextIndexRef.current;
      const slices = sliceAtSilences(pcm);
      if (base + slices.length > MAX_SEGMENTS) return 'too_long';
      nextIndexRef.current = base + slices.length;
      patch({ totalMs: state.totalMs + Math.round((pcm.length / TARGET_RATE) * 1000), interrupted: false });
      // Envois bornés à 3 en parallèle : quelques dizaines de tranches d'un coup saturent la connexion
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor;
          cursor += 1;
          if (i >= slices.length) return;
          await uploadSegment(base + i, { blob: encodeWav(slices[i]), mimeType: 'audio/wav' });
        }
      };
      void Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, slices.length) }, () => worker()));
      refreshUploads();
      return 'ok';
    } catch (e) {
      patch({ startError: startErrorOf(e) });
      return 'busy';
    } finally {
      importingRef.current = false;
      patch({ importing: false });
    }
  }, [enabled, refreshAvailability, ensureJob, uploadSegment, refreshUploads, patch, state.totalMs]);

  const retryUploads = useCallback(() => {
    const items = [...failedRef.current.entries()];
    failedRef.current = new Map();
    for (const [index, upload] of items) void uploadSegment(index, upload);
  }, [uploadSegment]);

  /** « Générer le bilan » : tous les envois acquittés, au moins un segment. */
  const generate = useCallback(async () => {
    if (recorderRef.current || uploadingRef.current > 0 || failedRef.current.size > 0 || nextIndexRef.current === 0) return;
    patch({ generating: true, generateError: false });
    try {
      setJob(await finishJob(bilanId, nextIndexRef.current));
    } catch (e) {
      // 409 : déjà généré ailleurs → on relit l'état ; autre erreur : on reste sur l'écran, le kiné recliquera
      if (e instanceof ApiError && e.status === 409) { try { setJob(await getJob(bilanId)); } catch { /* l'écran reste tel quel */ } }
      else { patch({ generateError: true }); }
    } finally {
      patch({ generating: false });
    }
  }, [bilanId, patch, setJob]);

  const skipFailed = useCallback(async () => { try { setJob(await skipFailedSegments(bilanId)); } catch { /* le sondage rattrapera */ } }, [bilanId, setJob]);
  const retryJob = useCallback(async () => { try { setJob(await apiRetryJob(bilanId)); } catch { /* idem */ } }, [bilanId, setJob]);
  /** « Dicter à nouveau » après « Rien n'a été entendu » : traitement remis à zéro au prochain segment. */
  const restart = useCallback(() => {
    jobRef.current = null; nextIndexRef.current = 0; sentRef.current = 0; failedRef.current = new Map(); takeStartMsRef.current = 0;
    patch({ job: null, phase: 'idle', segmentsSent: 0, uploadFailed: 0, uploading: 0, totalMs: 0, progress: 0, interrupted: false, elapsedMs: 0, permissionDenied: false, generateError: false, startError: null });
  }, [patch]);

  // Sondage pendant le traitement
  const processing = state.job !== null && isProcessing(state.job.status);
  useEffect(() => {
    if (!processing) return;
    let cancelled = false;
    const tick = async () => {
      try { const j = await getJob(bilanId); if (!cancelled) setJob(j); } catch { /* réseau : on réessaie au tick suivant */ }
    };
    const timer = setInterval(() => { void tick(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [processing, bilanId, setJob]);

  // Barre : recalculée 4 fois par seconde (les étapes estimées avancent dans le temps) ; à DONE,
  // valeur figée à 1 une seule fois, sans réarmer l'intervalle.
  useEffect(() => {
    if (state.job?.status === 'DONE') {
      setState((s) => (s.progress === 1 ? s : { ...s, progress: 1 }));
      return;
    }
    if (!processing) return;
    const timer = setInterval(() => {
      setState((s) => { const p = displayProgress(s.job, stageRef.current.startedAt, Date.now(), s.progress); return p === s.progress ? s : { ...s, progress: p }; });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [processing, state.job?.status]);

  // Fermer l'onglet pendant un enregistrement ou un envoi perdrait de l'audio : confirmation native
  const busy = state.phase === 'recording' || state.uploading > 0;
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  useEffect(() => { if (!enabled) { startTokenRef.current += 1; if (recorderRef.current) stop(); } }, [enabled, stop]);
  // Démontage : le jeton coupe une demande de micro encore en vol, sinon le témoin d'enregistrement
  // de l'onglet resterait allumé après avoir quitté la page.
  useEffect(() => () => { startTokenRef.current += 1; recorderRef.current?.stop(); }, []);

  return { state, start, stop, generate, importFile, retryUploads, skipFailed, retryJob, restart };
}
