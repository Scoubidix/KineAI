// utils/chatCleanup.js
const cron = require('node-cron');
const prismaService = require('../services/prismaService');

// NOUVEAU: Nettoyer l'historique des chats kinés > 5 jours
const cleanOldKineChatHistory = async () => {
  return await prismaService.executeWithTempConnection(async (prisma) => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const result = await prisma.chatKine.deleteMany({
      where: {
        createdAt: {
          lt: fiveDaysAgo
        }
      }
    });
    
    console.log(`🗑️ Chat kiné: ${result.count} messages supprimés (> 5 jours)`);
    return result;
  });
};

// Archiver les programmes terminés (avec leurs conversations)
const archiveFinishedProgramsTask = async () => {
  try {
    const now = new Date();
    console.log(`📦 [${now.toISOString()}] Démarrage archivage programmes terminés...`);
    
    const result = await prismaService.executeWithTempConnection(async (prisma) => {
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
        console.log('📋 Aucun programme terminé à archiver');
        return { programs: 0, messages: 0 };
      }

      // Archiver tous les programmes terminés
      const updateResult = await prisma.programme.updateMany({
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

      // Compter les messages associés
      const messageCount = await prisma.chatSession.count({
        where: {
          programmeId: {
            in: finishedPrograms.map(p => p.id)
          }
        }
      });

      console.log(`📦 ${updateResult.count} programmes terminés archivés avec leurs conversations`);
      console.log(`💬 ${messageCount} messages de chat archivés avec les programmes`);

      return {
        programs: updateResult.count,
        messages: messageCount,
        details: finishedPrograms
      };
    });
    
    if (result.programs > 0) {
      console.log(`✅ Archivage terminé: ${result.programs} programmes, ${result.messages} messages`);
    } else {
      console.log('ℹ️ Aucun programme à archiver aujourd\'hui');
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Erreur archivage programmes:`, error);
    throw error;
  }
};

// Supprimer définitivement les programmes archivés depuis plus de 6 mois
const cleanupOldArchivedProgramsTask = async () => {
  try {
    const now = new Date();
    console.log(`🗑️ [${now.toISOString()}] Démarrage suppression programmes archivés > 6 mois...`);
    
    const result = await prismaService.executeWithTempConnection(async (prisma) => {
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
        console.log('🧹 Aucun programme archivé à supprimer (< 6 mois)');
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

      // Supprimer un par un pour gérer les contraintes
      let deletedPrograms = 0;
      const deletedDetails = [];

      for (const program of oldArchivedPrograms) {
        try {
          await prisma.programme.delete({
            where: { id: program.id }
          });
          
          deletedPrograms++;
          deletedDetails.push({
            id: program.id,
            titre: program.titre,
            archivedAt: program.archivedAt
          });
          
          console.log(`🗑️ Programme supprimé: "${program.titre}" (ID: ${program.id})`);
        } catch (deleteError) {
          console.error(`❌ Erreur suppression programme ${program.id}:`, deleteError.message);
        }
      }

      console.log(`🗑️ Suppression définitive: ${deletedPrograms} programmes et ${messageCount} messages (archivés > 6 mois)`);
      
      return {
        programs: deletedPrograms,
        messages: messageCount,
        details: deletedDetails
      };
    });
    
    if (result.programs > 0) {
      console.log(`✅ Suppression terminée: ${result.programs} programmes, ${result.messages} messages`);
      console.log('📋 Programmes supprimés:', result.details.map(p => `${p.titre} (archivé le ${p.archivedAt})`));
    } else {
      console.log('ℹ️ Aucun programme archivé à supprimer (< 6 mois)');
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Erreur suppression programmes archivés:`, error);
    throw error;
  }
};

// NOUVEAU: Tâche de nettoyage du chat kiné
const cleanKineChatTask = async () => {
  try {
    const now = new Date();
    console.log(`💬 [${now.toISOString()}] Démarrage nettoyage chat kiné > 5 jours...`);
    
    const result = await cleanOldKineChatHistory();
    
    if (result.count > 0) {
      console.log(`✅ Nettoyage chat kiné terminé: ${result.count} messages supprimés`);
    } else {
      console.log('ℹ️ Aucun message de chat kiné à supprimer (< 5 jours)');
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Erreur nettoyage chat kiné:`, error);
    throw error;
  }
};

// Démarrer les tâches automatiques
const startProgramCleanupCron = () => {
  console.log('🚀 Démarrage des tâches CRON de nettoyage...');

  // Archivage quotidien - 2h00
  cron.schedule('0 2 * * *', async () => {
    try {
      await archiveFinishedProgramsTask();
    } catch (error) {
      console.error('❌ Erreur tâche archivage quotidienne:', error);
    }
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Nettoyage chat kiné - 2h30
  cron.schedule('30 2 * * *', async () => {
    try {
      await cleanKineChatTask();
    } catch (error) {
      console.error('❌ Erreur tâche nettoyage chat kiné:', error);
    }
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Nettoyage hebdomadaire - 3h00 dimanche
  cron.schedule('0 3 * * 0', async () => {
    try {
      await cleanupOldArchivedProgramsTask();
    } catch (error) {
      console.error('❌ Erreur tâche nettoyage hebdomadaire:', error);
    }
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  console.log('✅ Tâches CRON configurées avec succès');
};

// Fonctions de test manuel (pour développement/debug)
const manualArchiveTest = async () => {
  try {
    console.log('🧪 Test manuel archivage programmes terminés...');
    const result = await archiveFinishedProgramsTask();
    console.log('✅ Test archivage terminé:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur test manuel archivage:', error);
    throw error;
  }
};

const manualCleanupTest = async () => {
  try {
    console.log('🧪 Test manuel nettoyage programmes archivés...');
    const result = await cleanupOldArchivedProgramsTask();
    console.log('✅ Test nettoyage terminé:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur test manuel nettoyage:', error);
    throw error;
  }
};

const manualKineChatCleanupTest = async () => {
  try {
    console.log('🧪 Test manuel nettoyage chat kiné...');
    const result = await cleanKineChatTask();
    console.log('✅ Test nettoyage chat kiné terminé:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur test manuel nettoyage chat kiné:', error);
    throw error;
  }
};

module.exports = {
  startProgramCleanupCron,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask,
  cleanKineChatTask,
  cleanOldKineChatHistory,
  manualArchiveTest,
  manualCleanupTest,
  manualKineChatCleanupTest
};