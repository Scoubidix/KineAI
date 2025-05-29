// frontend/src/utils/fetchWithAuth.ts
import { getAuth } from "firebase/auth";

/**
 * Fait un fetch avec ajout automatique du token Firebase dans l'en-tête Authorization.
 * 
 * @param url - L'URL de l'API backend
 * @param options - Les options de la requête fetch (headers, method, body, etc.)
 * @returns La réponse du fetch
 */
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) throw new Error("Utilisateur non connecté");

  const idToken = await user.getIdToken();

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });
};
