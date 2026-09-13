/** Route et forme des données de « Bilans réalisés », hors d'un `page.tsx`.
 *  App Router n'autorise dans un `page.tsx` que l'export par défaut et ses clés de config :
 *  y exporter une constante fait entrer le module de page dans le bundle de ses importateurs. */

export const BILANS_REALISES_HREF = '/dashboard/kine/bilan-kine/bilans-realises';

/** Patient tel que le renvoie `GET /api/bilans/patients-with-bilans`. */
export interface PatientWithBilans {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  lastBilanDate: string | null;
  bilanCount: number;
}

/** Un identifiant d'URL n'est un id que s'il est une suite de chiffres : `Number('1e3')` vaut
 *  1000 et `Number('0x10')` vaut 16, ce qui chargerait silencieusement un autre dossier. */
export const parseId = (raw: string | undefined): number | null =>
  (raw && /^\d+$/.test(raw) ? Number(raw) : null);
