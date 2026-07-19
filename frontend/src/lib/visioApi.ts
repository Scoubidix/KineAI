import { fetchWithAuth } from '@/utils/fetchWithAuth';

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/visio`;

export type VisioStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type VisioChannel = 'EMAIL' | 'WHATSAPP';

export interface VisioSeance {
  id: number;
  roomId: string;
  scheduledAt: string;
  status: VisioStatus;
  deliveryChannel: VisioChannel;
  consentOralAt: string | null;
  patient?: { id: number; firstName: string; lastName: string };
  patientPresent?: boolean; // patient actuellement connecté à la room (présence live)
}

export interface CreateSeanceInput {
  patientId: number;
  scheduledAt: string; // ISO
  deliveryChannel: VisioChannel;
  prereqsAttested: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Erreur ${res.status}`);
  }
  return res.json();
}

export async function createSeance(input: CreateSeanceInput) {
  const res = await fetchWithAuth(`${BASE}/seances`, { method: 'POST', body: JSON.stringify(input) });
  return json<{ seance: VisioSeance; seanceUrl: string; linkSent: boolean }>(res);
}
export async function listSeances() {
  return json<VisioSeance[]>(await fetchWithAuth(`${BASE}/seances`));
}
export async function getSeance(id: number) {
  return json<VisioSeance>(await fetchWithAuth(`${BASE}/seances/${id}`));
}
export async function setConsent(id: number) {
  return json<VisioSeance>(await fetchWithAuth(`${BASE}/seances/${id}/consent`, { method: 'PATCH' }));
}
export async function cancelSeance(id: number) {
  return json<VisioSeance>(await fetchWithAuth(`${BASE}/seances/${id}/cancel`, { method: 'PATCH' }));
}
export async function rescheduleSeance(id: number, scheduledAt: string) {
  const res = await fetchWithAuth(`${BASE}/seances/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledAt }),
  });
  return json<VisioSeance>(res);
}
