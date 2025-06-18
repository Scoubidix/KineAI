// controllers/chatKineController.js
const chatKineService = require('../services/chatKineService');

class ChatKineController {
  async sendMessage(req, res) {
    try {
      const { message } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      // Récupérer le kineId depuis la base de données avec l'UID Firebase
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message requis' });
      }

      const response = await chatKineService.sendMessage(kineId, message);
      
      res.json({ 
        success: true, 
        response: response 
      });
    } catch (error) {
      console.error('Erreur ChatKineController:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  // ========== CHAT ENHANCED avec votre fonction Supabase ==========
  async sendMessageEnhanced(req, res) {
    try {
      const { message, conversationHistory = [] } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      // Récupérer le kineId
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }

      const kineId = kine.id;

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message requis' });
      }

      console.log('🚀 Chat Enhanced pour kiné:', firebaseUid);

      // 1. Recherche vectorielle avec VOTRE fonction Supabase optimisée
      let allDocuments = [];
      let selectedSources = [];
      let searchMetadata = {
        totalFound: 0,
        averageScore: 0,
        categoriesFound: [],
        usedOptimizedSearch: false
      };

      try {
        const { searchDocumentsOptimized } = require('../services/embeddingService');
        
        // 🎯 Utilise VOTRE fonction avec seuils optimisés (0.7 puis 0.4 si besoin)
        const searchResults = await searchDocumentsOptimized(message, {
          filterCategory: null,
          allowLowerThreshold: true // Autorise le fallback vers seuil bas
        });
        
        if (searchResults && searchResults.length > 0) {
          // Appliquer le scoring intelligent sur les résultats de VOTRE fonction
          allDocuments = applyIntelligentScoring(searchResults, message);
          
          // Sélectionner les 3 meilleures sources pour l'affichage
          selectedSources = selectTopSources(allDocuments, 3);
          
          searchMetadata = {
            totalFound: searchResults.length,
            averageScore: allDocuments.length > 0 ? 
              allDocuments.reduce((sum, doc) => sum + doc.finalScore, 0) / allDocuments.length : 0,
            categoriesFound: [...new Set(allDocuments.map(d => d.category).filter(Boolean))],
            usedOptimizedSearch: true,
            highThresholdResults: searchResults.filter(doc => doc.similarity > 0.7).length,
            lowThresholdResults: searchResults.filter(doc => doc.similarity <= 0.7).length
          };
          
          console.log(`🔍 Fonction Supabase: ${allDocuments.length} docs scorés`);
          console.log(`📊 Seuil élevé: ${searchMetadata.highThresholdResults}, Seuil bas: ${searchMetadata.lowThresholdResults}`);
          console.log(`🎯 Top 3 sélectionnés pour affichage`);
        }
        
      } catch (searchError) {
        console.warn('⚠️ Erreur recherche vectorielle:', searchError.message);
        // Continuer avec les tableaux vides - fallback vers chat classique
      }

      // 2. Construction du prompt avec contexte intelligent
      const systemPrompt = buildEnhancedSystemPrompt(allDocuments.slice(0, 6)); // Max 6 pour l'IA
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-6),
        { role: 'user', content: message }
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 1000,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const aiResponse = completion.choices[0].message.content;

      // 3. Sauvegarder en SQL
      try {
        await saveEnhancedToSQL(kineId, message, aiResponse);
        console.log('💾 Conversation Enhanced sauvegardée');
      } catch (saveError) {
        console.error('⚠️ Erreur sauvegarde:', saveError.message);
      }

      // 4. Calculer la confiance globale
      const overallConfidence = calculateOverallConfidence(allDocuments);

      // 5. Réponse structurée pour le frontend
      const response = {
        success: true,
        message: aiResponse,
        sources: selectedSources.map(doc => ({
          title: doc.title,
          category: doc.category || 'Général',
          similarity: `${Math.round(doc.finalScore * 100)}%`,
          confidence: Math.round(doc.finalScore * 100),
          relevanceLevel: getRelevanceLevel(doc.finalScore),
          rank: doc.rank,
          preview: doc.content ? doc.content.substring(0, 120) + '...' : ''
        })),
        confidence: overallConfidence,
        metadata: {
          model: 'gpt-3.5-turbo',
          kineId: kine.id,
          firebaseUid: firebaseUid,
          enhanced: true,
          documentsFound: searchMetadata.totalFound,
          documentsUsedForAI: Math.min(allDocuments.length, 6),
          documentsDisplayed: selectedSources.length,
          averageRelevance: Math.round(searchMetadata.averageScore * 100),
          categoriesFound: searchMetadata.categoriesFound,
          hasHighQualityContext: allDocuments.some(doc => doc.finalScore > 0.8),
          supabaseFunction: 'search_documents', // Indique qu'on utilise votre fonction
          searchStrategy: {
            highThreshold: searchMetadata.highThresholdResults || 0,
            lowThreshold: searchMetadata.lowThresholdResults || 0,
            usedFallback: (searchMetadata.lowThresholdResults || 0) > 0
          },
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ Enhanced via fonction Supabase - Confiance: ${Math.round(overallConfidence * 100)}%`);
      res.json(response);

    } catch (error) {
      console.error('❌ Erreur sendMessageEnhanced:', error);
      
      // Fallback vers la méthode classique
      try {
        console.log('🔄 Fallback automatique vers méthode classique...');
        const { message } = req.body;
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        const kine = await prisma.kine.findUnique({
          where: { uid: req.uid }
        });

        if (kine) {
          const classicResponse = await chatKineService.sendMessage(kine.id, message);
          
          return res.json({
            success: true,
            message: classicResponse,
            sources: [],
            confidence: 0.5,
            metadata: {
              enhanced: false,
              fallback: true,
              fallbackReason: error.message,
              kineId: kine.id,
              supabaseFunction: 'none',
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (fallbackError) {
        console.error('❌ Erreur fallback:', fallbackError);
      }

      res.status(500).json({
        success: false,
        error: 'Erreur lors de la génération de la réponse enhanced',
        details: error.message
      });
    }
  }

  async getHistory(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      // Récupérer le kineId depuis la base de données
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;
      const days = parseInt(req.query.days) || 5;

      const history = await chatKineService.getHistory(kineId, days);
      
      res.json({ 
        success: true, 
        history: history 
      });
    } catch (error) {
      console.error('Erreur getHistory:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async clearHistory(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      // Récupérer le kineId depuis la base de données
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      await chatKineService.clearHistory(kineId);
      
      res.json({ 
        success: true, 
        message: 'Historique supprimé' 
      });
    } catch (error) {
      console.error('Erreur clearHistory:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }
}

// ========== FONCTIONS HELPER POUR LE SCORING INTELLIGENT ==========

/**
 * Applique un scoring intelligent aux résultats de VOTRE fonction Supabase
 */
function applyIntelligentScoring(documents, query) {
  return documents.map((doc, index) => {
    let finalScore = doc.similarity; // Score de base de votre fonction Supabase

    // Bonus mots-clés exacts (+5% par mot-clé pertinent)
    const exactMatches = countExactMatches(query, doc.content);
    finalScore += (exactMatches * 0.05);

    // Bonus documents récents (+3% si moins de 30 jours)
    const docAge = getDocumentAge(doc.created_at);
    if (docAge < 30) {
      finalScore += 0.03;
    }

    // Bonus catégories importantes en kinésithérapie (+8%)
    const importantCategories = [
      'exercices', 'protocole', 'pathologie', 'rééducation', 
      'anatomie', 'technique', 'evaluation', 'traitement',
      'exercice', 'reeduc', 'kine', 'physio'
    ];
    
    if (doc.category && importantCategories.some(cat => 
      doc.category.toLowerCase().includes(cat))) {
      finalScore += 0.08;
    }

    // Malus documents trop courts (-2%)
    if (doc.content && doc.content.length < 200) {
      finalScore -= 0.02;
    }

    // Bonus longueur optimale (+3% pour 500-2000 caractères)
    if (doc.content && doc.content.length >= 500 && doc.content.length <= 2000) {
      finalScore += 0.03;
    }

    // Bonus si le titre contient des mots de la query (+3%)
    if (doc.title && containsQueryWords(query, doc.title)) {
      finalScore += 0.03;
    }

    return {
      ...doc,
      finalScore: Math.min(finalScore, 1.0), // Cap à 100%
      originalSimilarity: doc.similarity,
      rank: index + 1
    };
  }).sort((a, b) => b.finalScore - a.finalScore); // Tri par score décroissant
}

/**
 * Sélectionne les meilleures sources en évitant les doublons
 */
function selectTopSources(documents, maxCount = 3) {
  const selected = [];
  const usedCategories = new Set();
  
  for (const doc of documents) {
    if (selected.length >= maxCount) break;
    
    // Premier document : toujours pris (le meilleur)
    if (selected.length === 0) {
      selected.push(doc);
      if (doc.category) usedCategories.add(doc.category);
      continue;
    }
    
    // Vérifier si le document apporte de la valeur
    const isDifferentCategory = !doc.category || !usedCategories.has(doc.category);
    const hasGoodScore = doc.finalScore > 0.6; // 60% minimum après scoring
    const isExcellent = doc.finalScore > 0.85; // 85% = toujours prendre
    
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
 * Calcule la confiance globale de la réponse
 */
function calculateOverallConfidence(documents) {
  if (documents.length === 0) return 0.5; // Confiance moyenne sans documents
  
  const averageScore = documents.reduce((sum, doc) => sum + doc.finalScore, 0) / documents.length;
  const bestScore = Math.max(...documents.map(doc => doc.finalScore));
  
  // Pondération : 70% meilleur score + 30% moyenne
  return (bestScore * 0.7) + (averageScore * 0.3);
}

/**
 * Compte les correspondances exactes de mots
 */
function countExactMatches(query, content) {
  if (!content) return 0;
  
  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3); // Mots de plus de 3 caractères
  
  const contentLower = content.toLowerCase();
  
  return queryWords.filter(word => contentLower.includes(word)).length;
}

/**
 * Vérifie si le titre contient des mots de la query
 */
function containsQueryWords(query, title) {
  if (!title) return false;
  
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const titleLower = title.toLowerCase();
  
  return queryWords.some(word => titleLower.includes(word));
}

/**
 * Calcule l'âge d'un document en jours
 */
function getDocumentAge(createdAt) {
  if (!createdAt) return 365; // Très ancien si pas de date
  const now = new Date();
  const docDate = new Date(createdAt);
  return Math.floor((now - docDate) / (1000 * 60 * 60 * 24));
}

/**
 * Détermine le niveau de pertinence
 */
function getRelevanceLevel(score) {
  if (score >= 0.9) return 'Excellente';
  if (score >= 0.8) return 'Très bonne';
  if (score >= 0.7) return 'Bonne';
  return 'Correcte';
}

// ========== FONCTIONS HELPER EXISTANTES (conservées) ==========
async function saveEnhancedToSQL(kineId, message, response) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  await prisma.chatKine.create({
    data: {
      kineId: kineId,
      message: message,
      response: response
    }
  });
}

function buildEnhancedSystemPrompt(contextDocuments) {
  let systemPrompt = `ATTENTION : Tu parles à un KINÉSITHÉRAPEUTE PROFESSIONNEL, PAS à un patient !

Tu es un assistant IA pour AIDER LES KINÉSITHÉRAPEUTES dans leur travail. L'utilisateur qui te parle est un kinésithérapeute diplômé qui traite des patients.

RÔLE : Assistant technique pour kinésithérapeutes
UTILISATEUR : Un kinésithérapeute professionnel (pas un patient)
OBJECTIF : Donner des conseils thérapeutiques professionnels

CONTEXTE :
Un kinésithérapeute te demande des conseils sur comment traiter SES PATIENTS. 
- Donne des recommandations de THÉRAPEUTE à THÉRAPEUTE
- Utilise le vocabulaire technique approprié
- Suggère des protocoles de traitement pour SES PATIENTS
- Parle des techniques qu'IL PEUT APPLIQUER à ses patients

FORMULATION CORRECTE :
❌ "Il est essentiel de suivre les recommandations de votre chirurgien"
✅ "Pour vos patients post-évidement cervical, recommandez-leur de suivre..."
✅ "Dans votre pratique, vous pouvez appliquer ce protocole..."
✅ "Pour la prise en charge de cette pathologie, je suggère..."`;

  // Ajouter le contexte vectoriel avec scoring
  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS DE RÉFÉRENCE PROFESSIONNELS (sélectionnés par pertinence via recherche vectorielle) :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      const originalScore = Math.round(doc.originalSimilarity * 100);
      
      systemPrompt += `📄 Document ${index + 1} (Score: ${score}%, Similarité: ${originalScore}%) - "${doc.title}" [${doc.category || 'Général'}] :
${doc.content.substring(0, 800)}

`;
    });

    systemPrompt += `Ces documents sont vos références professionnelles les plus pertinentes trouvées par recherche vectorielle. Base tes conseils prioritairement sur ces sources validées.`;
  }

  systemPrompt += `\n\nINSTRUCTIONS ABSOLUES :
- TOUJOURS s'adresser au kinésithérapeute, jamais au patient
- Donner des conseils de professionnel à professionnel
- Suggérer des techniques qu'IL peut utiliser avec SES patients
- Utiliser "vos patients", "dans votre pratique", "je vous recommande"
- Rester dans le cadre de conseils entre confrères kinésithérapeutes
- Privilégier les informations des documents fournis quand ils sont pertinents
- Être précis et technique dans tes recommandations`;

  return systemPrompt;
}

module.exports = new ChatKineController();