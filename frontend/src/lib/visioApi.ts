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
  compteRendu?: string | null;
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
export async function resendLink(id: number, deliveryChannel: VisioChannel) {
  const res = await fetchWithAuth(`${BASE}/seances/${id}/resend-link`, {
    method: 'POST',
    body: JSON.stringify({ deliveryChannel }),
  });
  return json<VisioSeance>(res);
}
export async function saveCompteRendu(id: number, compteRendu: string) {
  const res = await fetchWithAuth(`${BASE}/seances/${id}/compte-rendu`, {
    method: 'PATCH',
    body: JSON.stringify({ compteRendu }),
  });
  return json<VisioSeance>(res);
}
/** Télécharge le PDF du compte-rendu (généré à la volée, jamais stocké). */
export async function downloadCompteRenduPdf(id: number) {
  const res = await fetchWithAuth(`${BASE}/seances/${id}/compte-rendu/pdf`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compte-rendu-seance-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/** Envoie un document (fichier) au patient par email. */
export async function sendDocument(id: number, file: File, message: string) {
  const form = new FormData();
  form.append('document', file);
  if (message) form.append('message', message);
  // fetchWithAuth ajoute le Bearer ; ne pas fixer Content-Type (le navigateur pose le boundary)
  const res = await fetchWithAuth(`${BASE}/seances/${id}/send-document`, {
    method: 'POST',
    body: form,
  });
  return json<{ success: boolean }>(res);
}
