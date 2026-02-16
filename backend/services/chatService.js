// services/chatService.js
const prismaService = require('./prismaService');
const { generateChatResponse, generateWelcomeMessage } = require('./openaiService');
const logger = require('../utils/logger');

// Récupérer l'historique de chat pour un programme spécifique
const getProgramChatHistory = async (patientId, programmeId) => {
  try {
    const prisma = prismaService.getInstance();
    
    const history = await prisma.chatSession.findMany({
      where: {
        patientId: parseInt(patientId),
        programmeId: parseInt(programmeId)
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
    logger.error('Erreur récupération historique chat:', error.message);
    return [];
  }
};

// Sauvegarder un message de chat lié au programme
const saveChatMessage = async (patientId, programmeId, message, role) => {
  try {
    const prisma = prismaService.getInstance();
    
    return await prisma.chatSession.create({
      data: {
        message,
        role: role.toUpperCase(), // USER, ASSISTANT, SYSTEM
        patientId: parseInt(patientId),
        programmeId: parseInt(programmeId)
      }
    });
  } catch (error) {
    logger.error('Erreur sauvegarde message chat:', error.message);
    throw error;
  }
};

// Traiter une conversation complète
const processChatMessage = async (patientData, programmes, userMessage) => {
  try {
    const patientId = patientData.id;
    const programmeId = programmes[0]?.id; // Un seul programme par patient

    if (!programmeId) {
      return {
        success: false,
        error: 'Aucun programme actif trouvé pour ce patient.'
      };
    }

    // 1. Récupérer l'historique du programme
    const chatHistory = await getProgramChatHistory(patientId, programmeId);

    // 2. Sauvegarder le message utilisateur
    await saveChatMessage(patientId, programmeId, userMessage, 'USER');

    // 3. Générer la réponse IA
    const aiResponse = await generateChatResponse(
      patientData,
      programmes,
      userMessage,
      chatHistory,
      { dateFin: programmes[0]?.dateFin }
    );

    // 4. Sauvegarder la réponse IA si succès
    if (aiResponse.success) {
      await saveChatMessage(patientId, programmeId, aiResponse.message, 'ASSISTANT');
    }

    return aiResponse;

  } catch (error) {
    logger.error('Erreur traitement message chat:', error.message);
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
    const programmeId = programmes[0]?.id;

    if (!programmeId) {
      return {
        success: false,
        error: 'Aucun programme actif trouvé pour ce patient.'
      };
    }

    // Vérifier s'il y a déjà des messages pour ce programme
    const existingHistory = await getProgramChatHistory(patientId, programmeId);
    
    if (existingHistory.length > 0) {
      // Retourner l'historique existant du programme
      return {
        success: true,
        hasHistory: true,
        history: existingHistory,
        message: "Session de chat restaurée pour ce programme"
      };
    }

    // Générer message de bienvenue pour le nouveau programme
    const welcomeResponse = await generateWelcomeMessage(patientData, programmes, { dateFin: programmes[0]?.dateFin });
    
    if (welcomeResponse.success) {
      // Sauvegarder le message de bienvenue
      await saveChatMessage(patientId, programmeId, welcomeResponse.message, 'ASSISTANT');
    }

    return {
      success: true,
      hasHistory: false,
      history: [],
      message: welcomeResponse.message
    };

  } catch (error) {
    logger.error('Erreur initialisation chat:', error.message);
    return {
      success: false,
      error: 'Erreur lors de l\'initialisation du chat.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

// Archiver un programme et marquer la date d'archivage
const archiveProgram = async (programmeId) => {
  try {
    const prisma = prismaService.getInstance();
    
    const result = await prisma.programme.update({
      where: { id: parseInt(programmeId) },
      data: {
        isArchived: true,
        archivedAt: new Date()
      }
    });

    logger.info(`📦 Programme ${programmeId} archivé avec ses conversations`);
    return result;
  } catch (error) {
    logger.error('Erreur archivage programme:', error.message);
    throw error;
  }
};

// Nettoyer les programmes et conversations archivés depuis plus de 6 mois
const cleanupArchivedPrograms = async () => {
  try {
    const prisma = prismaService.getInstance();
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Trouver les programmes archivés depuis plus de 6 mois
    const oldArchivedPrograms = await prisma.programme.findMany({
      where: {
        isArchived: true,
        archivedAt: {
          lt: sixMonthsAgo
        }
      },
      select: { id: true, titre: true, archivedAt: true }
    });

    if (oldArchivedPrograms.length === 0) {
      logger.debug('🧹 Aucun programme archivé à supprimer (< 6 mois)');
      return { programs: 0, messages: 0 };
    }

    // Compter les messages à supprimer
    const messageCount = await prisma.chatSession.count({
      where: {
        programmeId: {
          in: oldArchivedPrograms.map(p => p.id)
        }
      }
    });

    // Supprimer un par un pour gérer les contraintes (pas de deleteMany)
    let deletedPrograms = 0;
    const deletedDetails = [];

    for (const program of oldArchivedPrograms) {
      try {
        // Supprimer le programme individuellement (cascade fonctionnera)
        await prisma.programme.delete({
          where: { id: program.id }
        });
        
        deletedPrograms++;
        deletedDetails.push({
          id: program.id,
          titre: program.titre,
          archivedAt: program.archivedAt
        });
        
        logger.info(`🗑️ Programme supprimé: "${program.titre}" (ID: ${program.id})`);
      } catch (deleteError) {
        logger.error(`❌ Erreur suppression programme ${program.id}:`, deleteError.message);
      }
    }

    logger.info(`🗑️ Suppression définitive: ${deletedPrograms} programmes et ${messageCount} messages (archivés > 6 mois)`);
    
    return {
      programs: deletedPrograms,
      messages: messageCount,
      details: deletedDetails
    };

  } catch (error) {
    logger.error('❌ Erreur nettoyage programmes archivés:', error.message);
    throw error;
  }
};

// Nettoyer les programmes terminés (les archiver)
const archiveFinishedPrograms = async () => {
  try {
    const prisma = prismaService.getInstance();
    
    const now = new Date();
    
    // Trouver tous les programmes terminés non archivés
    const finishedPrograms = await prisma.programme.findMany({
      where: {
        dateFin: {
          lt: now
        },
        isArchived: false
      },
      select: { id: true, titre: true, dateFin: true }
    });

    if (finishedPrograms.length === 0) {
      logger.debug('📋 Aucun programme terminé à archiver');
      return 0;
    }

    // Archiver tous les programmes terminés
    const result = await prisma.programme.updateMany({
      where: {
        id: {
          in: finishedPrograms.map(p => p.id)
        }
      },
      data: {
        isArchived: true,
        archivedAt: now
      }
    });

    logger.info(`📦 ${result.count} programmes terminés archivés avec leurs conversations`);
    
    // Compter les messages associés
    const messageCount = await prisma.chatSession.count({
      where: {
        programmeId: {
          in: finishedPrograms.map(p => p.id)
        }
      }
    });

    logger.info(`💬 ${messageCount} messages de chat archivés avec les programmes`);

    return {
      programs: result.count,
      messages: messageCount,
      details: finishedPrograms
    };

  } catch (error) {
    logger.error('❌ Erreur archivage programmes terminés:', error.message);
    throw error;
  }
};

// Obtenir les statistiques de chat pour un patient/programme
const getChatStats = async (patientId, programmeId) => {
  try {
    const prisma = prismaService.getInstance();
    
    const stats = await prisma.chatSession.groupBy({
      by: ['role'],
      where: {
        patientId: parseInt(patientId),
        programmeId: parseInt(programmeId)
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
    logger.error('Erreur statistiques chat:', error.message);
    return {};
  }
};

// Supprimer manuellement un programme et ses conversations
const deleteProgramAndChats = async (programmeId) => {
  try {
    const prisma = prismaService.getInstance();
    
    // Compter les messages avant suppression
    const messageCount = await prisma.chatSession.count({
      where: { programmeId: parseInt(programmeId) }
    });

    // Supprimer le programme (cascade supprimera les chats automatiquement)
    const result = await prisma.programme.delete({
      where: { id: parseInt(programmeId) }
    });

    logger.info(`🗑️ Programme ${programmeId} supprimé avec ${messageCount} messages de chat`);
    
    return {
      program: result,
      messagesDeleted: messageCount
    };

  } catch (error) {
    logger.error('❌ Erreur suppression programme et chats:', error.message);
    throw error;
  }
};

module.exports = {
  getProgramChatHistory,
  saveChatMessage,
  processChatMessage,
  initializeChatSession,
  archiveProgram,
  cleanupArchivedPrograms,
  archiveFinishedPrograms,
  getChatStats,
  deleteProgramAndChats
};