// controllers/mediaController.js — Redirection des démos d'exercices du chat patient
//
// Le message stocke un lien signé par notre backend (services/mediaLinkService.js).
// On le vérifie, on applique les mêmes règles d'accès que le chat
// (middleware/patientAuth.js), puis on redirige vers une URL de stockage v4 courte :
// le navigateur télécharge directement depuis le stockage, rien ne transite ici.
// Spec : docs/superpowers/specs/2026-10-02-lien-media-demo-design.md
const prismaService = require('../services/prismaService');
const gcsStorageService = require('../services/gcsStorageService');
const { verifyDemoLink } = require('../services/mediaLinkService');
const logger = require('../utils/logger');

const FILE_PATTERN = /^(\d+)\.(mp4|gif)$/;
const DIGITS = /^\d+$/;

const LINK_ERRORS = {
  MEDIA_LINK_UNCONFIGURED: { status: 503, error: 'Démonstrations momentanément indisponibles' },
  MEDIA_LINK_INVALID: { status: 403, error: 'Lien de démonstration invalide' },
  MEDIA_LINK_EXPIRED: { status: 410, error: 'Lien de démonstration expiré' },
};

function sendError(res, status, code, error) {
  return res.status(status).json({ success: false, error, code });
}

exports.redirectDemo = async (req, res) => {
  const { programmeId, file } = req.params;
  const { exp, sig } = req.query;
  const match = FILE_PATTERN.exec(file);

  // `typeof … === 'string'` écarte aussi les paramètres en double, qu'Express 5 rend en tableau.
  if (!DIGITS.test(programmeId) || !match || typeof exp !== 'string' || !DIGITS.test(exp) || typeof sig !== 'string') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Lien de démonstration mal formé');
  }
  const [, exerciceModeleId, ext] = match;

  const check = verifyDemoLink({ programmeId, exerciceModeleId, ext, exp, sig });
  if (!check.ok) {
    if (check.code === 'MEDIA_LINK_INVALID') {
      logger.warn(`Lien de démo à signature invalide (programme ${programmeId}, exercice ${exerciceModeleId})`);
    }
    const { status, error } = LINK_ERRORS[check.code];
    return sendError(res, status, check.code, error);
  }

  try {
    const prisma = prismaService.getInstance();
    const programme = await prisma.programme.findUnique({
      where: { id: Number(programmeId) },
      select: { isActive: true, isArchived: true, patient: { select: { isActive: true } } },
    });
    if (!programme || !programme.isActive || programme.isArchived || !programme.patient?.isActive) {
      return sendError(res, 410, 'PROGRAMME_UNAVAILABLE', 'Programme indisponible');
    }

    const exercice = await prisma.exerciceModele.findUnique({
      where: { id: Number(exerciceModeleId) },
      select: { videoPath: true, gifPath: true },
    });
    const mediaPath = ext === 'mp4' ? exercice?.videoPath : exercice?.gifPath;
    const url = mediaPath ? await gcsStorageService.signDemoMedia(mediaPath) : null;
    if (!url) {
      return sendError(res, 404, 'MEDIA_NOT_FOUND', 'Démonstration introuvable');
    }

    // no-store : la révocation (programme supprimé/archivé) vaut dès la requête suivante.
    // CORP : Helmet pose `same-origin` par défaut, ce qui ferait bloquer par le
    // navigateur le <img>/<video> du chat, servi depuis le domaine du front.
    res.set('Cache-Control', 'no-store');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.redirect(302, url);
  } catch (error) {
    logger.error(`Erreur redirection démo (programme ${programmeId}, exercice ${exerciceModeleId}):`, error);
    return sendError(res, 500, 'MEDIA_REDIRECT_ERROR', 'Erreur lors de l\'accès à la démonstration');
  }
};
