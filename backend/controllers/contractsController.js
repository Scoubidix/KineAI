const contractService = require('../services/contractService');
const contractPdfService = require('../services/contractPdfService');
const contractInviteService = require('../services/contractInviteService');
const contractOrdreService = require('../services/contractOrdreService');
const gcsStorageService = require('../services/gcsStorageService');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

// Helper : Firebase UID → DB kine.id
async function getKineId(uid) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid } });
  return kine ? kine.id : null;
}

function handleServiceError(err, res, defaultMsg) {
  const mapping = {
    [contractService.ERROR_CODES.NOT_FOUND]: 404,
    [contractService.ERROR_CODES.IMMUTABLE_STATUS]: 409,
    [contractService.ERROR_CODES.INVALID_DESTINATAIRE]: 400,
    [contractService.ERROR_CODES.CONTACT_NOT_FOUND]: 404,
    [contractService.ERROR_CODES.SIGNATURE_MISMATCH]: 400,
    [contractService.ERROR_CODES.ALREADY_SIGNED]: 409,
    [contractService.ERROR_CODES.KINE_NOT_FOUND]: 404,
    [contractInviteService.ERROR_CODES.NOT_FOUND]: 404,
    [contractInviteService.ERROR_CODES.IMMUTABLE_STATUS]: 409,
    [contractInviteService.ERROR_CODES.INVALID_CHANNEL]: 400,
    [contractInviteService.ERROR_CODES.TOKEN_USED]: 409,
    [contractInviteService.ERROR_CODES.EMAIL_SEND_FAILED]: 502,
    [contractOrdreService.ERROR_CODES.NOT_FOUND]: 404,
    [contractOrdreService.ERROR_CODES.IMMUTABLE_STATUS]: 409,
    [contractOrdreService.ERROR_CODES.PDF_NOT_READY]: 409,
    [contractOrdreService.ERROR_CODES.INVALID_EMAIL]: 400,
    [contractOrdreService.ERROR_CODES.EMAIL_SEND_FAILED]: 502,
  };
  const status = mapping[err.code];
  if (status) {
    return res.status(status).json({ success: false, error: err.message, code: err.code });
  }
  logger.error('Erreur contractsController:', err);
  return res.status(500).json({ success: false, error: defaultMsg, code: 'INTERNAL_ERROR' });
}

exports.createContract = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contract = await contractService.createContract({
      kineInitiateurId: kineId,
      payload: req.body,
    });
    res.status(201).json({ success: true, contract });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur création contrat');
  }
};

exports.getContract = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const contract = await contractService.getContractById(contractId, kineId);
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });
    }
    res.json({ success: true, contract });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur récupération contrat');
  }
};

exports.listContracts = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const { status, role } = req.query;
    const validStatuses = ['BROUILLON', 'SIGNE_INITIATEUR', 'ENVOYE', 'COMPLETE', 'ARCHIVE'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Statut invalide', code: 'INVALID_STATUS' });
    }
    if (role && !['INITIATEUR', 'DESTINATAIRE'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Rôle invalide', code: 'INVALID_ROLE' });
    }

    const contracts = await contractService.listContractsByKine(kineId, { status, role });
    res.json({ success: true, contracts });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur liste contrats');
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    const count = await contractService.getUnreadCount(kineId);
    res.json({ success: true, count });
  } catch (err) {
    logger.error('Erreur getUnreadCount:', err);
    res.status(500).json({ success: false, error: 'Erreur', code: 'INTERNAL_ERROR' });
  }
};

exports.getPendingOrdreCount = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    const count = await contractService.getPendingOrdreCount(kineId);
    res.json({ success: true, count });
  } catch (err) {
    logger.error('Erreur getPendingOrdreCount:', err);
    res.status(500).json({ success: false, error: 'Erreur', code: 'INTERNAL_ERROR' });
  }
};

exports.markViewed = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    await contractService.markContractsViewed(kineId);
    res.json({ success: true });
  } catch (err) {
    logger.error('Erreur markViewed:', err);
    res.status(500).json({ success: false, error: 'Erreur', code: 'INTERNAL_ERROR' });
  }
};

exports.updateContract = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const contract = await contractService.updateContract(contractId, kineId, req.body);
    res.json({ success: true, contract });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur modification contrat');
  }
};

exports.previewPdf = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: req.uid } });
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const contract = await prisma.contract.findFirst({
      where: { id: contractId, kineInitiateurId: kine.id }
    });
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });
    }

    // Preview côté initiateur : on n'expose JAMAIS les données privées du Kine destinataire
    // matché par email (RGPD — l'initiateur ne doit pas voir les infos perso de B).
    // Le pré-remplissage depuis le profil du destinataire se fera côté signature destinataire (étape 4).
    let pdfBuffer;
    try {
      pdfBuffer = await contractPdfService.generateContractPdf(contract, kine, null);
    } catch (err) {
      if (err.code === contractPdfService.ERROR_CODES.PUPPETEER_DISABLED) {
        return res.status(503).json({
          success: false,
          error: err.message,
          code: err.code,
        });
      }
      if (err.code === contractPdfService.ERROR_CODES.UNSUPPORTED_TYPE) {
        return res.status(400).json({ success: false, error: err.message, code: err.code });
      }
      if (err.code === contractPdfService.ERROR_CODES.RENDER_FAILED) {
        return res.status(500).json({ success: false, error: err.message, code: err.code });
      }
      throw err;
    }

    logger.info(`PDF preview généré : contrat ${sanitizeId(contractId)} (kiné ${sanitizeId(kine.id)})`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrat-${contractId}-preview.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error('Erreur preview PDF :', err);
    res.status(500).json({ success: false, error: 'Erreur preview PDF', code: 'INTERNAL_ERROR' });
  }
};

exports.sendInvitation = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });

    const { channel } = req.body;
    const result = await contractInviteService.sendInvitation({
      contractId,
      kineId,
      channel,
    });

    res.json({
      success: true,
      sentTo: result.sentTo,
      expiresAt: result.expiresAt,
      contract: { id: result.contract.id, status: result.contract.status, accessTokenSentAt: result.contract.accessTokenSentAt, accessTokenExpiresAt: result.contract.accessTokenExpiresAt }
    });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur envoi invitation');
  }
};

exports.revokeInvitation = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });

    await contractInviteService.revokeInvitation({ contractId, kineId });
    res.json({ success: true });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur révocation invitation');
  }
};

exports.signInitiator = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    const { contract } = await contractService.signInitiator({
      contractId,
      kineId,
      signatureText: req.body.signatureText,
      mention: req.body.mention,
      ip,
      userAgent,
    });

    res.json({ success: true, contract });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur signature initiateur');
  }
};

/**
 * GET /api/contracts/:id/final-pdf
 * Renvoie une signed URL GCS 7j pour le PDF final.
 * Accessible à l'initiateur ET au destinataire matché (kineDestinataireId).
 */
exports.getFinalPdfUrl = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });

    const prisma = prismaService.getInstance();
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        OR: [{ kineInitiateurId: kineId }, { kineDestinataireId: kineId }],
      },
      select: { status: true, pdfFinalUrl: true }
    });
    if (!contract) return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });
    if (contract.status !== 'COMPLETE' || !contract.pdfFinalUrl) {
      return res.status(409).json({ success: false, error: 'PDF final non encore disponible', code: 'PDF_NOT_READY' });
    }

    const url = await gcsStorageService.generateContractPdfSignedUrl(contract.pdfFinalUrl);
    if (!url) return res.status(500).json({ success: false, error: 'Erreur génération URL', code: 'SIGN_URL_FAILED' });
    res.json({ success: true, url });
  } catch (err) {
    logger.error('Erreur getFinalPdfUrl:', err);
    res.status(500).json({ success: false, error: 'Erreur accès PDF final', code: 'INTERNAL_ERROR' });
  }
};

/**
 * GET /api/contracts/recently-completed
 * Renvoie les contrats récemment signés (status=COMPLETE, completedAt > lastContractsViewedAt)
 * côté initiateur — utilisé par la modal de félicitation à l'ouverture de la page Contrats.
 */
exports.listRecentlyCompleted = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, lastContractsViewedAt: true }
    });
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const since = kine.lastContractsViewedAt || new Date(0);
    const contracts = await prisma.contract.findMany({
      where: {
        kineInitiateurId: kine.id,
        status: 'COMPLETE',
        completedAt: { gt: since },
      },
      select: {
        id: true,
        type: true,
        destinataireFirstName: true,
        destinataireLastName: true,
        destinataireEmail: true,
        completedAt: true,
        ordreSentAt: true,
      },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, contracts });
  } catch (err) {
    logger.error('Erreur listRecentlyCompleted:', err);
    res.status(500).json({ success: false, error: 'Erreur', code: 'INTERNAL_ERROR' });
  }
};

/**
 * GET /api/contracts/:id/ordre-email-preview
 * Renvoie l'aperçu du mail à envoyer au CDO (sans envoi).
 */
exports.getOrdreEmailPreview = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });

    const preview = await contractOrdreService.previewOrdreEmail({ contractId, kineId });
    res.json({ success: true, ...preview });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur aperçu mail Ordre');
  }
};

/**
 * POST /api/contracts/:id/send-to-ordre
 * Envoie le contrat signé au CDO via Brevo.
 */
exports.sendToOrdre = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });

    const { recipientEmail, ccEmail } = req.body;
    const result = await contractOrdreService.sendToOrdre({
      contractId,
      kineId,
      recipientEmail,
      ccEmail,
    });
    res.json({ success: true, sentTo: result.sentTo, contract: result.contract });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur envoi mail Ordre');
  }
};

exports.deleteContract = async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contractId = parseInt(req.params.id, 10);
    if (Number.isNaN(contractId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    await contractService.deleteContract(contractId, kineId);
    logger.info(`Contrat supprimé via API : ${sanitizeId(contractId)}`);
    res.json({ success: true, message: 'Contrat supprimé' });
  } catch (err) {
    return handleServiceError(err, res, 'Erreur suppression contrat');
  }
};
