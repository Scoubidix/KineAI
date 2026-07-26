import { fetchWithAuth } from '@/utils/fetchWithAuth';

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/visio`;

/**
 * Appel réseau authentifié + normalisation des erreurs de connexion en message FR.
 * fetch() rejette avec un TypeError (« Failed to fetch ») en cas de coupure réseau /
 * serveur injoignable / CORS — on le remplace par un message clair pour l'UI.
 */
async function req(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchWithAuth(input, init);
  } catch {
    throw new Error('Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.');
  }
}

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
  isArchived?: boolean;
  archivedAt?: string | null;
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
  const res = await req(`${BASE}/seances`, { method: 'POST', body: JSON.stringify(input) });
  return json<{ seance: VisioSeance; seanceUrl: string; linkSent: boolean }>(res);
}
export async function listSeances(archived = false) {
  const qs = archived ? '?archived=1' : '';
  return json<VisioSeance[]>(await req(`${BASE}/seances${qs}`));
}
/** Archive en lot des séances d'historique. Renvoie le nombre effectivement archivé. */
export async function archiveSeances(ids: number[]) {
  const res = await req(`${BASE}/seances/archive`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  return json<{ success: boolean; archived: number }>(res);
}
/** Désarchive une séance. */
export async function unarchiveSeance(id: number) {
  return json<VisioSeance>(await req(`${BASE}/seances/${id}/unarchive`, { method: 'PATCH' }));
}
export async function getSeance(id: number) {
  return json<VisioSeance>(await req(`${BASE}/seances/${id}`));
}
export async function setConsent(id: number) {
  return json<VisioSeance>(await req(`${BASE}/seances/${id}/consent`, { method: 'PATCH' }));
}
export async function cancelSeance(id: number) {
  return json<VisioSeance>(await req(`${BASE}/seances/${id}/cancel`, { method: 'PATCH' }));
}
export async function rescheduleSeance(id: number, scheduledAt: string) {
  const res = await req(`${BASE}/seances/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledAt }),
  });
  return json<VisioSeance>(res);
}
export async function resendLink(id: number, deliveryChannel: VisioChannel) {
  const res = await req(`${BASE}/seances/${id}/resend-link`, {
    method: 'POST',
    body: JSON.stringify({ deliveryChannel }),
  });
  return json<VisioSeance>(res);
}
export async function saveCompteRendu(id: number, compteRendu: string) {
  const res = await req(`${BASE}/seances/${id}/compte-rendu`, {
    method: 'PATCH',
    body: JSON.stringify({ compteRendu }),
  });
  return json<VisioSeance>(res);
}
/** Télécharge le PDF du compte-rendu (généré à la volée, jamais stocké). */
export async function downloadCompteRenduPdf(id: number) {
  const res = await req(`${BASE}/seances/${id}/compte-rendu/pdf`);
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
  const res = await req(`${BASE}/seances/${id}/send-document`, {
    method: 'POST',
    body: form,
  });
  return json<{ success: boolean }>(res);
}
