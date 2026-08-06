import { fetchWithAuth } from '@/utils/fetchWithAuth';

export interface PatientContactUpdate {
  email?: string;
  phone?: string;
}

/**
 * Met à jour le contact (email et/ou phone) d'un patient via l'endpoint consolidé
 * `PATCH /patients/:id/contact`. Utilisé par la modal "compléter le contact manquant"
 * (flux Courrier / Programme / Visio). Lève une erreur si la requête échoue.
 */
export async function updatePatientContact(
  patientId: number | string,
  contact: PatientContactUpdate
): Promise<void> {
  const res = await fetchWithAuth(
    `${process.env.NEXT_PUBLIC_API_URL}/patients/${patientId}/contact`,
    {
      method: 'PATCH',
      body: JSON.stringify(contact),
    }
  );
  if (!res.ok) {
    throw new Error("Échec de l'enregistrement du contact");
  }
}
