import { fetchWithAuth } from '@/utils/fetchWithAuth';

/** Limite dure, identique au schéma Zod backend (patientNoteSchema). */
export const NOTE_MAX_LENGTH = 2000;

export interface PatientNote {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const notesUrl = (patientId: number) => `${process.env.NEXT_PUBLIC_API_URL}/patients/${patientId}/notes`;

async function readJson(res: Response, failure: string) {
  if (!res.ok) throw new Error(failure);
  return res.json();
}

export async function listPatientNotes(patientId: number): Promise<PatientNote[]> {
  const data = await readJson(await fetchWithAuth(notesUrl(patientId)), 'Échec du chargement des notes');
  return data.notes;
}

export async function createPatientNote(patientId: number, content: string): Promise<PatientNote> {
  const res = await fetchWithAuth(notesUrl(patientId), { method: 'POST', body: JSON.stringify({ content }) });
  const data = await readJson(res, "Échec de l'enregistrement de la note");
  return data.note;
}

export async function updatePatientNote(patientId: number, noteId: number, content: string): Promise<PatientNote> {
  const res = await fetchWithAuth(`${notesUrl(patientId)}/${noteId}`, { method: 'PUT', body: JSON.stringify({ content }) });
  const data = await readJson(res, "Échec de l'enregistrement de la note");
  return data.note;
}

export async function deletePatientNote(patientId: number, noteId: number): Promise<void> {
  const res = await fetchWithAuth(`${notesUrl(patientId)}/${noteId}`, { method: 'DELETE' });
  await readJson(res, 'Échec de la suppression de la note');
}
