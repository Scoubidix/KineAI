// utils/logSanitizer.js
// Utilitaires d'anonymisation des logs pour conformité RGPD

/**
 * Anonymise un UID Firebase pour les logs
 * @param {string} uid - UID Firebase à anonymiser
 * @returns {string} - UID anonymisé (3 premiers + *** + 3 derniers)
 */
function sanitizeUID(uid) {
  if (!uid || typeof uid !== 'string') return 'N/A';
  if (uid.length <= 6) return '***';
  return `${uid.substring(0, 3)}***${uid.slice(-3)}`;
}

/**
 * Anonymise une adresse email pour les logs
 * @param {string} email - Email à anonymiser  
 * @returns {string} - Email anonymisé (première lettre + *** + @domaine)
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return 'N/A';
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'invalid@email';
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Anonymise un ID numérique pour les logs
 * @param {number|string} id - ID à anonymiser
 * @returns {string} - ID anonymisé (*** + 3 derniers chiffres)
 */
function sanitizeId(id) {
  if (!id) return 'N/A';
  const idStr = String(id);
  if (idStr.length <= 3) return '***';
  return `***${idStr.slice(-3)}`;
}

/**
 * Anonymise un nom/prénom pour les logs
 * @param {string} name - Nom à anonymiser
 * @returns {string} - Nom anonymisé (première lettre + ***)
 */
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return 'N/A';
  return `${name.charAt(0)}***`;
}

/**
 * Anonymise une adresse IP pour les logs
 * @param {string} ip - IP à anonymiser
 * @returns {string} - IP anonymisée (xxx.xxx.xxx.***)
 */
function sanitizeIP(ip) {
  if (!ip || typeof ip !== 'string') return 'N/A';
  if (ip.includes(':')) {
    // IPv6 - garder les premiers segments
    const segments = ip.split(':');
    return segments.slice(0, 3).join(':') + ':***';
  } else {
    // IPv4 - masquer le dernier octet
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
    }
    return 'IP_INVALID';
  }
}

/**
 * Fonction générique pour anonymiser les données utilisateur
 * @param {Object} data - Données à anonymiser
 * @returns {Object} - Données anonymisées pour logs
 */
function sanitizeUserData(data) {
  if (!data || typeof data !== 'object') return {};
  
  return {
    uid: data.uid ? sanitizeUID(data.uid) : undefined,
    email: data.email ? sanitizeEmail(data.email) : undefined,
    id: data.id ? sanitizeId(data.id) : undefined,
    patientId: data.patientId ? sanitizeId(data.patientId) : undefined,
    programmeId: data.programmeId ? sanitizeId(data.programmeId) : undefined,
    firstName: data.firstName ? sanitizeName(data.firstName) : undefined,
    lastName: data.lastName ? sanitizeName(data.lastName) : undefined,
    ip: data.ip ? sanitizeIP(data.ip) : undefined
  };
}

/**
 * Determine si on doit anonymiser selon l'environnement
 * En production : toujours anonymiser
 * En développement : possibilité de désactiver avec DISABLE_LOG_SANITIZATION=true
 */
function shouldSanitize() {
  if (process.env.NODE_ENV === 'production') {
    return true; // Toujours anonymiser en production
  }
  
  // En développement, possibilité de désactiver pour debug
  return !process.env.DISABLE_LOG_SANITIZATION;
}

/**
 * Wrapper conditionnel pour l'anonymisation
 * @param {string} data - Données à potentiellement anonymiser
 * @param {Function} sanitizeFunction - Fonction d'anonymisation à utiliser
 * @returns {string} - Données anonymisées ou originales selon l'environnement
 */
function conditionalSanitize(data, sanitizeFunction) {
  return shouldSanitize() ? sanitizeFunction(data) : data;
}

module.exports = {
  sanitizeUID,
  sanitizeEmail,
  sanitizeId,
  sanitizeName,
  sanitizeIP,
  sanitizeUserData,
  shouldSanitize,
  conditionalSanitize
};