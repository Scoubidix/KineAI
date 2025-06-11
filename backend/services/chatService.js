// services/chatService.js
const { PrismaClient } = require('@prisma/client');
const { generateChatResponse, generateWelcomeMessage } = require('./openaiService');

const prisma = new PrismaClient();

// Récupérer l'historique de chat du jour pour un patient
const getTodayChatHistory = async (patientId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const history = await prisma.chatSession.findMany({
      where: {
        patientId: parseInt(patientId),
        sessionDate: today
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        message: true,
        role: true,
        createdAt: true
      }
    });

    // Formater pour OpenAI (convertir les rôles)
    return history.map(msg => ({
      role: msg.role.toLowerCase() === 'user' ? 'user' : 'assistant',
      content: msg.message,
      timestamp: msg.createdAt
    }));

  } catch (error) {
    console.error('Erreur récupération historique chat:', error);
    return [];
  }
};

// Sauvegarder un message de chat
const saveChatMessage = async (patientId, message, role) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await prisma.chatSession.create({
      data: {
        message,
        role: role.toUpperCase(), // USER, ASSISTANT, SYSTEM
        patientId: parseInt(patientId),
        sessionDate: today
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde message chat:', error);
    throw error;
  }
};

// Traiter une conversation complète
const processChatMessage = async (patientData, programmes, userMessage) => {
  try {
    const patientId = patientData.id;

    // 1. Récupérer l'historique du jour
    const chatHistory = await getTodayChatHistory(patientId);

    // 2. Sauvegarder le message utilisateur
    await saveChatMessage(patientId, userMessage, 'USER');

    // 3. Générer la réponse IA
    const aiResponse = await generateChatResponse(
      patientData, 
      programmes, 
      userMessage, 
      chatHistory
    );

    // 4. Sauvegarder la réponse IA si succès
    if (aiResponse.success) {
      await saveChatMessage(patientId, aiResponse.message, 'ASSISTANT');
    }

    return aiResponse;

  } catch (error) {
    console.error('Erreur traitement message chat:', error);
    return {
      success: false,
      error: 'Erreur lors du traitement de votre message. Veuillez réessayer.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

// Initialiser une session de chat (message de bienvenue)
const initializeChatSession = async (patientData, programmes) => {
  try {
    const patientId = patientData.id;

    // Vérifier s'il y a déjà des messages aujourd'hui
    const existingHistory = await getTodayChatHistory(patientId);
    
    if (existingHistory.length > 0) {
      // Retourner l'historique existant
      return {
        success: true,
        hasHistory: true,
        history: existingHistory,
        message: "Session de chat restaurée"
      };
    }

    // Générer message de bienvenue
    const welcomeResponse = await generateWelcomeMessage(patientData, programmes);
    
    if (welcomeResponse.success) {
      // Sauvegarder le message de bienvenue
      await saveChatMessage(patientId, welcomeResponse.message, 'ASSISTANT');
    }

    return {
      success: true,
      hasHistory: false,
      history: [],
      message: welcomeResponse.message
    };

  } catch (error) {
    console.error('Erreur initialisation chat:', error);
    return {
      success: false,
      error: 'Erreur lors de l\'initialisation du chat.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

// Nettoyer les anciennes sessions (à exécuter quotidiennement)
const cleanupOldChatSessions = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await prisma.chatSession.deleteMany({
      where: {
        sessionDate: {
          lt: today
        }
      }
    });

    console.log(`Nettoyage chat: ${result.count} messages supprimés`);
    return result.count;

  } catch (error) {
    console.error('Erreur nettoyage chat sessions:', error);
    throw error;
  }
};

// Obtenir les statistiques de chat pour un patient
const getChatStats = async (patientId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await prisma.chatSession.groupBy({
      by: ['role'],
      where: {
        patientId: parseInt(patientId),
        sessionDate: today
      },
      _count: {
        id: true
      }
    });

    return stats.reduce((acc, stat) => {
      acc[stat.role.toLowerCase()] = stat._count.id;
      return acc;
    }, {});

  } catch (error) {
    console.error('Erreur statistiques chat:', error);
    return {};
  }
};

module.exports = {
  getTodayChatHistory,
  saveChatMessage,
  processChatMessage,
  initializeChatSession,
  cleanupOldChatSessions,
  getChatStats
};