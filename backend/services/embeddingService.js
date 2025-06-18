// services/embeddingService.js - VERSION OPTIMISÉE
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

// Configuration OpenAI optimisée
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🎯 CONFIGURATION OPTIMISÉE
const EMBEDDING_CONFIG = {
  model: 'text-embedding-3-small', // 50% moins cher que text-embedding-3-large
  dimensions: 1536, // Plus compact que 3072
  batchSize: 100, // Traitement par batch pour économiser les API calls
  maxRetries: 3
};

/**
 * Génère un embedding optimisé pour un texte donné
 */
async function generateEmbedding(text) {
  try {
    // Pré-traitement du texte pour optimiser l'embedding
    const optimizedText = preprocessTextForEmbedding(text);
    
    console.log('🔄 Génération embedding optimisé pour:', optimizedText.substring(0, 100) + '...');
    
    const response = await openai.embeddings.create({
      model: EMBEDDING_CONFIG.model,
      input: optimizedText,
      dimensions: EMBEDDING_CONFIG.dimensions // Forcer les dimensions plus petites
    });

    const embedding = response.data[0].embedding;
    console.log('✅ Embedding généré:', embedding.length, 'dimensions (optimisé)');
    
    return embedding;
  } catch (error) {
    console.error('❌ Erreur génération embedding:', error);
    throw error;
  }
}

/**
 * Prétraitement du texte pour optimiser l'embedding
 */
function preprocessTextForEmbedding(text) {
  return text
    // Supprimer les caractères répétitifs
    .replace(/(.)\1{4,}/g, '$1$1$1') // Max 3 caractères identiques consécutifs
    
    // Normaliser les espaces
    .replace(/\s+/g, ' ')
    
    // Supprimer les mots très courts ou très longs (bruit)
    .split(/\s+/)
    .filter(word => word.length >= 2 && word.length <= 30)
    .join(' ')
    
    // Tronquer si trop long (OpenAI a une limite)
    .substring(0, 8000) // Limite de sécurité
    
    .trim();
}

/**
 * Stockage optimisé avec compression et déduplication
 */
async function storeDocument(title, content, category, metadata = {}) {
  try {
    console.log('🔄 Stockage optimisé:', title);
    
    // 1. Vérifier les doublons AVANT de générer l'embedding
    const isDupe = await checkForDuplicate(title, content);
    if (isDupe) {
      console.log('⚠️ Document similaire détecté, fusion des métadonnées');
      return await mergeDuplicateDocument(isDupe, metadata);
    }
    
    // 2. Optimiser le contenu
    const optimizedContent = optimizeContentForStorage(content);
    const spaceSaving = ((content.length - optimizedContent.length) / content.length * 100).toFixed(1);
    console.log(`🗜️ Contenu optimisé: ${spaceSaving}% d'économie`);
    
    // 3. Générer l'embedding seulement maintenant
    const embedding = await generateEmbedding(optimizedContent);
    
    // 4. Compresser les métadonnées
    const compressedMetadata = compressMetadata(metadata);
    
    // 5. Stocker dans Supabase
    const { data, error } = await supabase
      .from('documents_kine')
      .insert({
        title: title.substring(0, 200), // Limiter la taille du titre
        content: optimizedContent,
        category,
        embedding,
        metadata: compressedMetadata
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      throw error;
    }

    console.log('✅ Document stocké avec optimisations, ID:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Erreur stockage optimisé:', error);
    throw error;
  }
}

/**
 * Vérifie s'il existe un document similaire (évite les doublons)
 */
async function checkForDuplicate(title, content) {
  try {
    // Rechercher des titres similaires
    const { data: similarTitles, error } = await supabase
      .from('documents_kine')
      .select('id, title, content')
      .textSearch('title', title.split(' ').slice(0, 3).join(' ')) // Recherche sur les premiers mots
      .limit(5);

    if (error || !similarTitles?.length) return null;

    // Vérifier la similarité du contenu
    for (const existing of similarTitles) {
      const similarity = calculateContentSimilarity(content, existing.content);
      if (similarity > 0.85) { // 85% de similarité = doublon
        console.log(`🔍 Document similaire trouvé: ${similarity * 100}% de similarité`);
        return existing;
      }
    }

    return null;
  } catch (error) {
    console.warn('⚠️ Erreur vérification doublons:', error.message);
    return null;
  }
}

/**
 * Calcule la similarité entre deux contenus
 */
function calculateContentSimilarity(content1, content2) {
  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Fusionne un document dupliqué avec de nouvelles métadonnées
 */
async function mergeDuplicateDocument(existingDoc, newMetadata) {
  try {
    // Fusionner les métadonnées
    const mergedMetadata = {
      ...existingDoc.metadata,
      ...compressMetadata(newMetadata),
      duplicateDetected: true,
      lastMerged: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('documents_kine')
      .update({ metadata: mergedMetadata })
      .eq('id', existingDoc.id)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Document fusionné au lieu de dupliquer');
    return data;
  } catch (error) {
    console.error('❌ Erreur fusion document:', error);
    throw error;
  }
}

/**
 * Optimise le contenu pour le stockage
 */
function optimizeContentForStorage(content) {
  return content
    // Supprimer les répétitions de phrases
    .split('\n')
    .filter((line, index, array) => {
      // Supprimer les lignes dupliquées
      return array.indexOf(line) === index || line.trim().length < 10;
    })
    .join('\n')
    
    // Compacter les listes
    .replace(/^\s*[-•]\s+/gm, '• ') // Normaliser les puces
    .replace(/^\s*\d+\.\s+/gm, (match, offset, string) => {
      const num = match.match(/\d+/)[0];
      return `${num}. `;
    })
    
    // Supprimer les espaces excessifs
    .replace(/\n{4,}/g, '\n\n\n') // Max 3 retours ligne
    .replace(/\s{4,}/g, '   ') // Max 3 espaces
    
    .trim();
}

/**
 * Compression des métadonnées (version améliorée)
 */
function compressMetadata(metadata) {
  const compressed = {};
  
  // Mappings de compression
  const keyMappings = {
    'filename': 'f',
    'size': 's',
    'uploadedAt': 'u',
    'pages': 'p',
    'chunkIndex': 'ci',
    'totalChunks': 'tc',
    'originalLength': 'ol',
    'cleanedLength': 'cl',
    'type': 't',
    'priority': 'pr'
  };
  
  const valueMappings = {
    'pdf_chunk': 'pc',
    'pdf_single': 'ps',
    'protocol': 'prot',
    'exercise': 'ex',
    'pathology': 'path',
    'technique': 'tech',
    'anatomy': 'anat'
  };
  
  for (const [key, value] of Object.entries(metadata)) {
    const compressedKey = keyMappings[key] || key.substring(0, 10); // Max 10 chars
    let compressedValue = valueMappings[value] || value;
    
    // Compresser selon le type
    if (typeof compressedValue === 'string') {
      compressedValue = compressedValue.substring(0, 50); // Max 50 chars
    } else if (typeof compressedValue === 'number') {
      compressedValue = Math.round(compressedValue); // Pas de décimales
    }
    
    compressed[compressedKey] = compressedValue;
  }
  
  return compressed;
}

/**
 * Génération d'embeddings en batch (pour l'efficacité)
 */
async function generateEmbeddingsBatch(texts) {
  try {
    console.log(`🔄 Génération batch de ${texts.length} embeddings`);
    
    const optimizedTexts = texts.map(preprocessTextForEmbedding);
    
    const response = await openai.embeddings.create({
      model: EMBEDDING_CONFIG.model,
      input: optimizedTexts,
      dimensions: EMBEDDING_CONFIG.dimensions
    });

    console.log(`✅ Batch de ${response.data.length} embeddings généré`);
    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('❌ Erreur génération batch:', error);
    throw error;
  }
}

// ========== FONCTIONS EXISTANTES CONSERVÉES ==========

async function searchDocuments(query, options = {}) {
  try {
    const {
      matchThreshold = 0.3,
      matchCount = 10,
      filterCategory = null
    } = options;

    console.log('🔍 Recherche avec fonction Supabase pour:', query);
    
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

async function searchDocumentsOptimized(query, options = {}) {
  try {
    let results = await searchDocuments(query, {
      matchThreshold: 0.7,
      matchCount: 3,
      filterCategory: options.filterCategory
    });

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

function splitTextIntoChunks(text, maxChunkSize = 1000, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxChunkSize;
    
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }
    
    chunks.push(text.substring(start, end).trim());
    start = end - overlap;
  }
  
  return chunks;
}

function cleanTextForEmbedding(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-.,;:!?()àéèùôîç]/g, '')
    .trim();
}

async function getDocumentStats() {
  try {
    const { count: totalCount, error: countError } = await supabase
      .from('documents_kine')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const { data: docs, error: docsError } = await supabase
      .from('documents_kine')
      .select('category, created_at, metadata');

    if (docsError) throw docsError;

    const categoryStats = {};
    const monthlyStats = {};
    let totalSpaceSaved = 0;
    let documentsWithOptimization = 0;

    docs.forEach(doc => {
      const cat = doc.category || 'Non catégorisé';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;

      if (doc.created_at) {
        const month = new Date(doc.created_at).toISOString().substring(0, 7);
        monthlyStats[month] = (monthlyStats[month] || 0) + 1;
      }

      // Calculer les économies d'espace si disponibles
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

    // Enrichir avec des infos d'optimisation
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

async function testVectorDatabase() {
  try {
    console.log('🔧 Test base vectorielle optimisée...');

    const { data, error } = await supabase
      .from('documents_kine')
      .select('id')
      .limit(1);

    if (error && error.code !== '42P01') {
      throw error;
    }

    const testEmbedding = await generateEmbedding('test kinésithérapie');
    
    if (!testEmbedding || testEmbedding.length === 0) {
      throw new Error('Embedding test failed');
    }

    const { data: searchTest, error: searchError } = await supabase.rpc('search_documents', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,
      match_count: 1
    });

    if (searchError) {
      throw new Error(`Fonction search_documents error: ${searchError.message}`);
    }

    console.log('✅ Base vectorielle optimisée opérationnelle');
    return {
      status: 'success',
      supabaseConnected: true,
      embeddingWorking: true,
      searchFunctionWorking: true,
      embeddingDimensions: testEmbedding.length,
      embeddingModel: EMBEDDING_CONFIG.model,
      optimizations: {
        smallerEmbeddings: true,
        textPreprocessing: true,
        metadataCompression: true,
        duplicateDetection: true
      },
      searchResults: searchTest?.length || 0,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erreur test base vectorielle:', error);
    return {
      status: 'error',
      error: error.message,
      supabaseConnected: false,
      embeddingWorking: false,
      searchFunctionWorking: false,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Nettoyage de la base - supprime les vrais doublons
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

    // Supprimer les doublons confirmés
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

/**
 * Génère un hash simple du contenu
 */
function generateContentHash(content) {
  return content
    .toLowerCase()
    .replace(/\s+/g, '')
    .substring(0, 100); // Hash basé sur les 100 premiers caractères normalisés
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch, // Nouvelle fonction batch
  storeDocument,
  searchDocuments,
  searchDocumentsOptimized,
  splitTextIntoChunks,
  cleanTextForEmbedding,
  getDocumentStats,
  deleteDocument,
  listDocuments,
  testVectorDatabase,
  logSearch,
  // Nouvelles fonctions d'optimisation
  preprocessTextForEmbedding,
  optimizeContentForStorage,
  compressMetadata,
  checkForDuplicate,
  cleanupDuplicates,
  calculateContentSimilarity
};