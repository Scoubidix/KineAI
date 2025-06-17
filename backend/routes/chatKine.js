const express = require('express');
const router = express.Router();
const chatKineController = require('../controllers/chatKineController');
const authMiddleware = require('../middleware/authenticate');

// Si votre middleware exporte un objet, extraire la fonction
const authenticate = authMiddleware.authenticate || authMiddleware;

// Vérification de sécurité
if (typeof authenticate !== 'function') {
  console.error('❌ ERREUR: authenticate n\'est pas une fonction');
  console.log('Type:', typeof authenticate);
  console.log('Contenu:', authenticate);
  throw new Error('Middleware authenticate invalide');
}

console.log('✅ Middleware authenticate est une fonction');

// ========== ROUTES EXISTANTES (conservées) ==========
router.post('/message', authenticate, chatKineController.sendMessage);
router.get('/history', authenticate, chatKineController.getHistory);
router.delete('/history', authenticate, chatKineController.clearHistory);

// ========== ROUTE MANQUANTE : GET /api/chat/kine?days=X ==========
router.get('/', authenticate, chatKineController.getHistory);

// ========== NOUVELLES ROUTES VECTORIELLES ==========

/**
 * POST /api/chat/kine/message-enhanced
 * Chat avec recherche vectorielle intégrée
 */
router.post('/message-enhanced', authenticate, chatKineController.sendMessageEnhanced);

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

    console.log('🔍 Recherche documents pour kiné:', firebaseUid);

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
    console.error('❌ Erreur recherche documents:', error);
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
    console.error('❌ Erreur vector status:', error);
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
 * GET /api/chat/kine/enhanced-test
 * Test du système enhanced pour ce kiné authentifié
 */
router.get('/enhanced-test', authenticate, async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    // Test recherche
    const { searchDocuments } = require('../services/embeddingService');
    const testSearch = await searchDocuments('test kinésithérapie', {
      matchCount: 1,
      matchThreshold: 0.1
    });

    res.json({
      success: true,
      message: 'Chat Kiné Enhanced opérationnel',
      user: {
        authenticated: true,
        firebaseUid: firebaseUid
      },
      vectorDatabase: {
        connected: true,
        documentsAvailable: testSearch.length,
        lastSearch: testSearch[0] || null
      },
      services: {
        authentication: '✅ Fonctionnel',
        vectorSearch: '✅ Fonctionnel',
        openai: !!process.env.OPENAI_API_KEY ? '✅ Configuré' : '❌ Manquant'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur enhanced test:', error);
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

module.exports = router;