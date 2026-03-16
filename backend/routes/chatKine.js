const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const chatKineController = require('../controllers/chatKineController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin, requireAssistant, requireAssistantOrPreview } = require('../middleware/authorization');

// ========== NOUVELLES ROUTES IA SPÉCIALISÉES ==========

/**
 * Middleware dynamique pour ia-followup : vérifie l'accès selon sourceIa
 * sourceIa 'biblio' → plan BIBLIOTHEQUE requis
 * sourceIa 'clinique' → plan CLINIQUE requis
 */
const requireFollowupAssistantOrPreview = (req, res, next) => {
  const sourceIaMap = {
    'biblio': 'BIBLIOTHEQUE',
    'clinique': 'CLINIQUE'
  };
  const assistantType = sourceIaMap[req.body.sourceIa];
  if (!assistantType) {
    return res.status(400).json({ error: 'sourceIa requis (biblio ou clinique)' });
  }
  return requireAssistantOrPreview(assistantType)(req, res, next);
};

/**
 * POST /api/chat/kine/ia-basique
 * IA conversationnelle basique avec recherche vectorielle
 */
router.post('/ia-basique', authenticate, requireAssistantOrPreview('CONVERSATIONNEL'), chatKineController.sendIaBasique);

/**
 * POST /api/chat/kine/ia-basique-stream
 * IA conversationnelle basique en streaming SSE
 */
router.post('/ia-basique-stream', authenticate, requireAssistantOrPreview('CONVERSATIONNEL'), chatKineController.sendIaBasiqueStream);

/**
 * POST /api/chat/kine/ia-biblio
 * IA bibliographique spécialisée
 */
router.post('/ia-biblio', authenticate, requireAssistantOrPreview('BIBLIOTHEQUE'), chatKineController.sendIaBiblio);

/**
 * POST /api/chat/kine/ia-biblio-stream
 * IA bibliographique en streaming SSE
 */
router.post('/ia-biblio-stream', authenticate, requireAssistantOrPreview('BIBLIOTHEQUE'), chatKineController.sendIaBiblioStream);

/**
 * POST /api/chat/kine/ia-clinique
 * IA clinique spécialisée
 */
router.post('/ia-clinique', authenticate, requireAssistantOrPreview('CLINIQUE'), chatKineController.sendIaClinique);

/**
 * POST /api/chat/kine/ia-clinique-stream
 * IA clinique en streaming SSE
 */
router.post('/ia-clinique-stream', authenticate, requireAssistantOrPreview('CLINIQUE'), chatKineController.sendIaCliniqueStream);

/**
 * POST /api/chat/kine/ia-administrative
 * IA administrative spécialisée (bilan kiné)
 */
router.post('/ia-administrative', authenticate, requireAssistantOrPreview('ADMINISTRATIF'), chatKineController.sendIaAdministrative);

/**
 * POST /api/chat/kine/ia-followup
 * IA de suivi avec RAG conditionnel (shouldUseRAG décide) - sauvegarde dans la table source
 * Body: { message, conversationHistory, sourceIa: 'biblio' | 'clinique' }
 */
router.post('/ia-followup', authenticate, requireFollowupAssistantOrPreview, chatKineController.sendIaFollowup);

/**
 * POST /api/chat/kine/ia-followup-stream
 * IA de suivi en streaming SSE
 */
router.post('/ia-followup-stream', authenticate, requireFollowupAssistantOrPreview, chatKineController.sendIaFollowupStream);

// ========== ROUTES HISTORIQUE SPÉCIALISÉES ==========

/**
 * GET /api/chat/kine/history-basique?days=X
 * Historique IA Basique
 */
router.get('/history-basique', authenticate, chatKineController.getHistoryBasique);

/**
 * GET /api/chat/kine/history-biblio?days=X
 * Historique IA Bibliographique
 */
router.get('/history-biblio', authenticate, chatKineController.getHistoryBiblio);

/**
 * GET /api/chat/kine/history-clinique?days=X
 * Historique IA Clinique
 */
router.get('/history-clinique', authenticate, chatKineController.getHistoryClinique);

/**
 * GET /api/chat/kine/history-administrative?days=X
 * Historique IA Administrative
 */
router.get('/history-administrative', authenticate, chatKineController.getHistoryAdministrative);

// ========== ROUTES SUPPRESSION HISTORIQUE ==========

/**
 * DELETE /api/chat/kine/history-basique
 * Supprimer historique IA Basique
 */
router.delete('/history-basique', authenticate, chatKineController.clearHistoryBasique);

/**
 * DELETE /api/chat/kine/history-biblio
 * Supprimer historique IA Bibliographique
 */
router.delete('/history-biblio', authenticate, chatKineController.clearHistoryBiblio);

/**
 * DELETE /api/chat/kine/history-clinique
 * Supprimer historique IA Clinique
 */
router.delete('/history-clinique', authenticate, chatKineController.clearHistoryClinique);

/**
 * DELETE /api/chat/kine/history-administrative
 * Supprimer historique IA Administrative
 */
router.delete('/history-administrative', authenticate, chatKineController.clearHistoryAdministrative);

/**
 * GET /api/chat/kine/all-history?days=X
 * Récupérer l'historique de toutes les IA pour ce kiné
 */
router.get('/all-history', authenticate, async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    const prismaService = require('../services/prismaService');
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({
        success: false,
        error: 'Kiné non trouvé'
      });
    }

    const days = parseInt(req.query.days) || 5;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    // Récupérer l'historique de toutes les IA
    const [historyBasique, historyBiblio, historyClinique, historyAdmin] = await Promise.all([
      prisma.chatIaBasique.findMany({
        where: { kineId: kine.id, createdAt: { gte: daysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.chatIaBiblio.findMany({
        where: { kineId: kine.id, createdAt: { gte: daysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.chatIaClinique.findMany({
        where: { kineId: kine.id, createdAt: { gte: daysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.chatIaAdministrative.findMany({
        where: { kineId: kine.id, createdAt: { gte: daysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    // Combiner et trier par date
    const allHistory = [
      ...historyBasique.map(h => ({ ...h, iaType: 'basique' })),
      ...historyBiblio.map(h => ({ ...h, iaType: 'bibliographique' })),
      ...historyClinique.map(h => ({ ...h, iaType: 'clinique' })),
      ...historyAdmin.map(h => ({ ...h, iaType: 'administrative' }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      history: allHistory.slice(0, 50), // Limiter à 50 entrées
      stats: {
        totalConversations: allHistory.length,
        basique: historyBasique.length,
        bibliographique: historyBiblio.length,
        clinique: historyClinique.length,
        administrative: historyAdmin.length
      },
      period: `${days} derniers jours`,
      kineId: kine.id
    });

  } catch (error) {
    logger.error('❌ Erreur all-history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/chat/kine/all-history
 * Supprimer l'historique de toutes les IA pour ce kiné
 */
router.delete('/all-history', authenticate, async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    const prismaService = require('../services/prismaService');
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({
        success: false,
        error: 'Kiné non trouvé'
      });
    }

    // Supprimer tous les historiques
    const [deletedBasique, deletedBiblio, deletedClinique, deletedAdmin] = await Promise.all([
      prisma.chatIaBasique.deleteMany({ where: { kineId: kine.id } }),
      prisma.chatIaBiblio.deleteMany({ where: { kineId: kine.id } }),
      prisma.chatIaClinique.deleteMany({ where: { kineId: kine.id } }),
      prisma.chatIaAdministrative.deleteMany({ where: { kineId: kine.id } })
    ]);

    const totalDeleted = deletedBasique.count + deletedBiblio.count + 
                        deletedClinique.count + deletedAdmin.count;

    res.json({
      success: true,
      message: 'Tous les historiques IA supprimés',
      deleted: {
        total: totalDeleted,
        basique: deletedBasique.count,
        bibliographique: deletedBiblio.count,
        clinique: deletedClinique.count,
        administrative: deletedAdmin.count
      },
      kineId: kine.id
    });

  } catch (error) {
    logger.error('❌ Erreur delete all-history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;