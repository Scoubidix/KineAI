// routes/documents.js
const express = require('express');
const multer = require('multer');
const { processPDF, getPDFInfo } = require('../services/pdfProcessor');
const { searchDocuments } = require('../services/embeddingService');
const { supabase } = require('../services/supabaseClient');

const router = express.Router();

// Configuration multer pour l'upload de fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
    }
  }
});

// ========== ROUTES D'UPLOAD ==========

/**
 * POST /api/documents/upload
 * Upload et traitement d'un PDF
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier PDF fourni'
      });
    }

    const { title, category } = req.body;
    
    if (!title || !category) {
      return res.status(400).json({
        success: false,
        error: 'Titre et catégorie requis'
      });
    }

    console.log('📄 Upload PDF:', title, 'Catégorie:', category);
    
    // Traiter le PDF
    const result = await processPDF(
      req.file.buffer,
      title,
      category,
      {
        filename: req.file.originalname,
        size: req.file.size,
        uploadedAt: new Date().toISOString()
      }
    );

    res.json({
      success: true,
      message: 'PDF traité et ajouté à la base de connaissances',
      data: result,
      chunks: Array.isArray(result) ? result.length : 1
    });

  } catch (error) {
    console.error('❌ Erreur upload PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/documents/analyze
 * Analyser un PDF sans l'uploader
 */
router.post('/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier PDF fourni'
      });
    }

    const info = await getPDFInfo(req.file.buffer);
    
    res.json({
      success: true,
      filename: req.file.originalname,
      size: req.file.size,
      info
    });

  } catch (error) {
    console.error('❌ Erreur analyse PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== ROUTES DE RECHERCHE ==========

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

    const results = await searchDocuments(query, {
      matchThreshold: threshold,
      matchCount: limit,
      filterCategory: category
    });

    res.json({
      success: true,
      query,
      results,
      count: results.length
    });

  } catch (error) {
    console.error('❌ Erreur recherche:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== ROUTES DE GESTION ==========

/**
 * GET /api/documents
 * Lister tous les documents
 */
router.get('/', async (req, res) => {
  try {
    const { category, limit = 50, offset = 0 } = req.query;
    
    let query = supabase
      .from('documents_kine')
      .select('id, title, category, created_at, metadata')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (category) {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;

    res.json({
      success: true,
      documents: data,
      count: data.length
    });

  } catch (error) {
    console.error('❌ Erreur liste documents:', error);
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
    const { data, error } = await supabase
      .from('documents_kine')
      .select('category')
      .group('category');
    
    if (error) throw error;

    const categories = [...new Set(data.map(item => item.category))];

    res.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('❌ Erreur catégories:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Supprimer un document
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('documents_kine')
      .delete()
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Document non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Document supprimé',
      deleted: data
    });

  } catch (error) {
    console.error('❌ Erreur suppression:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/documents/stats
 * Statistiques des documents
 */
router.get('/stats', async (req, res) => {
  try {
    // Compter par catégorie
    const { data: categoryStats, error: categoryError } = await supabase
      .from('documents_kine')
      .select('category')
      .group('category');
    
    if (categoryError) throw categoryError;

    // Total documents
    const { count: totalCount, error: countError } = await supabase
      .from('documents_kine')
      .select('*', { count: 'exact', head: true });
    
    if (countError) throw countError;

    // Recherches récentes
    const { data: recentSearches, error: searchError } = await supabase
      .from('vector_searches')
      .select('query, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Ne pas faire échouer si pas de table vector_searches
    const searches = searchError ? [] : recentSearches;

    res.json({
      success: true,
      stats: {
        totalDocuments: totalCount,
        categories: categoryStats?.length || 0,
        recentSearches: searches
      }
    });

  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;