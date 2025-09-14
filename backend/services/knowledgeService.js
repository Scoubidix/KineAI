// services/knowledgeService.js
const { searchDocumentsOptimized } = require('./embeddingService');
const logger = require('../utils/logger');

class KnowledgeService {
  
  /**
   * Recherche sémantique unifiée pour toutes les IA
   * MODIFIÉ: Support des filtres par type d'IA
   */
  async searchDocuments(message, options = {}) {
    try {
      const searchOptions = {
        filterCategory: options.filterCategory || null,
        allowLowerThreshold: options.allowLowerThreshold !== false, // true par défaut
        iaType: options.iaType || 'basique',  // NOUVEAU: Type d'IA
        ...options
      };

      logger.debug(`🔍 Recherche documentaire IA ${searchOptions.iaType} pour: "${message.substring(0, 50)}..."`); 
      
      const searchResults = await searchDocumentsOptimized(message, searchOptions);
      
      if (!searchResults || searchResults.length === 0) {
        logger.debug(`⚠️ IA ${searchOptions.iaType} - Aucun document trouvé`);
        return {
          allDocuments: [],
          selectedSources: [],
          metadata: {
            totalFound: 0,
            averageScore: 0,
            categoriesFound: [],
            usedOptimizedSearch: true,
            iaType: searchOptions.iaType
          }
        };
      }

      // Scoring intelligent
      const scoredDocuments = this.applyIntelligentScoring(searchResults, message);
      
      // Sélection des meilleures sources
      const selectedSources = this.selectTopSources(scoredDocuments, 3);
      
      // Métadonnées de recherche avec type IA
      const metadata = {
        totalFound: searchResults.length,
        averageScore: scoredDocuments.length > 0 ? 
          scoredDocuments.reduce((sum, doc) => sum + doc.finalScore, 0) / scoredDocuments.length : 0,
        categoriesFound: [...new Set(scoredDocuments.map(d => d.category).filter(Boolean))],
        usedOptimizedSearch: true,
        highThresholdResults: searchResults.filter(doc => doc.similarity > 0.7).length,
        lowThresholdResults: searchResults.filter(doc => doc.similarity <= 0.7).length,
        iaType: searchOptions.iaType,  // NOUVEAU: Type d'IA utilisé
        appliedFilters: searchResults.length > 0 ? searchResults[0].appliedFilters : {}
      };

      logger.debug(`✅ IA ${searchOptions.iaType} - ${scoredDocuments.length} documents scorés, ${selectedSources.length} sources sélectionnées`);
      
      return {
        allDocuments: scoredDocuments,
        selectedSources,
        metadata
      };

    } catch (error) {
      logger.error('❌ Erreur recherche documentaire:', error.message);
      
      return {
        allDocuments: [],
        selectedSources: [],
        metadata: {
          totalFound: 0,
          averageScore: 0,
          categoriesFound: [],
          usedOptimizedSearch: false,
          iaType: options.iaType || 'basique',
          error: error.message
        }
      };
    }
  }

  /**
   * Scoring intelligent des documents
   */
  applyIntelligentScoring(documents, query) {
    return documents.map((doc, index) => {
      let finalScore = doc.similarity;

      // Bonus pour les correspondances exactes
      const exactMatches = this.countExactMatches(query, doc.content);
      finalScore += (exactMatches * 0.05);

      // Bonus pour les documents récents
      const docAge = this.getDocumentAge(doc.created_at);
      if (docAge < 30) {
        finalScore += 0.03;
      }

      // Bonus pour les catégories importantes
      const importantCategories = [
        'exercices', 'protocole', 'pathologie', 'rééducation', 
        'anatomie', 'technique', 'evaluation', 'traitement',
        'exercice', 'reeduc', 'kine', 'physio'
      ];
      
      if (doc.category && importantCategories.some(cat => 
        doc.category.toLowerCase().includes(cat))) {
        finalScore += 0.08;
      }

      // Pénalité pour les documents trop courts
      if (doc.content && doc.content.length < 200) {
        finalScore -= 0.02;
      }

      // Bonus pour les documents de taille optimale
      if (doc.content && doc.content.length >= 500 && doc.content.length <= 2000) {
        finalScore += 0.03;
      }

      // Bonus si le titre contient des mots-clés de la requête
      if (doc.title && this.containsQueryWords(query, doc.title)) {
        finalScore += 0.03;
      }

      return {
        ...doc,
        finalScore: Math.min(finalScore, 1.0),
        originalSimilarity: doc.similarity,
        rank: index + 1
      };
    }).sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Sélection des meilleures sources
   */
  selectTopSources(documents, maxCount = 3) {
    const selected = [];
    const usedCategories = new Set();
    
    for (const doc of documents) {
      if (selected.length >= maxCount) break;
      
      // Premier document toujours pris
      if (selected.length === 0) {
        selected.push(doc);
        if (doc.category) usedCategories.add(doc.category);
        continue;
      }
      
      const isDifferentCategory = !doc.category || !usedCategories.has(doc.category);
      const hasGoodScore = doc.finalScore > 0.6;
      const isExcellent = doc.finalScore > 0.85;
      
      if ((isDifferentCategory && hasGoodScore) || isExcellent) {
        selected.push(doc);
        if (doc.category) usedCategories.add(doc.category);
      }
    }
    
    return selected.map((doc, index) => ({
      ...doc,
      rank: index + 1
    }));
  }

  /**
   * Calcul de confiance globale
   */
  calculateOverallConfidence(documents) {
    if (documents.length === 0) return 0.5;
    
    const averageScore = documents.reduce((sum, doc) => sum + doc.finalScore, 0) / documents.length;
    const bestScore = Math.max(...documents.map(doc => doc.finalScore));
    
    return (bestScore * 0.7) + (averageScore * 0.3);
  }

  /**
   * Compte les correspondances exactes de mots
   */
  countExactMatches(query, content) {
    if (!content) return 0;
    
    const queryWords = query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const contentLower = content.toLowerCase();
    
    return queryWords.filter(word => contentLower.includes(word)).length;
  }

  /**
   * Vérifie si le titre contient des mots de la requête
   */
  containsQueryWords(query, title) {
    if (!title) return false;
    
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const titleLower = title.toLowerCase();
    
    return queryWords.some(word => titleLower.includes(word));
  }

  /**
   * Calcul de l'âge d'un document en jours
   */
  getDocumentAge(createdAt) {
    if (!createdAt) return 365;
    const now = new Date();
    const docDate = new Date(createdAt);
    return Math.floor((now - docDate) / (1000 * 60 * 60 * 24));
  }

  /**
   * Formatage des sources pour la réponse
   */
  formatSources(selectedSources) {
    return selectedSources.map(doc => ({
      title: doc.title,
      category: doc.category || 'Général',
      similarity: `${Math.round(doc.finalScore * 100)}%`,
      confidence: Math.round(doc.finalScore * 100),
      relevanceLevel: this.getRelevanceLevel(doc.finalScore),
      rank: doc.rank,
      preview: doc.content ? doc.content.substring(0, 120) + '...' : ''
    }));
  }

  /**
   * Niveau de pertinence textuel
   */
  getRelevanceLevel(score) {
    if (score >= 0.9) return 'Excellente';
    if (score >= 0.8) return 'Très bonne';
    if (score >= 0.7) return 'Bonne';
    return 'Correcte';
  }
}

module.exports = new KnowledgeService();