/**
 * Middleware d'authentification des routes publiques d'accès contrat.
 * Vérifie le session token (Bearer) délivré après identification du destinataire.
 *
 * Set sur req :
 *   req.contractSession = { contractId, signerRole, jti, mode }
 */

const magicLinkService = require('../services/magicLinkService');
const logger = require('../utils/logger');
const { sanitizeIP } = require('../utils/logSanitizer');

function contractSessionRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Session manquante',
      code: 'SESSION_MISSING',
    });
  }

  try {
    const payload = magicLinkService.verifySessionToken(token);
    req.contractSession = {
      contractId: payload.contractId,
      signerRole: payload.signerRole,
      jti: payload.jti,
      mode: payload.mode,
    };
    next();
  } catch (err) {
    logger.warn(`Session contrat invalide depuis IP ${sanitizeIP(req.ip)}`);
    return res.status(401).json({
      success: false,
      error: 'Session invalide ou expirée',
      code: 'SESSION_INVALID',
    });
  }
}

module.exports = { contractSessionRequired };
