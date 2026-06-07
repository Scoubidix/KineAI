// controllers/chatKineController.js
// IA Administrative (bilan kiné) uniquement. Les 3 IAs de chat (basique/biblio/clinique)
// et le followup ont été remplacés par le chat unifié (conversationController + chatUnifiedService).
const prismaService = require('../services/prismaService');
const { generateKineResponse } = require('../services/openaiService');
const logger = require('../utils/logger');

// Limite de caractères pour le mode preview (aperçu tronqué)
const PREVIEW_CHAR_LIMITS = {
  admin: 250
};

// ========== HANDLER ==========
const handleKineRequest = async (req, res, iaType) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const firebaseUid = req.uid;
    const isPreview = req.isPreview === true;

    // 1. Validation de l'authentification
    if (!firebaseUid) {
      return res.status(401).json({
        error: 'Authentification échouée - UID manquant'
      });
    }

    // 2. Récupération du kiné
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        error: 'Kiné non trouvé'
      });
    }

    // 3. Validation du message
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message requis' });
    }

    // 4. Appel du service
    const response = await generateKineResponse(iaType, message, conversationHistory, kine.id, { skipSave: isPreview });

    // 5. Ajout du firebaseUid dans les métadonnées
    response.metadata.firebaseUid = firebaseUid;

    // 6. Tronquer si mode preview
    if (isPreview) {
      const charLimit = PREVIEW_CHAR_LIMITS[iaType] || 250;
      response.message = response.message.substring(0, charLimit);
      response.preview = true;
    }

    res.json(response);

  } catch (error) {
    logger.error(`❌ Erreur handleKineRequest (${iaType}):`, error);

    const errorResponse = error.success === false ? error : {
      success: false,
      error: `Erreur lors de la génération de la réponse IA ${iaType}`,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(errorResponse);
  }
};

// ========== IA ADMINISTRATIVE (BILAN) ==========
const sendIaAdministrative = async (req, res) => {
  await handleKineRequest(req, res, 'admin');
};

// ========== HISTORIQUE ==========
const getHistoryAdministrative = async (req, res) => {
  try {
    const firebaseUid = req.uid;

    if (!firebaseUid) {
      return res.status(401).json({
        error: 'Authentification échouée - UID manquant'
      });
    }

    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        error: 'Kiné non trouvé'
      });
    }

    const days = Math.min(parseInt(req.query.days) || 5, 90);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const history = await prisma.chatIaAdministrative.findMany({
      where: {
        kineId: kine.id,
        createdAt: { gte: daysAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({
      success: true,
      iaType: 'administrative',
      history: history
    });
  } catch (error) {
    logger.error('Erreur getHistoryAdministrative:', error.message);
    res.status(500).json({
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const clearHistoryAdministrative = async (req, res) => {
  try {
    const firebaseUid = req.uid;

    if (!firebaseUid) {
      return res.status(401).json({
        error: 'Authentification échouée - UID manquant'
      });
    }

    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        error: 'Kiné non trouvé'
      });
    }

    await prisma.chatIaAdministrative.deleteMany({
      where: { kineId: kine.id }
    });

    res.json({
      success: true,
      iaType: 'administrative',
      message: 'Historique IA Administrative supprimé'
    });
  } catch (error) {
    logger.error('Erreur clearHistoryAdministrative:', error.message);
    res.status(500).json({
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ========== EXPORTS ==========
module.exports = {
  sendIaAdministrative,
  getHistoryAdministrative,
  clearHistoryAdministrative
};
