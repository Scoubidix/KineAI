// utils/nameNormalization.js
// Normalisation Nom / Prénom — source de vérité pour le format en DB.

/**
 * Capitalise la première lettre de chaque "mot" séparé par espace ou tiret.
 * Préserve les accents. Retourne "" si entrée vide.
 *
 * Exemples:
 *   "valentin"     → "Valentin"
 *   "JEAN-PIERRE"  → "Jean-Pierre"
 *   "anne marie"   → "Anne Marie"
 *   "mélina"       → "Mélina"
 */
function normalizeFirstName(s) {
  if (!s) return '';
  const trimmed = String(s).trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(
    /(^|[\s-])([a-zàâäéèêëïîôöùûüçñ])/g,
    (_, sep, ch) => sep + ch.toUpperCase()
  );
}

/**
 * Met tout le nom en MAJUSCULES, préserve les accents et caractères spéciaux.
 * Retourne "" si entrée vide.
 *
 * Exemples:
 *   "dupont"          → "DUPONT"
 *   "müller"          → "MÜLLER"
 *   "de la fontaine"  → "DE LA FONTAINE"
 *   "o'connor"        → "O'CONNOR"
 */
function normalizeLastName(s) {
  if (!s) return '';
  return String(s).trim().toUpperCase();
}

module.exports = { normalizeFirstName, normalizeLastName };
