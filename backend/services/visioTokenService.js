const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const PATIENT_JWT_SECRET = process.env.JWT_SECRET_PATIENT;
if (!PATIENT_JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET_PATIENT non definie. Le serveur ne peut pas demarrer.");
}

const TOKEN_TYPE = 'patient_visio';
const WINDOW_MS = 2 * 60 * 60 * 1000; // lien valide jusqu'a scheduledAt + 2h

/**
 * Génère un JWT dédié à une séance visio. Expire à scheduledAt + 2h.
 */
function generateVisioToken(seanceId, patientId, scheduledAt) {
  try {
    const exp = Math.floor((new Date(scheduledAt).getTime() + WINDOW_MS) / 1000);
    const payload = {
      seanceId: parseInt(seanceId),
      patientId: parseInt(patientId),
      type: TOKEN_TYPE,
      iat: Math.floor(Date.now() / 1000),
      exp,
    };
    const token = jwt.sign(payload, PATIENT_JWT_SECRET);
    return { success: true, token, expiresAt: new Date(exp * 1000).toISOString() };
  } catch (error) {
    logger.error('Erreur generation token visio:', error.message);
    return { success: false, error: 'Erreur lors de la generation du token' };
  }
}

/**
 * Valide un JWT séance. Vérifie signature, type et expiration.
 */
function validateVisioToken(token) {
  try {
    const decoded = jwt.verify(token, PATIENT_JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.type !== TOKEN_TYPE) {
      return { success: false, error: 'Type de token invalide', code: 'INVALID_TOKEN_TYPE' };
    }
    return { success: true, seanceId: decoded.seanceId, patientId: decoded.patientId };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { success: false, error: 'Token expire', code: 'TOKEN_EXPIRED' };
    }
    return { success: false, error: 'Token invalide', code: 'INVALID_TOKEN' };
  }
}

module.exports = { generateVisioToken, validateVisioToken };
