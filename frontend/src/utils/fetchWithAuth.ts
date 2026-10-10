// frontend/src/utils/fetchWithAuth.ts
import { getAuth, onAuthStateChanged, type Auth, type User } from "firebase/auth";

/**
 * Attend la restauration de session Firebase au premier chargement.
 * `auth.currentUser` est null tant que `onAuthStateChanged` n'a pas émis : un fetch
 * lancé au montage échouait alors avec « Utilisateur non connecté » (race condition).
 * On résout dès la 1re émission (utilisateur restauré, ou réellement déconnecté → null).
 */
const waitForCurrentUser = (auth: Auth): Promise<User | null> => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

// Délais avant chaque nouvelle tentative (backoff) : 1 s, puis 3 s.
const RETRY_DELAYS_MS = [1000, 3000];

/**
 * fetch qui relance les GET échoués sur erreur réseau (aucune réponse reçue :
 * coupure brève, réveil du poste, flux HTTP/2 refusé par le load balancer).
 * Une réponse HTTP, même 4xx/5xx, est renvoyée telle quelle. POST/PUT/DELETE ne
 * sont jamais relancés : la 1re requête a pu être traitée, la rejouer créerait un
 * doublon. Une annulation (AbortError) n'est pas une TypeError : pas de relance.
 */
export const fetchWithRetry = async (url: string, init: RequestInit = {}) => {
  const isGet = (init.method ?? "GET").toUpperCase() === "GET";
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (!isGet || delay === undefined || !(error instanceof TypeError)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Fait un fetch avec ajout automatique du token Firebase dans l'en-tête Authorization.
 *
 * @param url - L'URL de l'API backend
 * @param options - Les options de la requête fetch (headers, method, body, etc.)
 * @returns La réponse du fetch
 */
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const auth = getAuth();
  const user = await waitForCurrentUser(auth);

  if (!user) throw new Error("Utilisateur non connecté");

  const idToken = await user.getIdToken();

  // Construire les headers de base
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
    Authorization: `Bearer ${idToken}`,
  };

  // N'ajouter Content-Type que si ce n'est pas du FormData
  // (FormData nécessite que le navigateur génère automatiquement le Content-Type avec boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return fetchWithRetry(url, {
    ...options,
    headers,
  });
};
