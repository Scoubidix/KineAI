import { fetchWithAuth } from '@/utils/fetchWithAuth';
import type { BilanListItem, BilanPatch, BilanRecord, BilanSectionKey, BilanStatus, BilanType, ComposeResult, ExtractionResult } from '@/types/bilan';

const API = process.env.NEXT_PUBLIC_API_URL || '';

/** Erreur API typée : code métier + statut HTTP + détails éventuels (INVALID_DOCUMENT). */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: string[];
  /** Délai suggéré (ms) avant de réessayer, lu depuis l'en-tête Retry-After (429). */
  retryAfterMs?: number;
  constructor(message: string, code: string, status: number, details?: string[], retryAfterMs?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfterMs = retryAfterMs;
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
    throw new ApiError(message, code, res.status, json.details as string[] | undefined, retryAfterMs);
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
