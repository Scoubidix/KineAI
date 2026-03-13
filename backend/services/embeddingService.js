// services/embeddingService.js - VERSION NETTOYÉE
// Le stockage est géré par n8n, mais on garde l'embedding pour les recherches
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');
const logger = require('../utils/logger');

// Configuration OpenAI pour les recherches
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EMBEDDING_CONFIG = {
  model: 'text-embedding-3-small',
  dimensions: 1536
};

const EMBEDDING_CONFIG_BIBLIO = {
  model: 'text-embedding-3-large',
  dimensions: 1536
};

const EMBEDDING_CONFIG_CLINIQUE = {
  model: 'text-embedding-3-large',
  dimensions: 1536
};

// ==========================================
// 📋 DICTIONNAIRE MÉTADONNÉES - BASÉ SUR LE GUIDE UTILISATEUR
// ==========================================

/**
 * Dictionnaire des pathologies - SEUL utilisé pour le filtrage
 * Basé sur le guide utilisateur + données réelles
 */
const METADATA_DICTIONARY = {
  pathologies: [
    // Épaule (guide utilisateur)
    'capsulite_adhesive', 'tendinopathie_coiffe', 'conflit_sous_acromial', 'luxation_epaule',
    // Genou (guide utilisateur)
    'gonarthrose', 'syndrome_rotulien', 'entorse_genou', 'reconstruction_lca',
    // Rachis (guide utilisateur)
    'lombalgie_commune', 'hernie_discale', 'cervicalgie', 'scoliose',
    // AVC (tes données réelles)
    'avc', 'infarctus_cerebral', 'hemorragie_cerebrale', 'hemiplegie', 'spasticite', 'retractions',
    // Autres pathologies de tes données
    'faiblesse_cervicale', 'faiblesse_rachis', 'troubles_marche', 'troubles_prehension',
    // Générales
    'tendinopathie', 'arthrose', 'entorse', 'fracture'
  ]
};

// Synonymes supprimés - intégrés directement dans analyzeQueryForMetadata()

// ==========================================
// 🔧 FONCTIONS UTILITAIRES POUR FILTRAGE
// ==========================================

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * Trouve le terme le plus proche dans un tableau de métadonnées
 * AMÉLIORÉ: Évite les faux positifs sur les mots courts
 */
function findClosestTerm(word, terms, maxDistance = 2) {
  let bestMatch = null;
  let bestDistance = maxDistance + 1;
  
  const cleanWord = word.toLowerCase().trim();
  
  // 🛡️ PROTECTION: Ignorer les mots trop courts qui causent des faux positifs
  if (cleanWord.length < 3) {
    return null;
  }
  
  for (const term of terms) {
    const cleanTerm = term.toLowerCase();
    
    // Correspondance exacte prioritaire
    if (cleanTerm === cleanWord) {
      return { term, distance: 0, type: 'exact' };
    }
    
    // Sous-chaîne uniquement si le mot fait au moins 4 caractères
    if (cleanWord.length >= 4) {
      if (cleanTerm.includes(cleanWord)) {
        return { term, distance: 0, type: 'substring_in_term' };
      }
      if (cleanWord.includes(cleanTerm) && cleanTerm.length >= 4) {
        return { term, distance: 0, type: 'term_in_word' };
      }
    }
    
    // Distance de Levenshtein seulement pour les mots de 4+ caractères
    if (cleanWord.length >= 4) {
      const distance = levenshteinDistance(cleanWord, cleanTerm);
      if (distance < bestDistance && distance <= maxDistance) {
        bestDistance = distance;
        bestMatch = term;
      }
    }
  }
  
  return bestMatch ? { term: bestMatch, distance: bestDistance, type: 'levenshtein' } : null;
}

/**
 * Analyse une requête et extrait UNIQUEMENT les pathologies pour le filtrage
 * AMÉLIORÉ : Détection fautes de frappe + anatomie → pathologies
 */
function analyzeQueryForMetadata(query) {
  const words = query.toLowerCase()
    .replace(/[^a-zàâäéèêëïîôöùûüÿçñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2); // Garder mots de 3+ caractères
  
  // 🛡️ MOTS À IGNORER pour la détection de PATHOLOGIES uniquement
  // (L'embedding garde tous les mots pour la similarité sémantique)
  const IGNORED_WORDS = new Set([
    'dans', 'avec', 'pour', 'une', 'des', 'les', 'sur', 'par', 'sans', 'vers', 'chez',
    'sous', 'entre', 'depuis', 'pendant', 'avant', 'après', 'contre', 'selon',
    'malgré', 'durant', 'lors', 'via', 'dès', 'jusqu', 'parmi', 'hormis',
    'exercices', 'exercice', 'rééducation', 'reeducation', 'traitement', 'soin',
    'patient', 'patients', 'kiné', 'kine', 'séance', 'seance', 'programme',
    'donne', 'donner', 'faire', 'comment', 'quoi', 'quand', 'pourquoi',
    'mobilité', 'mobilite', 'force', 'équilibre', 'equilibre', 'douleur'
  ]);
  
  const filteredWords = words.filter(word => !IGNORED_WORDS.has(word));
  
  const detectedPathologies = [];
  
  logger.debug('🔍 Mots analysés:', words.join(', '));
  logger.debug('🔍 Mots pour pathologies:', filteredWords.join(', '));
  logger.debug('💡 Note: L\'embedding utilise la requête complète pour la similarité sémantique');
  
  // ÉTAPE 1: Synonymes de pathologies + variantes courantes
  const pathologySynonyms = {
    'lumbago': 'lombalgie_commune',
    'mal_dos': 'lombalgie_commune', 
    'torticolis': 'cervicalgie',
    'tendinite': 'tendinopathie',
    'tendinites': 'tendinopathie',
    'tendiniie': 'tendinopathie', // Faute de frappe courante
    'tendiite': 'tendinopathie',  // Faute de frappe courante
    'arthrite': 'arthrose',
    'avc': 'avc', // Assurer que AVC est bien détecté
    'accident_vasculaire': 'avc'
  };
  
  for (const word of filteredWords) {
    if (pathologySynonyms[word]) {
      if (!detectedPathologies.includes(pathologySynonyms[word])) {
        detectedPathologies.push(pathologySynonyms[word]);
        logger.debug(`✅ Pathologie synonyme: ${word} → ${pathologySynonyms[word]}`);
      }
    }
  }
  
  // ÉTAPE 2: Mapping anatomie → pathologies associées
  const anatomyToPathologies = {
    'epaule': ['capsulite_adhesive', 'tendinopathie_coiffe', 'conflit_sous_acromial'],
    'épaule': ['capsulite_adhesive', 'tendinopathie_coiffe', 'conflit_sous_acromial'], 
    'genou': ['gonarthrose', 'syndrome_rotulien', 'entorse_genou'],
    'genoux': ['gonarthrose', 'syndrome_rotulien', 'entorse_genou'],
    'dos': ['lombalgie_commune', 'hernie_discale'],
    'rachis': ['lombalgie_commune', 'hernie_discale', 'cervicalgie'],
    'cervical': ['cervicalgie'],
    'lombaire': ['lombalgie_commune', 'hernie_discale']
  };
  
  for (const word of filteredWords) {
    if (anatomyToPathologies[word]) {
      const anatomyPathologies = anatomyToPathologies[word];
      anatomyPathologies.forEach(pathology => {
        if (!detectedPathologies.includes(pathology)) {
          detectedPathologies.push(pathology);
        }
      });
      logger.debug(`✅ Anatomie détectée: ${word} → pathologies: ${anatomyPathologies.join(', ')}`);
    }
  }
  
  // ÉTAPE 3: Pathologies exactes
  const pathologies = METADATA_DICTIONARY.pathologies;
  for (const word of filteredWords) {
    if (pathologies.includes(word) && !detectedPathologies.includes(word)) {
      detectedPathologies.push(word);
      logger.debug(`✅ Pathologie exacte: ${word}`);
    }
  }
  
  // ÉTAPE 4: Similarité pour fautes de frappe (distance 2 max pour les pathologies)
  for (const word of filteredWords) {
    if (word.length < 4) continue; // Éviter faux positifs
    if (detectedPathologies.some(p => p.includes(word) || word.includes(p))) continue; // Déjà trouvé
    if (pathologySynonyms[word]) continue; // Déjà traité
    
    const match = findClosestTerm(word, pathologies, 2); // Distance 2 pour fautes de frappe
    if (match && match.distance <= 2 && word.length >= 4 && match.term.length >= 4) {
      // Vérification : éviter les faux positifs absurdes
      if (word.length >= 5 || match.distance <= 1) { // Seuil plus strict pour mots courts
        if (!detectedPathologies.includes(match.term)) {
          detectedPathologies.push(match.term);
          logger.debug(`✅ Pathologie faute frappe: ${word} → ${match.term} (distance: ${match.distance})`);
        }
      }
    }
  }
  
  // Retourner format attendu par buildMetadataFilters
  if (detectedPathologies.length > 0) {
    logger.debug(`🎯 Pathologies détectées:`, detectedPathologies);
    return { pathologies: detectedPathologies };
  } else {
    logger.debug('⚠️ Aucune pathologie détectée - recherche vectorielle générale');
    return {};
  }
}

/**
 * Construit les filtres SQL Supabase à partir des métadonnées détectées
 * OPTIMISÉ: Filtrage par pathologies + type_contenu selon le type d'IA
 */
function buildMetadataFilters(detectedMetadata, iaType = 'basique') {
  const filters = {};
  
  switch(iaType) {
    case 'biblio':
      // IA Biblio : TOUJOURS filtrer sur type_contenu = 'etude' UNIQUEMENT (pas de pathologies)
      filters.type_contenu = 'etude';
      logger.debug(`🔬 IA Biblio - Filtres: études uniquement (pas de filtre pathologies)`);
      logger.debug(`🔬 IA Biblio - Filtres finaux:`, filters);
      break;
      
    case 'clinique':
      // IA Clinique : Pipeline hybride (Vector + BM25 → RRF → Cohere) sur clinical_chunks
      // Court-circuité dans searchDocumentsOptimized, ce bloc n'est plus atteint
      logger.debug(`🩺 IA Clinique - Pipeline hybride sur clinical_chunks`);
      break;
      
    case 'admin':
      // IA Admin : PAS DE RAG - retourner null pour court-circuiter
      logger.debug(`📋 IA Admin - Pas de RAG utilisé`);
      return null;
      
    case 'basique':
    default:
      // IA Basique : Aucun filtre (recherche vectorielle pure)
      logger.debug(`💬 IA Basique - Aucun filtre metadata (recherche vectorielle pure)`);
      break;
  }
  
  return filters;
}

// ==========================================
// 🔍 FONCTIONS DE RECHERCHE SÉMANTIQUE
// ==========================================

/**
 * Génère un embedding pour les recherches (identique au stockage n8n)
 * @param {string} text - Texte à convertir en embedding
 * @returns {array} Vecteur d'embedding
 */
async function generateEmbedding(text, iaType = 'basique') {
  try {
    const optimizedText = preprocessTextForEmbedding(text);
    const config = iaType === 'biblio' ? EMBEDDING_CONFIG_BIBLIO
                 : iaType === 'clinique' ? EMBEDDING_CONFIG_CLINIQUE
                 : EMBEDDING_CONFIG;

    logger.debug(`🔄 Génération embedding (${config.model}) pour recherche:`, optimizedText.substring(0, 100) + '...');

    const response = await openai.embeddings.create({
      model: config.model,
      input: optimizedText,
      dimensions: config.dimensions
    });

    const embedding = response.data[0].embedding;
    logger.debug(`✅ Embedding généré (${config.model}):`, embedding.length, 'dimensions');

    return embedding;
  } catch (error) {
    logger.error('❌ Erreur génération embedding:', error);
    throw error;
  }
}

/**
 * Prétraitement minimal du texte pour l'embedding
 * Garde le maximum de contexte sémantique pour OpenAI
 */
function preprocessTextForEmbedding(text) {
  // Seulement normaliser les espaces et tronquer pour la sécurité
  const processed = text
    .replace(/\s+/g, ' ')  // Normaliser les espaces multiples
    .substring(0, 8000)    // Limite de sécurité OpenAI
    .trim();
  
  return processed;
}

/**
 * Recherche sémantique dans la base vectorielle AVEC filtres métadonnées
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

    logger.debug('🔍 Recherche avec filtres métadonnées pour:', query);
    
    // 🆕 ÉTAPE 1: Analyser la requête pour extraire les métadonnées
    const detectedMetadata = analyzeQueryForMetadata(query);
    const metadataFilters = buildMetadataFilters(detectedMetadata);
    
    // Générer l'embedding de la requête
    const queryEmbedding = await generateEmbedding(query);
    
    // 🆕 ÉTAPE 2: Appeler la nouvelle fonction avec filtres métadonnées
    const { data, error } = await supabase.rpc('search_documents_with_metadata', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_category: filterCategory,
      metadata_filters: JSON.stringify(metadataFilters)  // CONVERSION en JSON string
    });
    
    // DEBUG: Log pour voir exactement ce qui est envoyé
    logger.debug(`🔬 Metadata filters fonction directe:`, JSON.stringify(metadataFilters));

    if (error) {
      logger.error('❌ Erreur recherche Supabase:', error);
      // Si la nouvelle fonction n'existe pas, retourner résultat vide
      logger.debug('⚠️ Fonction search_documents_with_metadata non trouvée. Créez-la dans Supabase !');
      return [];
    }

    if (!data || data.length === 0) {
      logger.debug('⚠️ Aucun document trouvé avec seuil', matchThreshold);
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
        Math.floor((new Date() - new Date(doc.created_at)) / (1000 * 60 * 60 * 24)) : 0,
      metadataFiltered: Object.keys(metadataFilters).length > 0
    }));

    logger.debug(`✅ ${enrichedResults.length} documents trouvés avec filtres métadonnées`);
    await logSearch(query, enrichedResults.length);
    
    return enrichedResults;
  } catch (error) {
    logger.error('❌ Erreur recherche sémantique:', error);
    throw error;
  }
}

/**
 * Ancienne fonction de recherche (fallback)
 */
async function searchDocumentsLegacy(query, options = {}) {
  const {
    matchThreshold = 0.3,
    matchCount = 10,
    filterCategory = null
  } = options;

  logger.debug('🔍 Recherche legacy (sans filtres métadonnées) pour:', query);
  
  const queryEmbedding = await generateEmbedding(query);
  
  logger.debug('🚨 APPEL LEGACY search_documents (SANS FILTRES) - CECI EXPLIQUE LE BUG !');
  const { data, error } = await supabase.rpc('search_documents', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_category: filterCategory
  });

  if (error) {
    logger.error('❌ Erreur recherche legacy:', error);
    throw error;
  }

  return data || [];
}

/**
 * Recherche optimisée avec stratégie de seuils adaptatifs
 * Essaie d'abord un seuil élevé, puis réduit si peu de résultats
 * OPTIMISÉ: Génère l'embedding une seule fois + filtres par type d'IA
 */
/**
 * Query Rewriter — traduit une question kiné FR en query EN optimisée pour PubMed.
 * Expanse les termes médicaux (MeSH, synonymes) pour maximiser le recall.
 * ~50-100 tokens, coût ~$0.0002/requête.
 */
async function rewriteQueryToEnglish(queryFR) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a medical search query optimizer for physiotherapy/physical therapy research.

TASK: Rewrite the French physiotherapy question into TWO English queries:

1. "vector": Expanded query for semantic vector search. Use precise medical terminology, MeSH terms, clinical synonyms, and relevant intervention terms. Max 20 words.
2. "pubmed": Strict faithful translation for PubMed keyword search. Only the core medical concepts from the original question — NO expansion, NO added terms. Max 6 words.

RULES:
- Do NOT add boolean operators (AND/OR)
- "pubmed" must be a strict translation — do not add terms the user did not mention

EXAMPLES:
Input: "tendinopathie coiffe des rotateurs exercices"
{"vector": "rotator cuff tendinopathy exercise therapy eccentric strengthening rehabilitation", "pubmed": "rotator cuff tendinopathy exercises"}

Input: "impacts des antibiotiques sur les tendinites d'achille"
{"vector": "antibiotics Achilles tendinopathy fluoroquinolone tendon adverse effects", "pubmed": "antibiotics Achilles tendinopathy"}

Input: "rééducation post LCA"
{"vector": "ACL reconstruction rehabilitation physiotherapy return to sport protocol", "pubmed": "ACL reconstruction rehabilitation"}

RESPOND IN JSON ONLY.`
        },
        {
          role: 'user',
          content: queryFR
        }
      ]
    });

    const result = JSON.parse(response.choices[0].message.content);
    logger.debug(`🌐 Query rewriter: "${queryFR}" → vector: "${result.vector}" | pubmed: "${result.pubmed}"`);
    return result;
  } catch (error) {
    logger.error('❌ Query rewriter failed, using original query:', error.message);
    return { vector: queryFR, pubmed: queryFR };
  }
}

/**
 * Fire-and-forget : lance l'enrichissement PubMed en background.
 * Ne bloque pas la réponse user.
 */
function triggerOnDemandEnrich(queryEN) {
  try {
    const { onDemandEnrich } = require('./pubmedService');
    onDemandEnrich(queryEN).catch(err => {
      logger.error('❌ On-demand enrichment failed (background):', err.message);
    });
    logger.info(`🔄 Enrichissement on-demand lancé en background pour: "${queryEN.substring(0, 60)}..."`);
  } catch (err) {
    logger.error('❌ Failed to trigger on-demand enrichment:', err.message);
  }
}

async function searchDocumentsOptimized(query, options = {}) {
  try {
    const {
      filterCategory = null,
      allowLowerThreshold = true,
      iaType = 'basique'  // NOUVEAU: Type d'IA pour les filtres
    } = options;

    logger.debug(`🔍 Recherche optimisée pour IA ${iaType} avec embedding unique:`, query);

    // Court-circuit pour IA Admin (pas de RAG)
    if (iaType === 'admin') {
      logger.debug('📋 IA Admin - Court-circuit RAG (pas de recherche)');
      return [];
    }

    // IA Biblio → Query Rewriter EN + pipeline hybride studies_v3 (Vector + BM25 → RRF → Rerank)
    if (iaType === 'biblio') {
      // Query Rewriter: traduit la question FR en 2 queries EN (vector élargie + pubmed fidèle)
      const { vector: queryVector, pubmed: queryPubmed } = await rewriteQueryToEnglish(query);
      logger.debug(`🔬 IA BIBLIO - Query rewriter: "${query}" → vector: "${queryVector}" | pubmed: "${queryPubmed}"`);

      const queryEmbedding = await generateEmbedding(queryVector, iaType);
      logger.debug('🔬 IA BIBLIO - Pipeline hybride studies_v3 (Vector EN + BM25 EN → RRF → Rerank EN)');

      const [vectorResults, bm25Results] = await Promise.all([
        searchStudiesV3Vector(queryEmbedding, 0.3, 15),
        searchStudiesV3BM25(queryVector, 15)
      ]);

      logger.debug(`📊 Vector search: ${vectorResults.length} résultats`);
      logger.debug(`📊 BM25 search: ${bm25Results.length} résultats`);

      const fused = fuseWithRRF(vectorResults, bm25Results);
      logger.debug(`📊 RRF fusion: ${fused.length} candidats uniques`);

      if (fused.length === 0) {
        logger.debug('⚠️ Aucun candidat après fusion — trigger enrichissement on-demand');
        await logSearch(query, 0);
        triggerOnDemandEnrich(queryPubmed);
        return [];
      }

      // Cohere rerank avec query EN pour matching optimal
      const reranked = await rerankWithCohere(queryVector, fused, 5);
      logger.debug(`📊 Cohere rerank: top ${reranked.length} renvoyés`);

      // Seuil de pertinence Cohere : si le meilleur score < seuil, trigger enrichissement PubMed en background
      const RELEVANCE_THRESHOLD = 0.75;
      const bestScore = reranked[0]?.relevanceScore || reranked[0]?.similarity || 0;

      if (bestScore < RELEVANCE_THRESHOLD) {
        logger.info(`⚠️ Meilleur score Cohere (${bestScore.toFixed(3)}) < seuil ${RELEVANCE_THRESHOLD} — trigger enrichissement PubMed en background`);
        triggerOnDemandEnrich(queryPubmed);
      }

      // Retourner les résultats même si enrichissement déclenché (réponse immédiate + meilleurs résultats la prochaine fois)
      logger.info(`✅ Recherche hybride biblio terminée: ${reranked.length} résultats (best score: ${bestScore.toFixed(3)})`);
      await logSearch(query, reranked.length);
      return reranked;
    }

    // IA Clinique → pipeline hybride dédié (Vector + BM25 → RRF → Rerank)
    if (iaType === 'clinique') {
      logger.debug('🩺 ═══════════════════════════════════════════════════════');
      logger.debug('🩺 IA CLINIQUE - DÉBUT PIPELINE HYBRIDE');
      logger.debug(`🩺 Query: "${query}"`);
      logger.debug('🩺 Table: clinical_chunks | Embedding: text-embedding-3-large (1536d)');
      logger.debug('🩺 ═══════════════════════════════════════════════════════');

      const queryEmbedding = await generateEmbedding(query, iaType);
      logger.debug(`🩺 [1/4] Embedding généré (${queryEmbedding.length} dimensions)`);

      const [vectorResults, bm25Results] = await Promise.all([
        searchDocumentsWithEmbedding(queryEmbedding, {
          matchThreshold: 0.3,
          matchCount: 15,
          metadataFilters: {},
          iaType: 'clinique'
        }),
        searchClinicalChunksBM25(query, 15)
      ]);

      logger.debug(`🩺 [2/4] Vector search: ${vectorResults.length} résultats`);
      vectorResults.slice(0, 5).forEach((doc, i) => {
        logger.debug(`🩺   Vector #${i + 1}: ${doc.entity_id || doc.id} | sim=${(doc.similarity || 0).toFixed(3)} | type=${doc.entity_type || '?'} | ${(doc.content || '').substring(0, 80)}...`);
      });

      logger.debug(`🩺 [2/4] BM25 search: ${bm25Results.length} résultats`);
      bm25Results.slice(0, 5).forEach((doc, i) => {
        logger.debug(`🩺   BM25 #${i + 1}: ${doc.entity_id || doc.id} | rank=${doc.similarity?.toFixed(6) || '?'} | type=${doc.entity_type || '?'} | ${(doc.content || '').substring(0, 80)}...`);
      });

      const fused = fuseWithRRF(vectorResults, bm25Results);
      logger.debug(`🩺 [3/4] RRF fusion: ${fused.length} candidats uniques`);
      fused.slice(0, 8).forEach((doc, i) => {
        logger.debug(`🩺   RRF #${i + 1}: ${doc.entity_id || doc.id} | rrfScore=${doc.rrfScore?.toFixed(4)} | source=${doc.searchSource} | type=${doc.entity_type || doc.metadata?.entity_type || '?'}`);
      });

      if (fused.length === 0) {
        logger.debug('🩺 ⚠️ Aucun candidat après fusion — retour vide');
        logger.debug('🩺 ═══════════════════════════════════════════════════════');
        await logSearch(query, 0);
        return [];
      }

      const reranked = await rerankWithCohere(query, fused, 6);
      logger.debug(`🩺 [4/4] Cohere rerank: ${reranked.length} résultats finaux`);
      reranked.forEach((doc, i) => {
        logger.debug(`🩺   Final #${i + 1}: ${doc.entity_id || doc.id} | cohereScore=${(doc.relevanceScore || doc.similarity || 0).toFixed(3)} | source=${doc.searchSource} | type=${doc.entity_type || doc.metadata?.entity_type || '?'} | ${(doc.metadata?.nom || '').substring(0, 60)}`);
      });

      logger.debug('🩺 ═══════════════════════════════════════════════════════');
      logger.info(`✅ Recherche hybride clinique terminée: ${reranked.length} résultats`);
      await logSearch(query, reranked.length);
      return reranked;
    }

    // IA Basique → pipeline hybride multi-table (studies_v2 + clinical_chunks)
    logger.debug('💬 ═══════════════════════════════════════════════════════');
    logger.debug('💬 IA BASIQUE - DÉBUT PIPELINE HYBRIDE MULTI-TABLE');
    logger.debug(`💬 Query: "${query}"`);
    logger.debug('💬 Tables: studies_v2 + clinical_chunks | Embedding: text-embedding-3-large (1536d)');
    logger.debug('💬 ═══════════════════════════════════════════════════════');

    // Embedding text-embedding-3-large (même modèle que les 2 tables)
    const queryEmbedding = await generateEmbedding(query, 'biblio');
    logger.debug(`💬 [1/5] Embedding généré (${queryEmbedding.length} dimensions)`);

    // 4 recherches en parallèle : vector+BM25 sur chaque table
    const [vectorStudies, bm25Studies, vectorClinical, bm25Clinical] = await Promise.all([
      searchDocumentsWithEmbedding(queryEmbedding, {
        matchThreshold: 0.3,
        matchCount: 5,
        metadataFilters: {},
        iaType: 'biblio'
      }),
      searchStudiesBM25(query, 5),
      searchDocumentsWithEmbedding(queryEmbedding, {
        matchThreshold: 0.3,
        matchCount: 5,
        metadataFilters: {},
        iaType: 'clinique'
      }),
      searchClinicalChunksBM25(query, 5)
    ]);

    logger.debug(`💬 [2/5] studies_v2 — Vector: ${vectorStudies.length} résultats, BM25: ${bm25Studies.length} résultats`);
    vectorStudies.slice(0, 3).forEach((doc, i) => {
      logger.debug(`💬   studies Vector #${i + 1}: ${doc.study_id || doc.id} | sim=${(doc.similarity || 0).toFixed(3)} | ${(doc.content || '').substring(0, 80)}...`);
    });
    bm25Studies.slice(0, 3).forEach((doc, i) => {
      logger.debug(`💬   studies BM25 #${i + 1}: ${doc.study_id || doc.id} | rank=${doc.similarity?.toFixed(6) || '?'} | ${(doc.content || '').substring(0, 80)}...`);
    });

    logger.debug(`💬 [2/5] clinical_chunks — Vector: ${vectorClinical.length} résultats, BM25: ${bm25Clinical.length} résultats`);
    vectorClinical.slice(0, 3).forEach((doc, i) => {
      logger.debug(`💬   clinical Vector #${i + 1}: ${doc.entity_id || doc.id} | sim=${(doc.similarity || 0).toFixed(3)} | type=${doc.entity_type || '?'} | ${(doc.content || '').substring(0, 80)}...`);
    });
    bm25Clinical.slice(0, 3).forEach((doc, i) => {
      logger.debug(`💬   clinical BM25 #${i + 1}: ${doc.entity_id || doc.id} | rank=${doc.similarity?.toFixed(6) || '?'} | type=${doc.entity_type || '?'} | ${(doc.content || '').substring(0, 80)}...`);
    });

    // RRF par table → top 3 de chaque
    const fusedStudies = fuseWithRRF(vectorStudies, bm25Studies).slice(0, 3);
    const fusedClinical = fuseWithRRF(vectorClinical, bm25Clinical).slice(0, 3);

    logger.debug(`💬 [3/5] RRF studies_v2: ${fusedStudies.length} candidats`);
    fusedStudies.forEach((doc, i) => {
      logger.debug(`💬   RRF studies #${i + 1}: ${doc.study_id || doc.id} | rrfScore=${doc.rrfScore?.toFixed(4)} | source=${doc.searchSource}`);
    });
    logger.debug(`💬 [3/5] RRF clinical: ${fusedClinical.length} candidats`);
    fusedClinical.forEach((doc, i) => {
      logger.debug(`💬   RRF clinical #${i + 1}: ${doc.entity_id || doc.id} | rrfScore=${doc.rrfScore?.toFixed(4)} | source=${doc.searchSource} | type=${doc.entity_type || doc.metadata?.entity_type || '?'}`);
    });

    // Merge les 6 candidats max
    const allCandidates = [...fusedStudies, ...fusedClinical];
    logger.debug(`💬 [4/5] Merge: ${allCandidates.length} candidats (${fusedStudies.length} études + ${fusedClinical.length} clinique)`);

    if (allCandidates.length === 0) {
      logger.debug('💬 ⚠️ Aucun candidat après fusion — retour vide');
      logger.debug('💬 ═══════════════════════════════════════════════════════');
      await logSearch(query, 0);
      return [];
    }

    // Cohere rerank → top 3
    const reranked = await rerankWithCohere(query, allCandidates, 3);
    logger.debug(`💬 [5/5] Cohere rerank: ${reranked.length} résultats finaux`);
    reranked.forEach((doc, i) => {
      const id = doc.study_id || doc.entity_id || doc.id;
      const type = doc.entity_type || doc.metadata?.entity_type || 'study';
      const name = doc.metadata?.nom || doc.metadata?.titre || '';
      logger.debug(`💬   Final #${i + 1}: ${id} | cohereScore=${(doc.relevanceScore || doc.similarity || 0).toFixed(3)} | source=${doc.searchSource} | type=${type}${name ? ` | ${name.substring(0, 50)}` : ''}`);
    });

    logger.debug('💬 ═══════════════════════════════════════════════════════');
    logger.info(`✅ Recherche hybride basique terminée: ${reranked.length} résultats`);
    await logSearch(query, reranked.length);

    return reranked;
  } catch (error) {
    logger.error('❌ Erreur recherche optimisée:', error);
    throw error;
  }
}

/**
 * Recherche avec embedding pré-généré (pour éviter la duplication)
 * MODIFIÉ: Support des fonctions SQL spécialisées par type d'IA
 */
async function searchDocumentsWithEmbedding(queryEmbedding, options = {}) {
  try {
    const {
      matchThreshold = 0.3,
      matchCount = 10,
      filterCategory = null,
      metadataFilters = {},
      iaType = 'basique'
    } = options;

    logger.debug(`🎯 APPEL searchDocumentsWithEmbedding - IA ${iaType} - Seuil: ${matchThreshold}, Filtres: ${JSON.stringify(metadataFilters)}`);

    let data, error;

    // 🆕 APPEL SPÉCIALISÉ PAR TYPE D'IA
    if (iaType === 'biblio') {
      logger.debug(`🔬 IA BIBLIO - Appel search_studies_v2 (embedding: text-embedding-3-large)`);

      const result = await supabase.rpc('search_studies_v2', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount
      });

      data = result.data;
      error = result.error;

    } else if (iaType === 'clinique') {
      logger.debug(`🩺 IA CLINIQUE - Appel search_clinical_chunks (embedding: text-embedding-3-large)`);

      const result = await supabase.rpc('search_clinical_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount
      });

      data = result.data;
      error = result.error;

    } else {
      // IA Basique - fonction simple sans filtres
      logger.debug(`💬 IA ${iaType} - Fonction simple search_documents (sans filtres)`);

      const result = await supabase.rpc('search_documents', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount
      });

      data = result.data;
      error = result.error;
    }

    if (error) {
      logger.error('❌ Erreur recherche Supabase:', error);
      logger.debug(`⚠️ Fonction SQL non trouvée pour IA ${iaType}. Vérifiez que la fonction est créée dans Supabase !`);
      return [];
    }

    if (!data || data.length === 0) {
      // Messages de debug spécifiques selon le type d'IA
      if (Object.keys(metadataFilters).length > 0) {
        if (metadataFilters.type_contenu && metadataFilters.pathologies) {
          logger.debug(`⚠️ IA ${iaType} - Aucun document ${metadataFilters.type_contenu} pour pathologies: ${metadataFilters.pathologies.join(', ')}`);
        } else if (metadataFilters.pathologies) {
          logger.debug(`⚠️ IA ${iaType} - Aucun document pour pathologies: ${metadataFilters.pathologies.join(', ')}`);
        } else {
          logger.debug(`⚠️ IA ${iaType} - Aucun document ${metadataFilters.type_contenu} trouvé`);
        }
      }
      logger.debug(`🔍 RETOUR VIDE - Seuil: ${matchThreshold}, Filtres: ${JSON.stringify(metadataFilters)}`);
      return [];
    }

    // Enrichissement des résultats avec métadonnées utiles + info IA
    const enrichedResults = data.map((doc, index) => ({
      ...doc,
      searchRank: index + 1,
      similarityPercentage: Math.round(doc.similarity * 100),
      contentLength: doc.content ? doc.content.length : 0,
      hasMetadata: !!doc.metadata,
      created_at: doc.created_at || new Date().toISOString(),
      ageInDays: doc.created_at ? 
        Math.floor((new Date() - new Date(doc.created_at)) / (1000 * 60 * 60 * 24)) : 0,
      metadataFiltered: Object.keys(metadataFilters).length > 0,
      iaType: iaType,  // Ajout du type d'IA pour debug
      appliedFilters: metadataFilters  // Ajout des filtres appliqués
    }));

    logger.debug(`✅ IA ${iaType} - ${enrichedResults.length} documents trouvés avec filtres:`, Object.keys(metadataFilters));
    logger.debug(`🎯 SUCCÈS DATA - Seuil: ${matchThreshold}, Count: ${enrichedResults.length}, Premier titre: "${enrichedResults[0]?.title || 'N/A'}"`);
    return enrichedResults;
  } catch (error) {
    logger.error('❌ Erreur recherche avec embedding:', error);
    throw error;
  }
}

/**
 * Fallback legacy avec embedding pré-généré
 */
async function searchDocumentsLegacyWithEmbedding(queryEmbedding, options = {}) {
  const {
    matchThreshold = 0.3,
    matchCount = 10,
    filterCategory = null
  } = options;

  logger.debug('🔍 Recherche legacy avec embedding pré-généré');
  
  logger.debug('🚨 APPEL LEGACY search_documents (SANS FILTRES) - CECI EXPLIQUE LE BUG !');
  const { data, error } = await supabase.rpc('search_documents', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_category: filterCategory
  });

  if (error) {
    logger.error('❌ Erreur recherche legacy:', error);
    throw error;
  }

  return data || [];
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
    logger.error('❌ Erreur stats documents:', error);
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
      logger.error('❌ Erreur listage documents:', error);
      throw error;
    }

    // Enrichissement avec informations d'optimisation
    const enrichedData = data.map(doc => ({
      ...doc,
      isOptimized: !!(doc.metadata?.ol && doc.metadata?.cl),
      spaceSaving: doc.metadata?.ol && doc.metadata?.cl ? 
        Math.round(((doc.metadata.ol - doc.metadata.cl) / doc.metadata.ol) * 100) + '%' : 'N/A'
    }));

    logger.debug(`📋 ${enrichedData.length} documents récupérés`);
    return enrichedData;

  } catch (error) {
    logger.error('❌ Erreur listage:', error);
    throw error;
  }
}

/**
 * Supprime un document de la base vectorielle
 */
async function deleteDocument(documentId) {
  try {
    logger.debug('🗑️ Suppression document ID:', documentId);

    const { data, error } = await supabase
      .from('documents_kine')
      .delete()
      .eq('id', documentId)
      .select()
      .single();

    if (error) {
      logger.error('❌ Erreur suppression:', error);
      throw error;
    }

    logger.debug('✅ Document supprimé:', data.title);
    return data;

  } catch (error) {
    logger.error('❌ Erreur suppression document:', error);
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
    logger.debug('🧹 Nettoyage des doublons...');
    
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

    logger.debug(`🔍 Trouvé ${duplicates.length} doublons potentiels`);

    // Suppression des doublons confirmés
    let deletedCount = 0;
    for (const { duplicate, original } of duplicates) {
      const similarity = calculateContentSimilarity(duplicate.content, original.content);
      
      if (similarity > 0.95) { // 95% de similarité = doublon certain
        await deleteDocument(duplicate.id);
        deletedCount++;
        logger.debug(`🗑️ Doublon supprimé: ${duplicate.title}`);
      }
    }

    logger.debug(`✅ ${deletedCount} doublons supprimés`);
    return { deletedCount, scannedCount: allDocs.length };

  } catch (error) {
    logger.error('❌ Erreur nettoyage doublons:', error);
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
      logger.warn('⚠️ Erreur log recherche:', error.message);
    }
  } catch (error) {
    logger.warn('⚠️ Log recherche ignoré:', error.message);
  }
}

/**
 * Test la connectivité et le bon fonctionnement de la base vectorielle
 */
async function testVectorDatabase() {
  try {
    logger.debug('🔧 Test base vectorielle...');

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

    logger.info('✅ Base vectorielle opérationnelle');
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
    logger.error('❌ Erreur test base vectorielle:', error);
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
// 🔬 PIPELINE HYBRIDE BIBLIO (BM25 + RRF + RERANK)
// ==========================================

/**
 * Recherche vectorielle cosine dans studies_v3 (PubMed FR)
 */
async function searchStudiesV3Vector(queryEmbedding, matchThreshold = 0.3, matchCount = 15) {
  try {
    logger.debug(`🔬 V3 Vector search (threshold: ${matchThreshold}, max ${matchCount})`);

    const { data, error } = await supabase.rpc('search_studies_v3', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount
    });

    if (error) {
      logger.error('❌ Erreur V3 vector search:', error);
      return [];
    }

    return (data || []).map((doc, index) => ({
      ...doc,
      study_id: doc.pmid,
      searchRank: index + 1,
      similarityPercentage: Math.round((doc.similarity || 0) * 100),
      contentLength: doc.content ? doc.content.length : 0,
      iaType: 'biblio',
      searchSource: 'vector'
    }));
  } catch (error) {
    logger.error('❌ Erreur V3 vector search:', error);
    return [];
  }
}

/**
 * Recherche BM25 (mots-clés) dans studies_v3 via tsvector
 */
async function searchStudiesV3BM25(query, matchCount = 15) {
  try {
    logger.debug(`🔤 V3 BM25 search: "${query.substring(0, 80)}..." (max ${matchCount})`);

    const { data, error } = await supabase.rpc('search_studies_v3_bm25', {
      query_text: query,
      match_count: matchCount
    });

    if (error) {
      logger.error('❌ Erreur V3 BM25 search:', error);
      return [];
    }

    return (data || []).map((doc, index) => ({
      ...doc,
      study_id: doc.pmid,
      searchRank: index + 1,
      similarityPercentage: Math.round((doc.similarity || 0) * 100),
      contentLength: doc.content ? doc.content.length : 0,
      iaType: 'biblio',
      searchSource: 'bm25'
    }));
  } catch (error) {
    logger.error('❌ Erreur V3 BM25 search:', error);
    return [];
  }
}

/**
 * Recherche BM25 (mots-clés) dans studies_v2 via tsvector
 */
async function searchStudiesBM25(query, matchCount = 15) {
  try {
    logger.debug(`🔤 BM25 search: "${query.substring(0, 80)}..." (max ${matchCount})`);

    const { data, error } = await supabase.rpc('search_studies_v2_bm25', {
      query_text: query,
      match_count: matchCount
    });

    if (error) {
      logger.error('❌ Erreur BM25 search:', error);
      return [];
    }

    return (data || []).map((doc, index) => ({
      ...doc,
      searchRank: index + 1,
      similarityPercentage: Math.round((doc.similarity || 0) * 100),
      contentLength: doc.content ? doc.content.length : 0,
      hasMetadata: !!doc.metadata,
      iaType: 'biblio',
      searchSource: 'bm25'
    }));
  } catch (error) {
    logger.error('❌ Erreur BM25 search:', error);
    return [];
  }
}

/**
 * Recherche BM25 (mots-clés) dans clinical_chunks via tsvector
 */
async function searchClinicalChunksBM25(query, matchCount = 15) {
  try {
    logger.debug(`🔤 Clinical BM25 search: "${query.substring(0, 80)}..." (max ${matchCount})`);

    const { data, error } = await supabase.rpc('search_clinical_chunks_bm25', {
      query_text: query,
      match_count: matchCount
    });

    if (error) {
      logger.error('❌ Erreur Clinical BM25 search:', error);
      return [];
    }

    return (data || []).map((doc, index) => ({
      ...doc,
      searchRank: index + 1,
      similarityPercentage: Math.round((doc.similarity || 0) * 100),
      contentLength: doc.content ? doc.content.length : 0,
      hasMetadata: !!doc.metadata,
      iaType: 'clinique',
      searchSource: 'bm25'
    }));
  } catch (error) {
    logger.error('❌ Erreur Clinical BM25 search:', error);
    return [];
  }
}

/**
 * Reciprocal Rank Fusion — fusionne vector + BM25, déduplique par study_id
 */
function fuseWithRRF(vectorResults, bm25Results, k = 60) {
  const scores = new Map();

  vectorResults.forEach((doc, rank) => {
    const key = doc.study_id || doc.entity_id || doc.id;
    const rrf = 1 / (k + rank + 1);
    if (scores.has(key)) {
      scores.get(key).score += rrf;
    } else {
      scores.set(key, { score: rrf, doc: { ...doc, searchSource: 'vector' } });
    }
  });

  bm25Results.forEach((doc, rank) => {
    const key = doc.study_id || doc.entity_id || doc.id;
    const rrf = 1 / (k + rank + 1);
    if (scores.has(key)) {
      scores.get(key).score += rrf;
      scores.get(key).doc.searchSource = 'both';
    } else {
      scores.set(key, { score: rrf, doc: { ...doc, searchSource: 'bm25' } });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((entry, index) => ({
      ...entry.doc,
      rrfScore: entry.score,
      searchRank: index + 1
    }));
}

/**
 * Cohere Rerank v3.5 — reclass les candidats par pertinence
 * Input: array de strings (content) | Output: { index, relevanceScore }
 */
async function rerankWithCohere(query, candidates, topN = 5) {
  try {
    if (!process.env.COHERE_API_KEY) {
      logger.warn('⚠️ COHERE_API_KEY manquante — rerank ignoré, retour top N par RRF');
      return candidates.slice(0, topN);
    }

    if (candidates.length === 0) return [];

    const { CohereClient } = require('cohere-ai');
    const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

    // Utiliser abstract EN si disponible (biblio), sinon content (clinique/basique)
    const documents = candidates.map(doc =>
      doc.abstract ? `${doc.title || ''} ${doc.abstract}` : doc.content
    );

    const response = await cohere.rerank({
      model: 'rerank-v3.5',
      query,
      documents,
      topN
    });

    return response.results.map((result, index) => ({
      ...candidates[result.index],
      relevanceScore: result.relevanceScore,
      similarity: result.relevanceScore,
      similarityPercentage: Math.round(result.relevanceScore * 100),
      searchRank: index + 1,
      reranked: true
    }));
  } catch (error) {
    logger.error('❌ Erreur Cohere rerank:', error);
    logger.warn('⚠️ Fallback: retour top N par RRF score');
    return candidates.slice(0, topN);
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
  rewriteQueryToEnglish, // Query rewriter FR → EN pour biblio
  
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