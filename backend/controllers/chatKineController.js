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

  // ========== CHAT ENHANCED : Logique vectorielle + utilise le service normal ==========
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

      console.log('🤖 Chat Enhanced pour kiné:', firebaseUid);

      // 1. Recherche dans la base vectorielle (TOUJOURS)
      let contextDocuments = [];
      try {
        const { searchDocuments } = require('../services/embeddingService');
        
        const searchResults = await searchDocuments(message, {
          matchThreshold: 0.3,  // Seuil bas pour toujours trouver quelque chose
          matchCount: 3,
          filterCategory: null
        });
        
        contextDocuments = searchResults.map(doc => ({
          title: doc.title,
          content: doc.content.substring(0, 1000),
          category: doc.category,
          similarity: doc.similarity
        }));
        
        console.log('🔍 Trouvé', contextDocuments.length, 'documents pertinents');
        
      } catch (searchError) {
        console.warn('⚠️ Erreur recherche vectorielle:', searchError.message);
        // Continuer avec contextDocuments vide
      }

      // 2. Génération OpenAI avec contexte vectoriel (même si vide)
      console.log('📚 Mode Enhanced avec contexte vectoriel');
      
      const systemPrompt = buildEnhancedSystemPrompt(contextDocuments);
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

      // 3. Sauvegarder directement en SQL
      try {
        await saveEnhancedToSQL(kineId, message, aiResponse);
        console.log('💾 Conversation Enhanced sauvegardée');
      } catch (saveError) {
        console.error('⚠️ Erreur sauvegarde:', saveError.message);
      }

      // 4. Réponse avec métadonnées Enhanced
      const response = {
        success: true,
        message: aiResponse,
        metadata: {
          model: 'gpt-3.5-turbo',
          kineId: kine.id,
          firebaseUid: firebaseUid,
          documentsUsed: contextDocuments.length,
          hasVectorContext: contextDocuments.length > 0,
          categories: [...new Set(contextDocuments.map(d => d.category))],
          timestamp: new Date().toISOString(),
          enhanced: true
        }
      };

      // 5. Ajouter les sources si disponibles
      if (contextDocuments.length > 0) {
        response.sources = contextDocuments.map(doc => ({
          title: doc.title,
          category: doc.category,
          similarity: Math.round(doc.similarity * 100) + '%'
        }));
      }

      res.json(response);

    } catch (error) {
      console.error('❌ Erreur sendMessageEnhanced:', error);
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

// ========== FONCTIONS HELPER (en dehors de la classe) ==========
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

  // Ajouter le contexte vectoriel
  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS DE RÉFÉRENCE PROFESSIONNELS :
`;

    contextDocuments.forEach((doc, index) => {
      systemPrompt += `📄 Document ${index + 1} (${doc.category}) - "${doc.title}" :
${doc.content}

`;
    });

    systemPrompt += `Ces documents sont des références professionnelles. Utilise-les pour conseiller le kinésithérapeute sur ses techniques de traitement.`;
  }

  systemPrompt += `\n\nINSTRUCTIONS ABSOLUES :
- TOUJOURS s'adresser au kinésithérapeute, jamais au patient
- Donner des conseils de professionnel à professionnel
- Suggérer des techniques qu'IL peut utiliser avec SES patients
- Utiliser "vos patients", "dans votre pratique", "je vous recommande"
- Rester dans le cadre de conseils entre confrères kinésithérapeutes`;

  return systemPrompt;
}

module.exports = new ChatKineController();