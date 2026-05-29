// utils/nameNormalization.ts
// Miroir frontend de backend/utils/nameNormalization.js.
// Utilisé pour afficher la preview live "Sera enregistré : Valentin" dans
// le wizard d'onboarding et la modal profil. Le backend reste la source
// de vérité — cette version sert uniquement à l'aperçu UX.

export function normalizeFirstName(s: string): string {
  if (!s) return '';
  const trimmed = String(s).trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(
    /(^|[\s-])([a-zàâäéèêëïîôöùûüçñ])/g,
    (_, sep, ch) => sep + ch.toUpperCase()
  );
}

export function normalizeLastName(s: string): string {
  if (!s) return '';
  return String(s).trim().toUpperCase();
}
