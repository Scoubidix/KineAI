// utils/chatCleanup.js - Version avec timeout et retry
const cron = require('node-cron');
const prismaService = require('../services/prismaService');

// Wrapper avec timeout et retry pour les tâches CRON
const executeWithTimeout = async (taskName, taskFunction, timeoutMs = 120000) => {
  const startTime = Date.now();
  console.log(`🚀 [${new Date().toISOString()}] Démarrage ${taskName}...`);
  
  try {
    // Promise avec timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout ${taskName} après ${timeoutMs/1000}s`)), timeoutMs)
    );
    
    const result = await Promise.race([
      taskFunction(),
      timeoutPromise
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`✅ ${taskName} terminé en ${Math.round(duration/1000)}s`);
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [${new Date().toISOString()}] Erreur ${taskName} après ${Math.round(duration/1000)}s:`, error.message);
    
    // Retry une seule fois si timeout
    if (error.message.includes('Timeout') && duration < timeoutMs) {
      console.log(`🔄 Retry ${taskName} dans 30 secondes...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      try {
        const retryResult = await taskFunction();
        console.log(`✅ ${taskName} réussi au retry`);
        return retryResult;
      } catch (retryError) {
        console.error(`❌ ${taskName} échec au retry:`, retryError.message);
        throw retryError;
      }
    }
    
    throw error;
  }
};

// Archiver les programmes terminés (avec leurs conversations)
const archiveFinishedProgramsTask = async () => {
  const now = new Date();
  console.log(`📊 Début archivage - tentative connexion DB...`);
  
  // NOUVEAU: Forcer une connexion fraîche pour les CRON nocturnes
  try {
    await prismaService.forceDisconnect();
    console.log(`🔄 Connexion reset pour archivage nocturne`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1s
  } catch (error) {
    console.log(`⚠️ Reset connexion ignoré:`, error.message);
  }
  
  const result = await prismaService.executeWithTempConnection(async (prisma) => {
    console.log(`✅ Connexion DB établie - recherche programmes terminés...`);
    
    // Trouver tous les programmes terminés non archivés (avec limite pour éviter scan complet)
    const finishedPrograms = await prisma.programme.findMany({
      where: {
        dateFin: {
          lt: now
        },
        isArchived: false
      },
      select: { id: true, titre: true, dateFin: true },
      orderBy: { dateFin: 'asc' },  // Optimisation : ordre par date
      take: 100  // Limite pour éviter scan de table complète
    });

    console.log(`📋 ${finishedPrograms.length} programmes terminés trouvés`);

    if (finishedPrograms.length === 0) {
      console.log('📋 Aucun programme terminé à archiver');
      return { programs: 0, messages: 0 };
    }

    console.log(`🔄 Archivage de ${finishedPrograms.length} programmes...`);

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

    console.log(`✅ Update terminé - comptage messages...`);

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
  
  return result;
};

// Supprimer définitivement les programmes archivés depuis plus de 6 mois
const cleanupOldArchivedProgramsTask = async () => {
  const now = new Date();
  
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
  
  return result;
};

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

// Démarrer les tâches automatiques avec timeout
const startProgramCleanupCron = () => {
  console.log('🚀 Démarrage des tâches CRON de nettoyage - TEST TOUTES LES HEURES...');

  // TEST: Archivage TOUTES LES HEURES - VERSION RAPIDE
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    const hour = now.getHours();
    console.log(`🕐 Test archivage EXPRESS heure ${hour}h00`);
    
    await executeWithTimeout(
      `archivage programmes terminés EXPRESS (${hour}h00)`,
      archiveFinishedProgramsTask,
      60000 // 1 minute seulement (plus rapide)
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Nettoyage chat kiné - 01h30 (garde normal)
  cron.schedule('30 1 * * *', async () => {
    await executeWithTimeout(
      'nettoyage chat kiné',
      cleanOldKineChatHistory,
      60000 // 1 minute
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Nettoyage hebdomadaire - 23h00 samedi (garde normal)
  cron.schedule('0 23 * * 6', async () => {
    await executeWithTimeout(
      'nettoyage programmes archivés',
      cleanupOldArchivedProgramsTask,
      300000 // 5 minutes
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  console.log('✅ Tâches CRON configurées - TEST TOUTES LES HEURES');
  console.log('📅 Planning: CHAQUE HEURE archivage, 01h30 chat, samedi 23h00 nettoyage');
};

// Fonctions de test manuel
const manualArchiveTest = async () => {
  return await executeWithTimeout(
    'test manuel archivage',
    archiveFinishedProgramsTask,
    60000
  );
};

const manualCleanupTest = async () => {
  return await executeWithTimeout(
    'test manuel nettoyage',
    cleanupOldArchivedProgramsTask,
    120000
  );
};

const manualKineChatCleanupTest = async () => {
  return await executeWithTimeout(
    'test manuel chat kiné',
    cleanOldKineChatHistory,
    30000
  );
};

module.exports = {
  startProgramCleanupCron,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask,
  cleanOldKineChatHistory,
  manualArchiveTest,
  manualCleanupTest,
  manualKineChatCleanupTest
};