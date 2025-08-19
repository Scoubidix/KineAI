// services/embeddingService.js - VERSION NETTOYÉE
// Le stockage est géré par n8n, mais on garde l'embedding pour les recherches
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

// Configuration OpenAI pour les recherches
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EMBEDDING_CONFIG = {
  model: 'text-embedding-3-small',
  dimensions: 1536
};

// ==========================================
// 🔍 FONCTIONS DE RECHERCHE SÉMANTIQUE
// ==========================================

/**
 * Génère un embedding pour les recherches (identique au stockage n8n)
 * @param {string} text - Texte à convertir en embedding
 * @returns {array} Vecteur d'embedding
 */
async function generateEmbedding(text) {
  try {
    const optimizedText = preprocessTextForEmbedding(text);
    
    console.log('🔄 Génération embedding pour recherche:', optimizedText.substring(0, 100) + '...');
    
    const response = await openai.embeddings.create({
      model: EMBEDDING_CONFIG.model,
      input: optimizedText,
      dimensions: EMBEDDING_CONFIG.dimensions
    });

    const embedding = response.data[0].embedding;
    console.log('✅ Embedding généré:', embedding.length, 'dimensions');
    
    return embedding;
  } catch (error) {
    console.error('❌ Erreur génération embedding:', error);
    throw error;
  }
}

/**
 * Prétraitement du texte pour optimiser l'embedding (même logique que n8n)
 */
function preprocessTextForEmbedding(text) {
  return text
    // Supprimer les caractères répétitifs
    .replace(/(.)\1{4,}/g, '$1$1$1')
    
    // Normaliser les espaces
    .replace(/\s+/g, ' ')
    
    // Supprimer les mots très courts ou très longs
    .split(/\s+/)
    .filter(word => word.length >= 2 && word.length <= 30)
    .join(' ')
    
    // Tronquer si trop long
    .substring(0, 8000)
    
    .trim();
}

/**
 * Recherche sémantique dans la base vectorielle
 * @param {string} query - Requête de recherche
 * @param {object} options - Options de recherche (seuil, nombre, catégorie)
 * @returns {array} Résultats de recherche enrichis
 */
async function searchDocuments(query, options = {}) {
  try {
    const {
      matchThreshold = 0.3,
      matchCount = 10,
      filterCategory = null
    } = options;

    console.log('🔍 Recherche avec fonction Supabase pour:', query);
    
    // Générer l'embedding de la requête (même logique que le stockage n8n)
    const queryEmbedding = await generateEmbedding(query);
    
    const { data, error } = await supabase.rpc('search_documents', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_category: filterCategory
    });

    if (error) {
      console.error('❌ Erreur recherche Supabase:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('⚠️ Aucun document trouvé avec seuil', matchThreshold);
      return [];
    }

    // Enrichissement des résultats avec métadonnées utiles
    const enrichedResults = data.map((doc, index) => ({
      ...doc,
      searchRank: index + 1,
      similarityPercentage: Math.round(doc.similarity * 100),
      contentLength: doc.content ? doc.content.length : 0,
      hasMetadata: !!doc.metadata,
      created_at: doc.created_at || new Date().toISOString(),
      ageInDays: doc.created_at ? 
        Math.floor((new Date() - new Date(doc.created_at)) / (1000 * 60 * 60 * 24)) : 0
    }));

    console.log(`✅ ${enrichedResults.length} documents trouvés`);
    await logSearch(query, enrichedResults.length);
    
    return enrichedResults;
  } catch (error) {
    console.error('❌ Erreur recherche sémantique:', error);
    throw error;
  }
}

/**
 * Recherche optimisée avec stratégie de seuils adaptatifs
 * Essaie d'abord un seuil élevé, puis réduit si peu de résultats
 */
async function searchDocumentsOptimized(query, options = {}) {
  try {
    // Première tentative avec seuil élevé (haute qualité)
    let results = await searchDocuments(query, {
      matchThreshold: 0.7,
      matchCount: 3,
      filterCategory: options.filterCategory
    });

    // Si pas assez de résultats, tentative avec seuil plus bas
    if (results.length < 2 && options.allowLowerThreshold !== false) {
      console.log('🔄 Seuil élevé: ' + results.length + ' résultats, tentative seuil bas...');
      
      results = await searchDocuments(query, {
        matchThreshold: 0.4,
        matchCount: 6,
        filterCategory: options.filterCategory
      });
    }

    return results;
  } catch (error) {
    console.error('❌ Erreur recherche optimisée:', error);
    throw error;
  }
}

// ==========================================
// 📊 FONCTIONS DE GESTION ET STATISTIQUES
// ==========================================

/**
 * Récupère les statistiques complètes de la base documentaire
 */
async function getDocumentStats() {
  try {
    // Comptage total des documents
    const { count: totalCount, error: countError } = await supabase
      .from('documents_kine')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    // Récupération des métadonnées pour analyse
    const { data: docs, error: docsError } = await supabase
      .from('documents_kine')
      .select('category, created_at, metadata');

    if (docsError) throw docsError;

    const categoryStats = {};
    const monthlyStats = {};
    let totalSpaceSaved = 0;
    let documentsWithOptimization = 0;

    // Analyse des données
    docs.forEach(doc => {
      // Statistiques par catégorie
      const cat = doc.category || 'Non catégorisé';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;

      // Statistiques mensuelles
      if (doc.created_at) {
        const month = new Date(doc.created_at).toISOString().substring(0, 7);
        monthlyStats[month] = (monthlyStats[month] || 0) + 1;
      }

      // Calcul des économies d'espace (si les métadonnées d'optimisation existent)
      if (doc.metadata?.ol && doc.metadata?.cl) {
        const originalLength = doc.metadata.ol;
        const cleanedLength = doc.metadata.cl;
        totalSpaceSaved += (originalLength - cleanedLength);
        documentsWithOptimization++;
      }
    });

    const avgSpaceSaving = documentsWithOptimization > 0 ? 
      (totalSpaceSaved / documentsWithOptimization).toFixed(0) : 0;

    return {
      totalDocuments: totalCount || 0,
      categories: Object.keys(categoryStats).length,
      categoryBreakdown: categoryStats,
      monthlyBreakdown: monthlyStats,
      optimization: {
        totalSpaceSaved: totalSpaceSaved,
        avgSpaceSaving: avgSpaceSaving + ' caractères/doc',
        optimizedDocuments: documentsWithOptimization,
        optimizationRate: ((documentsWithOptimization / (totalCount || 1)) * 100).toFixed(1) + '%'
      },
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erreur stats documents:', error);
    return {
      totalDocuments: 0,
      categories: 0,
      categoryBreakdown: {},
      monthlyBreakdown: {},
      optimization: { error: error.message },
      error: error.message
    };
  }
}

/**
 * Liste les documents avec options de filtrage et pagination
 */
async function listDocuments(options = {}) {
  try {
    const {
      category = null,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc'
    } = options;

    let query = supabase
      .from('documents_kine')
      .select('id, title, category, created_at, metadata')
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Erreur listage documents:', error);
      throw error;
    }

    // Enrichissement avec informations d'optimisation
    const enrichedData = data.map(doc => ({
      ...doc,
      isOptimized: !!(doc.metadata?.ol && doc.metadata?.cl),
      spaceSaving: doc.metadata?.ol && doc.metadata?.cl ? 
        Math.round(((doc.metadata.ol - doc.metadata.cl) / doc.metadata.ol) * 100) + '%' : 'N/A'
    }));

    console.log(`📋 ${enrichedData.length} documents récupérés`);
    return enrichedData;

  } catch (error) {
    console.error('❌ Erreur listage:', error);
    throw error;
  }
}

/**
 * Supprime un document de la base vectorielle
 */
async function deleteDocument(documentId) {
  try {
    console.log('🗑️ Suppression document ID:', documentId);

    const { data, error } = await supabase
      .from('documents_kine')
      .delete()
      .eq('id', documentId)
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur suppression:', error);
      throw error;
    }

    console.log('✅ Document supprimé:', data.title);
    return data;

  } catch (error) {
    console.error('❌ Erreur suppression document:', error);
    throw error;
  }
}

// ==========================================
// 🧹 FONCTIONS DE NETTOYAGE ET MAINTENANCE
// ==========================================

/**
 * Nettoie la base en supprimant les vrais doublons
 * (À utiliser périodiquement pour la maintenance)
 */
async function cleanupDuplicates() {
  try {
    console.log('🧹 Nettoyage des doublons...');
    
    const { data: allDocs, error } = await supabase
      .from('documents_kine')
      .select('id, title, content')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const duplicates = [];
    const seen = new Map();

    // Détection des doublons par hash de contenu
    for (const doc of allDocs) {
      const contentHash = generateContentHash(doc.content);
      
      if (seen.has(contentHash)) {
        duplicates.push({
          duplicate: doc,
          original: seen.get(contentHash)
        });
      } else {
        seen.set(contentHash, doc);
      }
    }

    console.log(`🔍 Trouvé ${duplicates.length} doublons potentiels`);

    // Suppression des doublons confirmés
    let deletedCount = 0;
    for (const { duplicate, original } of duplicates) {
      const similarity = calculateContentSimilarity(duplicate.content, original.content);
      
      if (similarity > 0.95) { // 95% de similarité = doublon certain
        await deleteDocument(duplicate.id);
        deletedCount++;
        console.log(`🗑️ Doublon supprimé: ${duplicate.title}`);
      }
    }

    console.log(`✅ ${deletedCount} doublons supprimés`);
    return { deletedCount, scannedCount: allDocs.length };

  } catch (error) {
    console.error('❌ Erreur nettoyage doublons:', error);
    throw error;
  }
}

// ==========================================
// 🔧 FONCTIONS UTILITAIRES
// ==========================================

/**
 * Calcule la similarité entre deux contenus textuels
 * Basé sur l'intersection des mots significatifs
 */
function calculateContentSimilarity(content1, content2) {
  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Génère un hash simple du contenu pour détecter les doublons
 */
function generateContentHash(content) {
  return content
    .toLowerCase()
    .replace(/\s+/g, '')
    .substring(0, 100); // Hash basé sur les 100 premiers caractères normalisés
}

/**
 * Log une recherche dans la table des statistiques
 */
async function logSearch(query, resultsCount, patientId = null) {
  try {
    const { data, error } = await supabase
      .from('vector_searches')
      .insert({
        query: query.substring(0, 200), // Limiter pour économiser l'espace
        results_count: resultsCount,
        patient_id: patientId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error && error.code !== '42P01') {
      console.warn('⚠️ Erreur log recherche:', error.message);
    }
  } catch (error) {
    console.warn('⚠️ Log recherche ignoré:', error.message);
  }
}

/**
 * Test la connectivité et le bon fonctionnement de la base vectorielle
 */
async function testVectorDatabase() {
  try {
    console.log('🔧 Test base vectorielle...');

    // Test connexion Supabase
    const { data, error } = await supabase
      .from('documents_kine')
      .select('id')
      .limit(1);

    if (error && error.code !== '42P01') {
      throw error;
    }

    // Test fonction de recherche avec embedding
    const testEmbedding = await generateEmbedding('test kinésithérapie');
    
    const { data: searchTest, error: searchError } = await supabase.rpc('search_documents', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,
      match_count: 1
    });

    if (searchError) {
      throw new Error(`Fonction search_documents error: ${searchError.message}`);
    }

    console.log('✅ Base vectorielle opérationnelle');
    return {
      status: 'success',
      supabaseConnected: true,
      embeddingWorking: true,
      searchFunctionWorking: true,
      embeddingDimensions: testEmbedding.length,
      embeddingModel: EMBEDDING_CONFIG.model,
      searchResults: searchTest?.length || 0,
      architecture: 'Recherche: embedding service / Stockage: n8n workflow',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erreur test base vectorielle:', error);
    return {
      status: 'error',
      error: error.message,
      supabaseConnected: false,
      searchFunctionWorking: false,
      timestamp: new Date().toISOString()
    };
  }
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
  // Fonctions de recherche
  searchDocuments,
  searchDocumentsOptimized,
  generateEmbedding, // Pour les recherches seulement
  preprocessTextForEmbedding, // Utilitaire d'embedding
  
  // Fonctions de gestion
  getDocumentStats,
  deleteDocument,
  listDocuments,
  
  // Fonctions de maintenance
  cleanupDuplicates,
  testVectorDatabase,
  logSearch,
  
  // Utilitaires
  calculateContentSimilarity,
  generateContentHash
};