// controllers/chatKineController.js
const prismaService = require('../services/prismaService');

class ChatKineController {

  // ========== IA BASIQUE (ex-Enhanced) ==========
  async sendIaBasique(req, res) {
    try {
      const { message, conversationHistory = [] } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      // Récupérer le kineId
      const prisma = prismaService.getInstance();
      
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

      console.log('🚀 IA Basique pour kiné:', firebaseUid);

      // 1. Recherche vectorielle avec fonction Supabase optimisée
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
        
        const searchResults = await searchDocumentsOptimized(message, {
          filterCategory: null,
          allowLowerThreshold: true
        });
        
        if (searchResults && searchResults.length > 0) {
          allDocuments = applyIntelligentScoring(searchResults, message);
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
          
          console.log(`🔍 IA Basique: ${allDocuments.length} docs scorés`);
        }
        
      } catch (searchError) {
        console.warn('⚠️ Erreur recherche vectorielle IA Basique:', searchError.message);
      }

      // 2. Construction du prompt IA Basique
      const systemPrompt = buildBasiqueSystemPrompt(allDocuments.slice(0, 6));
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
        await saveBasiqueToSQL(kineId, message, aiResponse);
        console.log('💾 Conversation IA Basique sauvegardée');
      } catch (saveError) {
        console.error('⚠️ Erreur sauvegarde IA Basique:', saveError.message);
      }

      // 4. Réponse structurée
      const overallConfidence = calculateOverallConfidence(allDocuments);

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
          iaType: 'basique',
          kineId: kine.id,
          firebaseUid: firebaseUid,
          documentsFound: searchMetadata.totalFound,
          documentsUsedForAI: Math.min(allDocuments.length, 6),
          documentsDisplayed: selectedSources.length,
          averageRelevance: Math.round(searchMetadata.averageScore * 100),
          categoriesFound: searchMetadata.categoriesFound,
          hasHighQualityContext: allDocuments.some(doc => doc.finalScore > 0.8),
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ IA Basique - Confiance: ${Math.round(overallConfidence * 100)}%`);
      res.json(response);

    } catch (error) {
      console.error('❌ Erreur sendIaBasique:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la génération de la réponse IA Basique',
        details: error.message
      });
    }
  }

  // ========== IA BIBLIOGRAPHIQUE ==========
  async sendIaBiblio(req, res) {
    try {
      const { message, conversationHistory = [] } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      const prisma = prismaService.getInstance();
      
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

      console.log('📚 IA Biblio pour kiné:', firebaseUid);

      // Recherche vectorielle
      let allDocuments = [];
      let selectedSources = [];
      let searchMetadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };

      try {
        const { searchDocumentsOptimized } = require('../services/embeddingService');
        
        const searchResults = await searchDocumentsOptimized(message, {
          filterCategory: null,
          allowLowerThreshold: true
        });
        
        if (searchResults && searchResults.length > 0) {
          allDocuments = applyIntelligentScoring(searchResults, message);
          selectedSources = selectTopSources(allDocuments, 3);
          
          searchMetadata = {
            totalFound: searchResults.length,
            averageScore: allDocuments.length > 0 ? 
              allDocuments.reduce((sum, doc) => sum + doc.finalScore, 0) / allDocuments.length : 0,
            categoriesFound: [...new Set(allDocuments.map(d => d.category).filter(Boolean))]
          };
          
          console.log(`🔍 IA Biblio: ${allDocuments.length} docs scorés`);
        }
        
      } catch (searchError) {
        console.warn('⚠️ Erreur recherche vectorielle IA Biblio:', searchError.message);
      }

      // Prompt spécifique Biblio
      const systemPrompt = buildBiblioSystemPrompt(allDocuments.slice(0, 6));
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

      // Sauvegarder
      try {
        await saveBiblioToSQL(kineId, message, aiResponse);
        console.log('💾 Conversation IA Biblio sauvegardée');
      } catch (saveError) {
        console.error('⚠️ Erreur sauvegarde IA Biblio:', saveError.message);
      }

      const overallConfidence = calculateOverallConfidence(allDocuments);

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
          iaType: 'bibliographique',
          kineId: kine.id,
          firebaseUid: firebaseUid,
          documentsFound: searchMetadata.totalFound,
          documentsUsedForAI: Math.min(allDocuments.length, 6),
          documentsDisplayed: selectedSources.length,
          averageRelevance: Math.round(searchMetadata.averageScore * 100),
          categoriesFound: searchMetadata.categoriesFound,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ IA Biblio - Confiance: ${Math.round(overallConfidence * 100)}%`);
      res.json(response);

    } catch (error) {
      console.error('❌ Erreur sendIaBiblio:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la génération de la réponse IA Bibliographique',
        details: error.message
      });
    }
  }
  // ========== IA CLINIQUE ==========
  async sendIaClinique(req, res) {
    try {
      const { message, conversationHistory = [] } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      const prisma = prismaService.getInstance();
      
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

      console.log('🏥 IA Clinique pour kiné:', firebaseUid);

      // Recherche vectorielle
      let allDocuments = [];
      let selectedSources = [];
      let searchMetadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };

      try {
        const { searchDocumentsOptimized } = require('../services/embeddingService');
        
        const searchResults = await searchDocumentsOptimized(message, {
          filterCategory: null,
          allowLowerThreshold: true
        });
        
        if (searchResults && searchResults.length > 0) {
          allDocuments = applyIntelligentScoring(searchResults, message);
          selectedSources = selectTopSources(allDocuments, 3);
          
          searchMetadata = {
            totalFound: searchResults.length,
            averageScore: allDocuments.length > 0 ? 
              allDocuments.reduce((sum, doc) => sum + doc.finalScore, 0) / allDocuments.length : 0,
            categoriesFound: [...new Set(allDocuments.map(d => d.category).filter(Boolean))]
          };
          
          console.log(`🔍 IA Clinique: ${allDocuments.length} docs scorés`);
        }
        
      } catch (searchError) {
        console.warn('⚠️ Erreur recherche vectorielle IA Clinique:', searchError.message);
      }

      // Prompt spécifique Clinique
      const systemPrompt = buildCliniqueSystemPrompt(allDocuments.slice(0, 6));
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

      // Sauvegarder
      try {
        await saveCliniqueToSQL(kineId, message, aiResponse);
        console.log('💾 Conversation IA Clinique sauvegardée');
      } catch (saveError) {
        console.error('⚠️ Erreur sauvegarde IA Clinique:', saveError.message);
      }

      const overallConfidence = calculateOverallConfidence(allDocuments);

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
          iaType: 'clinique',
          kineId: kine.id,
          firebaseUid: firebaseUid,
          documentsFound: searchMetadata.totalFound,
          documentsUsedForAI: Math.min(allDocuments.length, 6),
          documentsDisplayed: selectedSources.length,
          averageRelevance: Math.round(searchMetadata.averageScore * 100),
          categoriesFound: searchMetadata.categoriesFound,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ IA Clinique - Confiance: ${Math.round(overallConfidence * 100)}%`);
      res.json(response);

    } catch (error) {
      console.error('❌ Erreur sendIaClinique:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la génération de la réponse IA Clinique',
        details: error.message
      });
    }
  }

  // ========== IA ADMINISTRATIVE ==========
  async sendIaAdministrative(req, res) {
    try {
      const { message, conversationHistory = [] } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      const prisma = prismaService.getInstance();
      
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

      console.log('📋 IA Administrative pour kiné:', firebaseUid);

      // Recherche vectorielle
      let allDocuments = [];
      let selectedSources = [];
      let searchMetadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };

      try {
        const { searchDocumentsOptimized } = require('../services/embeddingService');
        
        const searchResults = await searchDocumentsOptimized(message, {
          filterCategory: null,
          allowLowerThreshold: true
        });
        
        if (searchResults && searchResults.length > 0) {
          allDocuments = applyIntelligentScoring(searchResults, message);
          selectedSources = selectTopSources(allDocuments, 3);
          
          searchMetadata = {
            totalFound: searchResults.length,
            averageScore: allDocuments.length > 0 ? 
              allDocuments.reduce((sum, doc) => sum + doc.finalScore, 0) / allDocuments.length : 0,
            categoriesFound: [...new Set(allDocuments.map(d => d.category).filter(Boolean))]
          };
          
          console.log(`🔍 IA Administrative: ${allDocuments.length} docs scorés`);
        }
        
      } catch (searchError) {
        console.warn('⚠️ Erreur recherche vectorielle IA Administrative:', searchError.message);
      }

      // Prompt spécifique Administrative
      const systemPrompt = buildAdministrativeSystemPrompt(allDocuments.slice(0, 6));
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

      // Sauvegarder
      try {
        await saveAdministrativeToSQL(kineId, message, aiResponse);
        console.log('💾 Conversation IA Administrative sauvegardée');
      } catch (saveError) {
        console.error('⚠️ Erreur sauvegarde IA Administrative:', saveError.message);
      }

      const overallConfidence = calculateOverallConfidence(allDocuments);

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
          iaType: 'administrative',
          kineId: kine.id,
          firebaseUid: firebaseUid,
          documentsFound: searchMetadata.totalFound,
          documentsUsedForAI: Math.min(allDocuments.length, 6),
          documentsDisplayed: selectedSources.length,
          averageRelevance: Math.round(searchMetadata.averageScore * 100),
          categoriesFound: searchMetadata.categoriesFound,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ IA Administrative - Confiance: ${Math.round(overallConfidence * 100)}%`);
      res.json(response);

    } catch (error) {
      console.error('❌ Erreur sendIaAdministrative:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la génération de la réponse IA Administrative',
        details: error.message
      });
    }
  }

  // ========== MÉTHODES GET HISTORY ==========
  
  async getHistoryBasique(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
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

      const history = await getHistoryFromTable('chatIaBasique', kineId, days);
      
      res.json({ 
        success: true, 
        iaType: 'basique',
        history: history 
      });
    } catch (error) {
      console.error('Erreur getHistoryBasique:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async getHistoryBiblio(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
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

      const history = await getHistoryFromTable('chatIaBiblio', kineId, days);
      
      res.json({ 
        success: true, 
        iaType: 'bibliographique',
        history: history 
      });
    } catch (error) {
      console.error('Erreur getHistoryBiblio:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async getHistoryClinique(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
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

      const history = await getHistoryFromTable('chatIaClinique', kineId, days);
      
      res.json({ 
        success: true, 
        iaType: 'clinique',
        history: history 
      });
    } catch (error) {
      console.error('Erreur getHistoryClinique:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async getHistoryAdministrative(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
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

      const history = await getHistoryFromTable('chatIaAdministrative', kineId, days);
      
      res.json({ 
        success: true, 
        iaType: 'administrative',
        history: history 
      });
    } catch (error) {
      console.error('Erreur getHistoryAdministrative:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }
  // ========== MÉTHODES CLEAR HISTORY ==========

  async clearHistoryBasique(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      await clearHistoryFromTable('chatIaBasique', kineId);
      
      res.json({ 
        success: true, 
        iaType: 'basique',
        message: 'Historique IA Basique supprimé' 
      });
    } catch (error) {
      console.error('Erreur clearHistoryBasique:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async clearHistoryBiblio(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      await clearHistoryFromTable('chatIaBiblio', kineId);
      
      res.json({ 
        success: true, 
        iaType: 'bibliographique',
        message: 'Historique IA Bibliographique supprimé' 
      });
    } catch (error) {
      console.error('Erreur clearHistoryBiblio:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async clearHistoryClinique(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      await clearHistoryFromTable('chatIaClinique', kineId);
      
      res.json({ 
        success: true, 
        iaType: 'clinique',
        message: 'Historique IA Clinique supprimé' 
      });
    } catch (error) {
      console.error('Erreur clearHistoryClinique:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async clearHistoryAdministrative(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      const prisma = prismaService.getInstance();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      await clearHistoryFromTable('chatIaAdministrative', kineId);
      
      res.json({ 
        success: true, 
        iaType: 'administrative',
        message: 'Historique IA Administrative supprimé' 
      });
    } catch (error) {
      console.error('Erreur clearHistoryAdministrative:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }
}

// ========== FONCTIONS HELPER POUR SCORING (conservées) ==========

function applyIntelligentScoring(documents, query) {
  return documents.map((doc, index) => {
    let finalScore = doc.similarity;

    const exactMatches = countExactMatches(query, doc.content);
    finalScore += (exactMatches * 0.05);

    const docAge = getDocumentAge(doc.created_at);
    if (docAge < 30) {
      finalScore += 0.03;
    }

    const importantCategories = [
      'exercices', 'protocole', 'pathologie', 'rééducation', 
      'anatomie', 'technique', 'evaluation', 'traitement',
      'exercice', 'reeduc', 'kine', 'physio'
    ];
    
    if (doc.category && importantCategories.some(cat => 
      doc.category.toLowerCase().includes(cat))) {
      finalScore += 0.08;
    }

    if (doc.content && doc.content.length < 200) {
      finalScore -= 0.02;
    }

    if (doc.content && doc.content.length >= 500 && doc.content.length <= 2000) {
      finalScore += 0.03;
    }

    if (doc.title && containsQueryWords(query, doc.title)) {
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

function selectTopSources(documents, maxCount = 3) {
  const selected = [];
  const usedCategories = new Set();
  
  for (const doc of documents) {
    if (selected.length >= maxCount) break;
    
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

function calculateOverallConfidence(documents) {
  if (documents.length === 0) return 0.5;
  
  const averageScore = documents.reduce((sum, doc) => sum + doc.finalScore, 0) / documents.length;
  const bestScore = Math.max(...documents.map(doc => doc.finalScore));
  
  return (bestScore * 0.7) + (averageScore * 0.3);
}

function countExactMatches(query, content) {
  if (!content) return 0;
  
  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const contentLower = content.toLowerCase();
  
  return queryWords.filter(word => contentLower.includes(word)).length;
}

function containsQueryWords(query, title) {
  if (!title) return false;
  
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const titleLower = title.toLowerCase();
  
  return queryWords.some(word => titleLower.includes(word));
}

function getDocumentAge(createdAt) {
  if (!createdAt) return 365;
  const now = new Date();
  const docDate = new Date(createdAt);
  return Math.floor((now - docDate) / (1000 * 60 * 60 * 24));
}

function getRelevanceLevel(score) {
  if (score >= 0.9) return 'Excellente';
  if (score >= 0.8) return 'Très bonne';
  if (score >= 0.7) return 'Bonne';
  return 'Correcte';
}

// ========== FONCTIONS DE SAUVEGARDE SPÉCIALISÉES ==========

async function saveBasiqueToSQL(kineId, message, response) {
  const prisma = prismaService.getInstance();
  
  await prisma.chatIaBasique.create({
    data: {
      kineId: kineId,
      message: message,
      response: response
    }
  });
}

async function saveBiblioToSQL(kineId, message, response) {
  const prisma = prismaService.getInstance();
  
  await prisma.chatIaBiblio.create({
    data: {
      kineId: kineId,
      message: message,
      response: response
    }
  });
}

async function saveCliniqueToSQL(kineId, message, response) {
  const prisma = prismaService.getInstance();
  
  await prisma.chatIaClinique.create({
    data: {
      kineId: kineId,
      message: message,
      response: response
    }
  });
}

async function saveAdministrativeToSQL(kineId, message, response) {
  const prisma = prismaService.getInstance();
  
  await prisma.chatIaAdministrative.create({
    data: {
      kineId: kineId,
      message: message,
      response: response
    }
  });
}

// ========== FONCTIONS HISTORIQUE GÉNÉRIQUES ==========

async function getHistoryFromTable(tableName, kineId, days) {
  const prisma = prismaService.getInstance();
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);

  return await prisma[tableName].findMany({
    where: {
      kineId: kineId,
      createdAt: {
        gte: daysAgo
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50
  });
}

async function clearHistoryFromTable(tableName, kineId) {
  const prisma = prismaService.getInstance();
  
  await prisma[tableName].deleteMany({
    where: {
      kineId: kineId
    }
  });
}

// ========== PROMPTS SYSTÈME SPÉCIALISÉS ==========

function buildBasiqueSystemPrompt(contextDocuments) {
  let systemPrompt = `ATTENTION : Tu parles à un KINÉSITHÉRAPEUTE PROFESSIONNEL, PAS à un patient !

Tu es un assistant IA conversationnel pour AIDER LES KINÉSITHÉRAPEUTES dans leur travail. L'utilisateur qui te parle est un kinésithérapeute diplômé qui traite des patients.

RÔLE : Assistant conversationnel pour kinésithérapeutes
UTILISATEUR : Un kinésithérapeute professionnel (pas un patient)
OBJECTIF : Donner des conseils thérapeutiques professionnels généraux`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS DE RÉFÉRENCE PROFESSIONNELS :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `📄 Document ${index + 1} (Score: ${score}%) - "${doc.title}" [${doc.category || 'Général'}] :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nINSTRUCTIONS :
- TOUJOURS s'adresser au kinésithérapeute, jamais au patient
- Donner des conseils de professionnel à professionnel
- Utiliser "vos patients", "dans votre pratique", "je vous recommande"
- Être précis et technique dans tes recommandations`;

  return systemPrompt;
}

function buildBiblioSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant bibliographique pour un kinésithérapeute professionnel.

RÔLE : Assistant bibliographique spécialisé
UTILISATEUR : Kinésithérapeute cherchant des références scientifiques
OBJECTIF : Fournir des références, études et sources documentaires pertinentes`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS BIBLIOGRAPHIQUES DISPONIBLES :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `📚 Document ${index + 1} (Pertinence: ${score}%) - "${doc.title}" :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nFOCUS : Références scientifiques, études cliniques, protocoles validés, sources bibliographiques.`;

  return systemPrompt;
}

function buildCliniqueSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant clinique pour un kinésithérapeute professionnel.

RÔLE : Assistant clinique spécialisé
UTILISATEUR : Kinésithérapeute en situation clinique
OBJECTIF : Aide à la prise en charge clinique, diagnostic kinésithérapique, techniques thérapeutiques`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS CLINIQUES DE RÉFÉRENCE :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `🏥 Document ${index + 1} (Pertinence: ${score}%) - "${doc.title}" :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nFOCUS : Diagnostic kinésithérapique, techniques de traitement, protocoles cliniques, évaluation.`;

  return systemPrompt;
}

function buildAdministrativeSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant administratif pour un kinésithérapeute professionnel.

RÔLE : Assistant administratif spécialisé
UTILISATEUR : Kinésithérapeute gérant son cabinet
OBJECTIF : Aide administrative, réglementaire, gestion de cabinet, facturation, législation`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS ADMINISTRATIFS DE RÉFÉRENCE :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `📋 Document ${index + 1} (Pertinence: ${score}%) - "${doc.title}" :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nFOCUS : Réglementation, facturation, gestion de cabinet, aspects légaux, démarches administratives.`;

  return systemPrompt;
}

module.exports = new ChatKineController();