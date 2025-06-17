// services/embeddingService.js
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

// Configuration OpenAI depuis .env
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Génère un embedding pour un texte donné
 */
async function generateEmbedding(text) {
  try {
    console.log('🔄 Génération embedding pour:', text.substring(0, 100) + '...');
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
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
 * Stocke un document avec son embedding dans Supabase
 */
async function storeDocument(title, content, category, metadata = {}) {
  try {
    console.log('🔄 Stockage document:', title);
    
    // Générer l'embedding
    const embedding = await generateEmbedding(content);
    
    // Stocker dans Supabase
    const { data, error } = await supabase
      .from('documents_kine')
      .insert({
        title,
        content,
        category,
        embedding,
        metadata
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      throw error;
    }

    console.log('✅ Document stocké avec ID:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Erreur stockage document:', error);
    throw error;
  }
}

/**
 * Recherche sémantique dans les documents
 */
async function searchDocuments(query, options = {}) {
  try {
    const {
      matchThreshold = 0.7,
      matchCount = 3,
      filterCategory = null
    } = options;

    console.log('🔍 Recherche pour:', query);
    
    // Générer embedding pour la requête
    const queryEmbedding = await generateEmbedding(query);
    
    // Rechercher dans Supabase
    const { data, error } = await supabase.rpc('search_documents', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_category: filterCategory
    });

    if (error) {
      console.error('❌ Erreur recherche:', error);
      throw error;
    }

    console.log('✅ Trouvé', data.length, 'documents pertinents');
    
    // Log des recherches (optionnel)
    await logSearch(query, data.length);
    
    return data;
  } catch (error) {
    console.error('❌ Erreur recherche sémantique:', error);
    throw error;
  }
}

/**
 * Log une recherche (pour analytics)
 */
async function logSearch(query, resultsCount, patientId = null) {
  try {
    await supabase
      .from('vector_searches')
      .insert({
        query,
        results_count: resultsCount,
        patient_id: patientId
      });
  } catch (error) {
    // Ne pas faire échouer la recherche si le log échoue
    console.warn('⚠️ Erreur log recherche:', error.message);
  }
}

/**
 * Découpe un texte long en chunks pour l'embedding
 */
function splitTextIntoChunks(text, maxChunkSize = 1000, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxChunkSize;
    
    // Si on n'est pas à la fin, essayer de couper à un espace
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }
    
    chunks.push(text.substring(start, end).trim());
    start = end - overlap; // Overlap pour la continuité
  }
  
  return chunks;
}

module.exports = {
  generateEmbedding,
  storeDocument,
  searchDocuments,
  splitTextIntoChunks
};