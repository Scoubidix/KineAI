import { fetchWithAuth } from '@/utils/fetchWithAuth';
import type { BilanJobView, BilanListItem, BilanPatch, BilanRecord, BilanSectionKey, BilanStatus, BilanType, ComposeFromNotesResult, ComposeResult, ExtractionResult } from '@/types/bilan';

const API = process.env.NEXT_PUBLIC_API_URL || '';

/** Erreur API typée : code métier + statut HTTP + détails éventuels (INVALID_DOCUMENT). */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: string[];
  /** Délai suggéré (ms) avant de réessayer, lu depuis l'en-tête Retry-After (429). */
  retryAfterMs?: number;
  /** Corps JSON brut de la réponse : champs métier supplémentaires (ex. measurementsSaved sur COMPOSE_FAILED) */
  body: Record<string, unknown>;
  constructor(message: string, code: string, status: number, details?: string[], retryAfterMs?: number, body: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }
}

/** 409 : le bilan a été modifié ailleurs ; `updatedAt` est la version en base. */
export class StaleDraftError extends ApiError {
  updatedAt: string;
  constructor(message: string, updatedAt: string) {
    super(message, 'STALE_DRAFT', 409);
    this.updatedAt = updatedAt;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${API}/api/bilans${path}`, init);
  let json: Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* corps vide */ }
  if (!res.ok || json.success === false) {
    const message = (json.error as string) || `Erreur ${res.status}`;
    const code = (json.code as string) || 'HTTP_ERROR';
    if (res.status === 409 && code === 'STALE_DRAFT') throw new StaleDraftError(message, json.updatedAt as string);
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfterMs = retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))
      ? Number(retryAfterHeader) * 1000
      : undefined;
    throw new ApiError(message, code, res.status, json.details as string[] | undefined, retryAfterMs, json);
  }
  return json as T;
}

// fetchWithAuth pose déjà Content-Type: application/json (hors FormData)
const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function createBilan(input: { type?: BilanType; patientId?: number | null; motif?: string | null }): Promise<BilanRecord> {
  const r = await call<{ bilan: BilanRecord }>('', jsonInit('POST', input));
  return r.bilan;
}

export async function listMyBilans(opts: { statuses?: BilanStatus[]; limit?: number } = {}): Promise<BilanListItem[]> {
  const params = new URLSearchParams();
  if (opts.statuses?.length) params.set('status', opts.statuses.join(','));
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const r = await call<{ bilans: BilanListItem[] }>(qs ? `?${qs}` : '');
  return r.bilans;
}

export async function getBilan(id: number): Promise<BilanRecord> {
  const r = await call<{ bilan: BilanRecord }>(`/${id}`);
  return r.bilan;
}

export async function patchBilan(id: number, patch: BilanPatch, expectedUpdatedAt: string): Promise<{ updatedAt: string }> {
  const r = await call<{ updatedAt: string }>(`/${id}`, jsonInit('PATCH', { ...patch, expectedUpdatedAt }));
  return { updatedAt: r.updatedAt };
}

export async function attachPatient(id: number, patientId: number): Promise<BilanRecord> {
  const r = await call<{ bilan: BilanRecord }>(`/${id}/attach`, jsonInit('POST', { patientId }));
  return r.bilan;
}

export async function finalizeBilan(id: number): Promise<BilanRecord> {
  const r = await call<{ bilan: BilanRecord }>(`/${id}/finalize`, jsonInit('POST'));
  return r.bilan;
}

export async function deleteBilan(id: number): Promise<'hard' | 'soft'> {
  const r = await call<{ deleted: 'hard' | 'soft' }>(`/${id}`, { method: 'DELETE' });
  return r.deleted;
}

/** Analyse des notes : candidats cités, rien n'est écrit dans le bilan. */
export async function extractBilan(id: number): Promise<ExtractionResult> {
  const r = await call<ExtractionResult>(`/${id}/extract`, jsonInit('POST'));
  return { candidates: r.candidates, rejected: r.rejected };
}

/** Rédaction IA : toutes les sections (défaut) ou celles demandées. Renvoie le bilan mis à jour. */
export async function composeBilan(id: number, sections?: BilanSectionKey[]): Promise<ComposeResult> {
  const r = await call<ComposeResult>(`/${id}/compose`, jsonInit('POST', sections ? { sections } : {}));
  return { bilan: r.bilan, warnings: r.warnings ?? {} };
}

/** « Rédiger avec l'IA » : extraction, acceptation automatique, rédaction des 7 sections, en un appel. */
export async function composeBilanFromNotes(id: number): Promise<ComposeFromNotesResult> {
  const r = await call<ComposeFromNotesResult>(`/${id}/compose-from-notes`, jsonInit('POST'));
  return { bilan: r.bilan, warnings: r.warnings ?? {}, accepted: r.accepted ?? [], pending: r.pending ?? [], rejected: r.rejected ?? 0 };
}

/** Le worker de dictée est-il configuré et prêt ? (résultat mis en cache 30 s côté serveur) */
export async function getDictationStatus(): Promise<boolean> {
  const r = await call<{ available: boolean }>('/dictation/status');
  return r.available === true;
}

export interface DictationSegmentResult { text: string; audioSeconds: number; processingSeconds: number }

/** Transcrit un segment audio de dictée (rien n'est écrit : le texte est inséré dans les notes côté client). */
export async function transcribeDictationSegment(id: number, input: { blob: Blob; mimeType: string; takeId: string; index: number; prevText: string }): Promise<DictationSegmentResult> {
  const form = new FormData();
  form.append('audio', input.blob, 'segment');
  form.append('takeId', input.takeId);
  form.append('index', String(input.index));
  form.append('prevText', input.prevText.slice(0, 600));
  form.append('mimeType', input.mimeType);
  const r = await call<DictationSegmentResult>(`/${id}/dictation`, { method: 'POST', body: form });
  return { text: r.text ?? '', audioSeconds: r.audioSeconds ?? 0, processingSeconds: r.processingSeconds ?? 0 };
}

/** Passe de correction d'une prise (termes, hésitations) : renvoie le texte brut si le serveur n'a rien pu corriger. */
export async function correctDictation(id: number, input: { text: string; mode: 'dictation' | 'session' }, signal?: AbortSignal): Promise<{ text: string; applied: number; ignored: number }> {
  const r = await call<{ text: string; applied: number; ignored: number }>(`/${id}/dictation/correct`, { ...jsonInit('POST', input), signal });
  return { text: r.text ?? input.text, applied: r.applied ?? 0, ignored: r.ignored ?? 0 };
}

// ---- Traitement de dictée côté serveur (plan 7) ----

/** Crée (ou remet à zéro) le traitement de dictée du bilan : statut RECORDING. */
export async function createJob(id: number, kind: 'DICTATION' | 'SESSION' = 'DICTATION'): Promise<BilanJobView> {
  const r = await call<{ job: BilanJobView }>(`/${id}/job`, jsonInit('POST', { kind }));
  return r.job;
}

/** Envoie un segment audio ; le serveur répond « reçu » (202) et transcrit en arrière-plan. */
export async function uploadJobSegment(id: number, input: { blob: Blob; index: number; mimeType: string }): Promise<void> {
  const form = new FormData();
  form.append('audio', input.blob, 'segment');
  form.append('index', String(input.index));
  form.append('mimeType', input.mimeType);
  await call<{ index: number }>(`/${id}/job/segments`, { method: 'POST', body: form });
}

/** « Générer le bilan » : fin d'enregistrement, le serveur enchaîne transcription → correction → rédaction. */
export async function finishJob(id: number, segmentsTotal: number): Promise<BilanJobView> {
  const r = await call<{ job: BilanJobView }>(`/${id}/job/finish`, jsonInit('POST', { segmentsTotal }));
  return r.job;
}

/** Avancement du traitement ; lève ApiError 404 JOB_NOT_FOUND s'il n'y en a pas. */
export async function getJob(id: number): Promise<BilanJobView> {
  const r = await call<{ job: BilanJobView }>(`/${id}/job`);
  return r.job;
}

/** « Continuer sans ces passages » */
export async function skipFailedSegments(id: number): Promise<BilanJobView> {
  const r = await call<{ job: BilanJobView }>(`/${id}/job/skip-failed`, jsonInit('POST'));
  return r.job;
}

/** « Réessayer » après un échec de correction ou de rédaction */
export async function retryJob(id: number): Promise<BilanJobView> {
  const r = await call<{ job: BilanJobView }>(`/${id}/job/retry`, jsonInit('POST'));
  return r.job;
}
