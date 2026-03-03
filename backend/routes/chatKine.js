const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const chatKineController = require('../controllers/chatKineController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin, requireAssistant } = require('../middleware/authorization');

// ========== NOUVELLES ROUTES IA SPÉCIALISÉES ==========

/**
 * Middleware dynamique pour ia-followup : vérifie l'accès selon sourceIa
 * sourceIa 'biblio' → plan BIBLIOTHEQUE requis
 * sourceIa 'clinique' → plan CLINIQUE requis
 */
const requireFollowupAssistant = (req, res, next) => {
  const sourceIaMap = {
    'biblio': 'BIBLIOTHEQUE',
    'clinique': 'CLINIQUE'
  };
  const assistantType = sourceIaMap[req.body.sourceIa];
  if (!assistantType) {
    return res.status(400).json({ error: 'sourceIa requis (biblio ou clinique)' });
  }
  return requireAssistant(assistantType)(req, res, next);
};

/**
 * POST /api/chat/kine/ia-basique
 * IA conversationnelle basique avec recherche vectorielle
 */
router.post('/ia-basique', authenticate, requireAssistant('CONVERSATIONNEL'), chatKineController.sendIaBasique);

/**
 * POST /api/chat/kine/ia-basique-stream
 * IA conversationnelle basique en streaming SSE
 */
router.post('/ia-basique-stream', authenticate, requireAssistant('CONVERSATIONNEL'), chatKineController.sendIaBasiqueStream);

/**
 * POST /api/chat/kine/ia-biblio
 * IA bibliographique spécialisée
 */
router.post('/ia-biblio', authenticate, requireAssistant('BIBLIOTHEQUE'), chatKineController.sendIaBiblio);

/**
 * POST /api/chat/kine/ia-biblio-stream
 * IA bibliographique en streaming SSE
 */
router.post('/ia-biblio-stream', authenticate, requireAssistant('BIBLIOTHEQUE'), chatKineController.sendIaBiblioStream);

/**
 * POST /api/chat/kine/ia-clinique
 * IA clinique spécialisée
 */
router.post('/ia-clinique', authenticate, requireAssistant('CLINIQUE'), chatKineController.sendIaClinique);

/**
 * POST /api/chat/kine/ia-clinique-stream
 * IA clinique en streaming SSE
 */
router.post('/ia-clinique-stream', authenticate, requireAssistant('CLINIQUE'), chatKineController.sendIaCliniqueStream);

/**
 * POST /api/chat/kine/ia-administrative
 * IA administrative spécialisée
 */
router.post('/ia-administrative', authenticate, requireAssistant('ADMINISTRATIF'), chatKineController.sendIaAdministrative);

/**
 * POST /api/chat/kine/ia-followup
 * IA de suivi avec RAG conditionnel (shouldUseRAG décide) - sauvegarde dans la table source
 * Body: { message, conversationHistory, sourceIa: 'biblio' | 'clinique' }
 */
router.post('/ia-followup', authenticate, requireFollowupAssistant, chatKineController.sendIaFollowup);

/**
 * POST /api/chat/kine/ia-followup-stream
 * IA de suivi en streaming SSE
 */
router.post('/ia-followup-stream', authenticate, requireFollowupAssistant, chatKineController.sendIaFollowupStream);

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

// ========== ROUTES UTILITAIRES (conservées) ==========

/**
 * POST /api/chat/kine/search-documents
 * Recherche manuelle dans les documents (pour l'interface kiné)
 */
router.post('/search-documents', authenticate, async (req, res) => {
  try {
    const { query, category, threshold = 0.7, limit = 5 } = req.body;
    const firebaseUid = req.uid;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query de recherche requise'
      });
    }

    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    logger.debug('🔍 Recherche documents pour kiné:', firebaseUid);

    const { searchDocuments } = require('../services/embeddingService');
    
    const results = await searchDocuments(query, {
      matchThreshold: threshold,
      matchCount: limit,
      filterCategory: category
    });

    res.json({
      success: true,
      query,
      results: results.map(r => ({
        id: r.id,
        title: r.title,
        category: r.category,
        similarity: Math.round(r.similarity * 100) + '%',
        preview: r.content.substring(0, 200) + '...',
        metadata: r.metadata
      })),
      count: results.length,
      kineUid: firebaseUid
    });

  } catch (error) {
    logger.error('❌ Erreur recherche documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chat/kine/vector-status
 * Statut de la base vectorielle pour ce kiné
 */
router.get('/vector-status', authenticate, async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    const { supabase } = require('../services/supabaseClient');
    
    // Compter les documents disponibles
    const { count, error } = await supabase
      .from('documents_kine')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;

    // Compter par catégorie
    const { data: categories } = await supabase
      .from('documents_kine')
      .select('category');
    
    const uniqueCategories = [...new Set(categories?.map(c => c.category) || [])];

    res.json({
      success: true,
      vectorDatabase: {
        connected: true,
        totalDocuments: count || 0,
        categories: uniqueCategories.length,
        categoriesList: uniqueCategories,
        available: count > 0
      },
      user: {
        firebaseUid: firebaseUid,
        canUseVector: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur vector status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      vectorDatabase: {
        connected: false,
        error: error.message
      }
    });
  }
});

/**
 * GET /api/chat/kine/ia-status
 * Statut des 4 IA - ADMIN UNIQUEMENT (infos techniques sensibles)
 */
router.get('/ia-status', authenticate, requireAdmin, async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    // Test recherche vectorielle
    const { searchDocuments } = require('../services/embeddingService');
    const testSearch = await searchDocuments('test kinésithérapie', {
      matchCount: 1,
      matchThreshold: 0.1
    });

    res.json({
      success: true,
      message: 'Système IA Multiple opérationnel',
      user: {
        authenticated: true,
        firebaseUid: firebaseUid
      },
      iaServices: {
        basique: {
          available: true,
          endpoint: '/api/chat/kine/ia-basique',
          description: 'IA conversationnelle générale'
        },
        bibliographique: {
          available: true,
          endpoint: '/api/chat/kine/ia-biblio',
          description: 'IA spécialisée références scientifiques'
        },
        clinique: {
          available: true,
          endpoint: '/api/chat/kine/ia-clinique',
          description: 'IA spécialisée aide clinique'
        },
        administrative: {
          available: true,
          endpoint: '/api/chat/kine/ia-administrative',
          description: 'IA spécialisée gestion administrative'
        }
      },
      vectorDatabase: {
        connected: true,
        documentsAvailable: testSearch.length,
        lastSearch: testSearch[0] || null
      },
      services: {
        authentication: '✅ Fonctionnel',
        vectorSearch: '✅ Fonctionnel',
        aiService: '✅ Service configuré',
        multipleIA: '✅ 4 IA Disponibles'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur ia status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      user: {
        authenticated: true,
        firebaseUid: req.uid
      },
      timestamp: new Date().toISOString()
    });
  }
});

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