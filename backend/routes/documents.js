// routes/documents.js - VERSION NETTOYÉE
const logger = require('../utils/logger');
// Les fonctions d'upload et traitement PDF sont maintenant gérées par n8n
const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const { 
  searchDocuments, 
  searchDocumentsOptimized,
  getDocumentStats,
  deleteDocument,
  listDocuments,
  testVectorDatabase,
  cleanupDuplicates
} = require('../services/embeddingService');

const router = express.Router();

// Protection globale : toutes les routes nécessitent une authentification
router.use(authenticate);

// ==========================================
// 🔍 ROUTES DE RECHERCHE SÉMANTIQUE
// ==========================================

/**
 * POST /api/documents/search
 * Recherche sémantique dans les documents
 */
router.post('/search', async (req, res) => {
  try {
    const { query, category, threshold = 0.7, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query de recherche requise'
      });
    }

    logger.debug('🔍 Recherche:', query, 'Catégorie:', category);

    const results = await searchDocuments(query, {
      matchThreshold: threshold,
      matchCount: limit,
      filterCategory: category
    });

    res.json({
      success: true,
      query,
      results,
      count: results.length,
      threshold,
      category: category || 'toutes'
    });

  } catch (error) {
    logger.error('❌ Erreur recherche:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/documents/search/optimized
 * Recherche sémantique optimisée avec seuils adaptatifs
 */
router.post('/search/optimized', async (req, res) => {
  try {
    const { query, category } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query de recherche requise'
      });
    }

    logger.debug('🔍 Recherche optimisée:', query);

    const results = await searchDocumentsOptimized(query, {
      filterCategory: category
    });

    res.json({
      success: true,
      query,
      results,
      count: results.length,
      searchType: 'optimized',
      category: category || 'toutes'
    });

  } catch (error) {
    logger.error('❌ Erreur recherche optimisée:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// 📋 ROUTES DE GESTION DES DOCUMENTS
// ==========================================

/**
 * GET /api/documents
 * Lister les documents avec options de filtrage
 */
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      limit = 50, 
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc'
    } = req.query;
    
    logger.debug('📋 Liste documents:', { category, limit, offset });

    const documents = await listDocuments({
      category,
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      documents,
      count: documents.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    logger.error('❌ Erreur liste documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/documents/categories
 * Lister les catégories disponibles
 */
router.get('/categories', async (req, res) => {
  try {
    const { supabase } = require('../services/supabaseClient');
    
    const { data, error } = await supabase
      .from('documents_kine')
      .select('category')
      .not('category', 'is', null);
    
    if (error) throw error;

    // Extraire les catégories uniques
    const categories = [...new Set(data.map(item => item.category))].sort();

    res.json({
      success: true,
      categories,
      count: categories.length
    });

  } catch (error) {
    logger.error('❌ Erreur catégories:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Supprimer un document spécifique (ADMIN UNIQUEMENT)
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID du document requis'
      });
    }

    logger.debug('🗑️ Suppression document ID:', id);
    
    const deletedDocument = await deleteDocument(id);

    res.json({
      success: true,
      message: 'Document supprimé avec succès',
      deleted: {
        id: deletedDocument.id,
        title: deletedDocument.title,
        category: deletedDocument.category
      }
    });

  } catch (error) {
    logger.error('❌ Erreur suppression:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Document non trouvé'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// 📊 ROUTES DE STATISTIQUES ET MONITORING
// ==========================================

/**
 * GET /api/documents/stats
 * Statistiques complètes de la base documentaire (ADMIN UNIQUEMENT)
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    logger.debug('📊 Récupération des statistiques...');
    
    const stats = await getDocumentStats();

    res.json({
      success: true,
      stats,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/documents/health
 * Test de santé de la base vectorielle (ADMIN UNIQUEMENT)
 */
router.get('/health', requireAdmin, async (req, res) => {
  try {
    logger.debug('🔧 Test de santé de la base vectorielle...');
    
    const healthCheck = await testVectorDatabase();

    const statusCode = healthCheck.status === 'success' ? 200 : 500;

    res.status(statusCode).json({
      success: healthCheck.status === 'success',
      health: healthCheck,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur test santé:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      checkedAt: new Date().toISOString()
    });
  }
});

// ==========================================
// 🧹 ROUTES DE MAINTENANCE
// ==========================================

/**
 * POST /api/documents/cleanup
 * Nettoyage des doublons (maintenance - ADMIN UNIQUEMENT)
 */
router.post('/cleanup', requireAdmin, async (req, res) => {
  try {
    logger.debug('🧹 Démarrage du nettoyage des doublons...');
    
    const cleanupResult = await cleanupDuplicates();

    res.json({
      success: true,
      message: `Nettoyage terminé: ${cleanupResult.deletedCount} doublons supprimés`,
      cleanup: cleanupResult,
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur nettoyage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// ℹ️ ROUTE D'INFORMATION
// ==========================================

/**
 * GET /api/documents/info
 * Informations sur l'API documents
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    info: {
      name: 'Assistant Kiné - API Documents',
      version: '2.0.0',
      description: 'API de gestion et recherche sémantique de documents médicaux',
      features: {
        search: 'Recherche sémantique dans la base vectorielle',
        management: 'Gestion des documents (liste, suppression)',
        statistics: 'Statistiques et monitoring',
        maintenance: 'Outils de nettoyage et maintenance'
      },
      processing: {
        upload: 'Géré par workflow n8n',
        embedding: 'Généré automatiquement par n8n',
        storage: 'Base vectorielle Supabase'
      },
      endpoints: {
        'POST /search': 'Recherche sémantique standard',
        'POST /search/optimized': 'Recherche avec seuils adaptatifs',
        'GET /': 'Liste des documents',
        'GET /categories': 'Catégories disponibles',
        'DELETE /:id': 'Suppression d\'un document',
        'GET /stats': 'Statistiques complètes',
        'GET /health': 'Test de santé de la base',
        'POST /cleanup': 'Nettoyage des doublons'
      }
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;