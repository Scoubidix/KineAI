// middleware/requireLegalAcceptance.js
const prismaService = require('../services/prismaService');
const legalAcceptanceService = require('../services/legalAcceptanceService');
const logger = require('../utils/logger');
const { sanitizeUID } = require('../utils/logSanitizer');

/**
 * Middleware qui verifie que le kine a accepte les dernieres versions
 * de tous les documents legaux (CGU, Politique, DPA).
 * Si non → 451 avec la liste des documents a accepter.
 * Le frontend intercepte ce 451 pour afficher le modal de reacceptation.
 */
const requireLegalAcceptance = async (req, res, next) => {
  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return next();
    }

    const status = await legalAcceptanceService.getAcceptanceStatus(kine.id);
    const allUpToDate = Object.values(status).every(s => s.upToDate);

    if (allUpToDate) {
      return next();
    }

    // Construire la liste des documents a accepter
    const pendingDocuments = Object.entries(status)
      .filter(([, s]) => !s.upToDate)
      .map(([docType, s]) => ({
        documentType: docType,
        currentVersion: s.current,
        acceptedVersion: s.accepted
      }));

    logger.info(`Documents legaux non acceptes pour UID: ${sanitizeUID(req.uid)} - ${pendingDocuments.map(d => d.documentType).join(', ')}`);

    return res.status(451).json({
      success: false,
      error: 'Documents legaux non acceptes',
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      pendingDocuments
    });

  } catch (err) {
    logger.error('Erreur verification acceptations legales:', err.message);
    return next();
  }
};

module.exports = { requireLegalAcceptance };
