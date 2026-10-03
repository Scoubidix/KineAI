// services/mediaLinkService.js — Liens stables des démos d'exercices du chat patient
//
// Le message du chat stocke un lien RELATIF signé par notre backend
// (`/api/media/demo/...`), jamais une URL de stockage : celle-ci est signée à la
// demande, et pour une heure, par la route de redirection
// (controllers/mediaController.js). Le message ne dépend donc ni du fournisseur
// de stockage ni de la limite de 7 jours des signatures v4, et un programme
// supprimé ou archivé coupe ses démos.
// Spec : docs/superpowers/specs/2026-10-02-lien-media-demo-design.md
const crypto = require('crypto');
const logger = require('../utils/logger');

const LINK_VERSION = 'v1';
// Un programme mis à jour après sa dateFin, ou un appel sans dateFin (mode
// direct d'openaiService), reçoit quand même un lien de 2 h.
const MIN_VALIDITY_MS = 2 * 60 * 60 * 1000;

let missingSecretLogged = false;

/**
 * Secret HMAC des liens. ⚠️ Il ne doit jamais changer : une rotation invalide
 * tous les liens déjà enregistrés dans les messages des patients.
 */
function getSecret() {
  const secret = process.env.MEDIA_LINK_SECRET;
  if (secret) return secret;
  // Une seule fois : sans ça, chaque exercice de chaque message journaliserait.
  if (!missingSecretLogged) {
    logger.error('MEDIA_LINK_SECRET absent : aucun lien de démo émis ni vérifié');
    missingSecretLogged = true;
  }
  return null;
}

function computeSignature(secret, { programmeId, exerciceModeleId, ext, exp }) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${LINK_VERSION}:${programmeId}:${exerciceModeleId}:${ext}:${exp}`)
    .digest('base64url');
}

/** Extension servie pour cet exercice : la vidéo prime sur le GIF legacy. */
function demoExtension(exerciceModele) {
  if (exerciceModele?.videoPath) return 'mp4';
  if (exerciceModele?.gifPath) return 'gif';
  return null;
}

/**
 * Lien relatif de la démo d'un exercice, ou null (pas de média, ids absents,
 * secret absent). Le chat choisit <video> ou <img> d'après l'extension.
 */
function buildDemoLink({ programmeId, exerciceModele, expiresAt }, now = Date.now()) {
  const ext = demoExtension(exerciceModele);
  if (!ext || !Number.isInteger(programmeId) || !Number.isInteger(exerciceModele?.id)) return null;

  const secret = getSecret();
  if (!secret) return null;

  // `|| 0` couvre aussi une date invalide (getTime() → NaN).
  const target = (expiresAt && new Date(expiresAt).getTime()) || 0;
  const exp = Math.floor(Math.max(target, now + MIN_VALIDITY_MS) / 1000);
  const sig = computeSignature(secret, { programmeId, exerciceModeleId: exerciceModele.id, ext, exp });

  return `/api/media/demo/${programmeId}/${exerciceModele.id}.${ext}?exp=${exp}&sig=${sig}`;
}

/**
 * Vérifie un lien reçu par la route. Les paramètres sont les chaînes reçues :
 * on signe ce qui a été reçu, donc toute altération de forme (`012` pour `12`)
 * fait échouer la signature.
 */
function verifyDemoLink(parts, now = Date.now()) {
  const secret = getSecret();
  if (!secret) return { ok: false, code: 'MEDIA_LINK_UNCONFIGURED' };

  const expected = Buffer.from(computeSignature(secret, parts));
  const given = Buffer.from(String(parts.sig));
  // timingSafeEqual lève si les longueurs diffèrent : on compare d'abord la taille.
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, code: 'MEDIA_LINK_INVALID' };
  }
  if (Number(parts.exp) * 1000 <= now) return { ok: false, code: 'MEDIA_LINK_EXPIRED' };
  return { ok: true };
}

module.exports = { buildDemoLink, verifyDemoLink };
