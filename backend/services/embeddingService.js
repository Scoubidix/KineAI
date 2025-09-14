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
      // IA Biblio : TOUJOURS filtrer sur type_contenu = 'etude' + pathologies si détectées
      filters.type_contenu = 'etude';
      if (detectedMetadata.pathologies && detectedMetadata.pathologies.length > 0) {
        filters.pathologies = detectedMetadata.pathologies;
        logger.debug(`🔬 IA Biblio - Filtres: études + pathologies [${detectedMetadata.pathologies.join(', ')}]`);
      } else {
        logger.debug(`🔬 IA Biblio - Filtres: études seulement (aucune pathologie détectée)`);
      }
      logger.debug(`🔬 IA Biblio - Filtres finaux:`, filters);
      break;
      
    case 'clinique':
      // IA Clinique : Pathologies uniquement pour le moment
      // TODO: Ajouter filtre type_contenu = 'livre' quand les chunks livres seront créés
      if (detectedMetadata.pathologies && detectedMetadata.pathologies.length > 0) {
        filters.pathologies = detectedMetadata.pathologies;
      }
      logger.debug(`📚 IA Clinique - Filtres: pathologies seulement (TODO: ajouter livres):`, filters);
      break;
      
    case 'admin':
      // IA Admin : PAS DE RAG - retourner null pour court-circuiter
      logger.debug(`📋 IA Admin - Pas de RAG utilisé`);
      return null;
      
    case 'basique':
    default:
      // IA Basique : Pathologies uniquement (comportement actuel)
      if (detectedMetadata.pathologies && detectedMetadata.pathologies.length > 0) {
        filters.pathologies = detectedMetadata.pathologies;
      }
      logger.debug(`💬 IA Basique - Filtres: pathologies uniquement:`, filters);
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
async function generateEmbedding(text) {
  try {
    const optimizedText = preprocessTextForEmbedding(text);
    
    logger.debug('🔄 Génération embedding pour recherche:', optimizedText.substring(0, 100) + '...');
    
    const response = await openai.embeddings.create({
      model: EMBEDDING_CONFIG.model,
      input: optimizedText,
      dimensions: EMBEDDING_CONFIG.dimensions
    });

    const embedding = response.data[0].embedding;
    logger.debug('✅ Embedding généré:', embedding.length, 'dimensions');
    
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
async function searchDocumentsOptimized(query, options = {}) {
  try {
    const {
      filterCategory = null,
      allowLowerThreshold = true,
      iaType = 'basique'  // NOUVEAU: Type d'IA pour les filtres
    } = options;

    logger.debug(`🔍 Recherche optimisée pour IA ${iaType} avec embedding unique:`, query);
    
    // 🆕 OPTIMISATION: Générer l'embedding UNE SEULE FOIS + filtres par IA
    const detectedMetadata = analyzeQueryForMetadata(query);
    const metadataFilters = buildMetadataFilters(detectedMetadata, iaType);
    
    // Court-circuit pour IA Admin (pas de RAG)
    if (metadataFilters === null) {
      logger.debug('📋 IA Admin - Court-circuit RAG');
      return [];
    }
    
    const queryEmbedding = await generateEmbedding(query);

    // Première tentative avec seuil élevé (haute qualité)
    logger.debug('🔍 Tentative seuil élevé (0.7)...');
    logger.debug('🔍 Filtres seuil élevé:', JSON.stringify(metadataFilters));
    let results = await searchDocumentsWithEmbedding(queryEmbedding, {
      matchThreshold: 0.7,
      matchCount: 3,
      filterCategory,
      metadataFilters,
      iaType  // Passer le type d'IA
    });

    // Si pas assez de résultats, tentative avec seuil plus bas
    if (results.length < 2 && allowLowerThreshold) {
      logger.debug('🔄 Seuil élevé: ' + results.length + ' résultats, tentative seuil bas...');
      logger.debug('🔄 Filtres seuil bas:', JSON.stringify(metadataFilters));
      
      results = await searchDocumentsWithEmbedding(queryEmbedding, {
        matchThreshold: 0.4,
        matchCount: 6,
        filterCategory,
        metadataFilters,
        iaType  // Passer le type d'IA
      });
    }

    logger.info(`✅ Recherche optimisée terminée: ${results.length} résultats`);
    await logSearch(query, results.length);

    return results;
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
      logger.debug(`🔬 IA BIBLIO - Appel fonction spécialisée search_documents_biblio`);
      logger.debug(`🔬 Metadata filters IA Biblio:`, JSON.stringify(metadataFilters));

      const result = await supabase.rpc('search_documents_biblio', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        metadata_filters: JSON.stringify(metadataFilters)
      });

      data = result.data;
      error = result.error;

    } else if (iaType === 'clinique') {
      // TODO: Fonction search_documents_clinique à créer
      logger.debug(`📚 IA CLINIQUE - Fallback fonction générale (TODO: créer search_documents_clinique)`);

      const result = await supabase.rpc('search_documents_with_metadata', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_category: filterCategory,
        metadata_filters: JSON.stringify(metadataFilters)
      });

      data = result.data;
      error = result.error;

    } else {
      // IA Basique ou autres - fonction générale
      logger.debug(`💬 IA ${iaType} - Fonction générale search_documents_with_metadata`);

      const result = await supabase.rpc('search_documents_with_metadata', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_category: filterCategory,
        metadata_filters: JSON.stringify(metadataFilters)
      });

      data = result.data;
      error = result.error;
    }

    if (error) {
      logger.error('❌ Erreur recherche Supabase:', error);
      logger.debug('⚠️ Fonction search_documents_with_metadata non trouvée. Exécutez la fonction SQL dans Supabase !');
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