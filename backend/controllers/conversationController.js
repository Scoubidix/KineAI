// controllers/conversationController.js
// Endpoints du chat unifié : POST /chat (SSE) + CRUD conversations.
const prismaService = require('../services/prismaService');
const conversationService = require('../services/conversationService');
const chatUnifiedService = require('../services/chatUnifiedService');
const logger = require('../utils/logger');

// Couche 1 du budget input (spec §8)
const MESSAGE_MAX_CHARS = 15000;

/**
 * Récupère le kiné depuis le token Firebase. Répond et retourne null si introuvable.
 * Réutilise req.kine si un middleware amont (checkTokenQuota) l'a déjà chargé.
 */
const getKine = async (req, res) => {
  if (req.kine) return req.kine;
  if (!req.uid) {
    res.status(401).json({ success: false, error: 'Authentification échouée - UID manquant', code: 'UNAUTHORIZED' });
    return null;
  }
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid: req.uid } });
  if (!kine) {
    res.status(404).json({ success: false, error: 'Kiné non trouvé', code: 'KINE_NOT_FOUND' });
    return null;
  }
  return kine;
};

/**
 * POST /api/chat/kine/chat — endpoint unifié (SSE)
 * Body : { message, conversationId? }
 */
const sendChat = async (req, res) => {
  try {
    const kine = await getKine(req, res);
    if (!kine) return;

    const { message, conversationId } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: 'Message requis', code: 'MESSAGE_REQUIRED' });
    }
    if (message.length > MESSAGE_MAX_CHARS) {
      return res.status(400).json({
        success: false,
        error: `Message trop long (maximum ${MESSAGE_MAX_CHARS} caractères)`,
        code: 'MESSAGE_TOO_LONG'
      });
    }

    // Ownership vérifiée AVANT d'ouvrir le SSE → vrai 404 HTTP
    if (conversationId) {
      const owned = await conversationService.findOwnedConversation(kine.id, Number(conversationId));
      if (!owned) {
        return res.status(404).json({ success: false, error: 'Conversation non trouvée', code: 'NOT_FOUND' });
      }
    }

    // Ouverture du flux SSE (mêmes headers que les streams existants)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const onEvent = (eventName, payload) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await chatUnifiedService.sendMessageStream({
        kineId: kine.id,
        conversationId: conversationId ? Number(conversationId) : undefined,
        message: message.trim(),
        onEvent
      });

      onEvent('done', result);
    } catch (error) {
      logger.error('❌ Erreur chat unifié (stream):', error.message);
      onEvent('error', { error: 'Erreur lors de la génération de la réponse' });
    } finally {
      res.end();
    }
  } catch (error) {
    logger.error('❌ Erreur sendChat:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Erreur serveur', code: 'INTERNAL_ERROR' });
    } else {
      res.end();
    }
  }
};

/**
 * GET /api/chat/kine/conversations
 */
const listConversations = async (req, res) => {
  try {
    const kine = await getKine(req, res);
    if (!kine) return;

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;

    const conversations = await conversationService.listConversations(kine.id, { limit, cursor });
    res.json({ success: true, conversations });
  } catch (error) {
    logger.error('❌ Erreur listConversations:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur', code: 'INTERNAL_ERROR' });
  }
};

/**
 * GET /api/chat/kine/conversations/:id
 */
const getConversation = async (req, res) => {
  try {
    const kine = await getKine(req, res);
    if (!kine) return;

    const conversation = await conversationService.getConversationWithMessages(kine.id, Number(req.params.id));
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation non trouvée', code: 'NOT_FOUND' });
    }

    res.json({ success: true, conversation });
  } catch (error) {
    logger.error('❌ Erreur getConversation:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur', code: 'INTERNAL_ERROR' });
  }
};

/**
 * PATCH /api/chat/kine/conversations/:id — renommage
 */
const renameConversation = async (req, res) => {
  try {
    const kine = await getKine(req, res);
    if (!kine) return;

    const { title } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ success: false, error: 'Titre requis', code: 'TITLE_REQUIRED' });
    }

    const conversation = await conversationService.renameConversation(kine.id, Number(req.params.id), title);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation non trouvée', code: 'NOT_FOUND' });
    }

    res.json({ success: true, conversation: { id: conversation.id, title: conversation.title } });
  } catch (error) {
    logger.error('❌ Erreur renameConversation:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur', code: 'INTERNAL_ERROR' });
  }
};

/**
 * DELETE /api/chat/kine/conversations/:id — soft delete
 */
const deleteConversation = async (req, res) => {
  try {
    const kine = await getKine(req, res);
    if (!kine) return;

    const deleted = await conversationService.softDeleteConversation(kine.id, Number(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Conversation non trouvée', code: 'NOT_FOUND' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Erreur deleteConversation:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur', code: 'INTERNAL_ERROR' });
  }
};

/**
 * GET /api/chat/kine/usage — consommation tokens du jour pour la jauge UI
 */
const getUsage = async (req, res) => {
  try {
    const kine = await getKine(req, res);
    if (!kine) return;

    const tokenUsageService = require('../services/tokenUsageService');
    const { getQuotaForPlan } = require('../config/tokenQuotas');

    const planType = kine.planType || 'FREE';
    const limit = getQuotaForPlan(planType);
    const tokensUsed = await tokenUsageService.getDailyUsage(kine.id);

    res.json({
      success: true,
      usage: {
        date: tokenUsageService.getParisDate().toISOString().substring(0, 10),
        tokensUsed,
        limit,
        remaining: Math.max(0, limit - tokensUsed),
        planType
      }
    });
  } catch (error) {
    logger.error('❌ Erreur getUsage:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur', code: 'INTERNAL_ERROR' });
  }
};

module.exports = {
  sendChat,
  listConversations,
  getConversation,
  renameConversation,
  deleteConversation,
  getUsage,
  MESSAGE_MAX_CHARS
};
