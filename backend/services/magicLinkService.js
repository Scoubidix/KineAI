/**
 * Service de génération/validation de magic links pour la signature
 * destinataire d'un contrat de remplacement libéral.
 *
 * Architecture :
 * - Token JWT HS256 signé avec MAGIC_LINK_SECRET (dédié, jamais réutilisé)
 * - On stocke en DB uniquement le hash SHA256 du JWT (jamais le brut)
 * - Token one-shot : marqué utilisé à la signature finale du destinataire
 * - Anti-replay via jti (UUID dans le payload) + accessTokenUsedAt
 * - Session token court (1h) délivré après identification du destinataire,
 *   utilisé pour les requêtes suivantes (preview, profile, sign)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const MAGIC_LINK_TTL_DAYS = 7;
const SESSION_TTL_HOURS = 1;
const TOKEN_TYPE_MAGIC = 'CONTRACT_MAGIC';
const TOKEN_TYPE_SESSION = 'CONTRACT_SESSION';

const ERROR_CODES = {
  SECRET_MISSING: 'MAGIC_LINK_SECRET_MISSING',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_INVALID: 'SESSION_INVALID',
};

function getMagicSecret() {
  const s = process.env.MAGIC_LINK_SECRET;
  if (!s || s.length < 32) {
    const err = new Error('MAGIC_LINK_SECRET manquant ou trop court (32 caractères minimum)');
    err.code = ERROR_CODES.SECRET_MISSING;
    throw err;
  }
  return s;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Génère un magic token pour qu'un destinataire accède au contrat.
 * Retourne { token, hash, jti, expiresAt }.
 */
function generateMagicToken({ contractId, signerRole = 'DESTINATAIRE' }) {
  const secret = getMagicSecret();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_DAYS * 24 * 3600 * 1000);
  const token = jwt.sign(
    { contractId, signerRole, jti, type: TOKEN_TYPE_MAGIC },
    secret,
    { algorithm: 'HS256', expiresIn: `${MAGIC_LINK_TTL_DAYS}d` }
  );
  return { token, hash: hashToken(token), jti, expiresAt };
}

/**
 * Vérifie un magic token. Throw avec code TOKEN_INVALID si invalide/expiré.
 * Retourne le payload + le hash calculé (pour lookup DB).
 */
function verifyMagicToken(token) {
  try {
    const payload = jwt.verify(token, getMagicSecret(), { algorithms: ['HS256'] });
    if (payload.type !== TOKEN_TYPE_MAGIC) {
      throw new Error('Token type mismatch');
    }
    return { ...payload, hash: hashToken(token) };
  } catch (err) {
    const e = new Error('Lien invalide ou expiré');
    e.code = ERROR_CODES.TOKEN_INVALID;
    throw e;
  }
}

/**
 * Génère un session token court (1h) après identification du destinataire.
 * Sert pour les requêtes suivantes (preview-pdf, profile, sign).
 */
function generateSessionToken({ contractId, signerRole, jti, mode }) {
  const secret = getMagicSecret();
  return jwt.sign(
    { contractId, signerRole, jti, mode, type: TOKEN_TYPE_SESSION },
    secret,
    { algorithm: 'HS256', expiresIn: `${SESSION_TTL_HOURS}h` }
  );
}

function verifySessionToken(token) {
  try {
    const payload = jwt.verify(token, getMagicSecret(), { algorithms: ['HS256'] });
    if (payload.type !== TOKEN_TYPE_SESSION) {
      throw new Error('Token type mismatch');
    }
    return payload;
  } catch (err) {
    const e = new Error('Session invalide ou expirée');
    e.code = ERROR_CODES.SESSION_INVALID;
    throw e;
  }
}

module.exports = {
  ERROR_CODES,
  MAGIC_LINK_TTL_DAYS,
  SESSION_TTL_HOURS,
  generateMagicToken,
  verifyMagicToken,
  generateSessionToken,
  verifySessionToken,
  hashToken,
};
