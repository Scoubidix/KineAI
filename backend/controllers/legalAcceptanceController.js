// controllers/legalAcceptanceController.js
const legalAcceptanceService = require('../services/legalAcceptanceService');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeUID } = require('../utils/logSanitizer');

/**
 * POST /api/legal-acceptances
 * Enregistrer une ou plusieurs acceptations de documents legaux
 * Body: { acceptances: [{ documentType: "CGU", version: "3.0" }, ...] }
 */
const recordAcceptances = async (req, res) => {
  const uid = req.uid;
  const { acceptances } = req.body;

  if (!acceptances || !Array.isArray(acceptances) || acceptances.length === 0) {
    return res.status(400).json({ success: false, error: 'Le champ acceptances est requis (tableau non vide).', code: 'INVALID_INPUT' });
  }

  // Validation des entrees
  for (const a of acceptances) {
    if (!a.documentType || !a.version) {
      return res.status(400).json({ success: false, error: 'Chaque acceptation doit avoir documentType et version.', code: 'INVALID_INPUT' });
    }
  }

  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
    if (!kine) {
      return res.status(404).json({ success: false, error: 'Kine non trouve.', code: 'NOT_FOUND' });
    }

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
                  || req.headers['x-real-ip']
                  || req.connection?.remoteAddress
                  || 'unknown';

    const result = await legalAcceptanceService.recordMultipleAcceptances(kine.id, acceptances, clientIp);

    logger.info(`Acceptations legales enregistrees pour UID: ${sanitizeUID(uid)}`);
    return res.status(201).json({ success: true, count: result.count });
  } catch (err) {
    logger.error('Erreur enregistrement acceptations:', err.message);
    if (err.message.includes('Type de document invalide')) {
      return res.status(400).json({ success: false, error: err.message, code: 'INVALID_DOCUMENT_TYPE' });
    }
    return res.status(500).json({ success: false, error: 'Erreur serveur.', code: 'SERVER_ERROR' });
  }
};

/**
 * GET /api/legal-acceptances/status
 * Verifier si le kine est a jour sur tous les documents legaux
 */
const getStatus = async (req, res) => {
  const uid = req.uid;

  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
    if (!kine) {
      return res.status(404).json({ success: false, error: 'Kine non trouve.', code: 'NOT_FOUND' });
    }

    const status = await legalAcceptanceService.getAcceptanceStatus(kine.id);
    const allUpToDate = Object.values(status).every(s => s.upToDate);

    return res.status(200).json({ success: true, allUpToDate, documents: status });
  } catch (err) {
    logger.error('Erreur verification statut legal:', err.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur.', code: 'SERVER_ERROR' });
  }
};

/**
 * GET /api/legal-acceptances/history
 * Historique complet des acceptations (audit RGPD)
 */
const getHistory = async (req, res) => {
  const uid = req.uid;

  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
    if (!kine) {
      return res.status(404).json({ success: false, error: 'Kine non trouve.', code: 'NOT_FOUND' });
    }

    const history = await legalAcceptanceService.getAcceptanceHistory(kine.id);

    return res.status(200).json({ success: true, acceptances: history });
  } catch (err) {
    logger.error('Erreur recuperation historique legal:', err.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur.', code: 'SERVER_ERROR' });
  }
};

module.exports = {
  recordAcceptances,
  getStatus,
  getHistory
};
