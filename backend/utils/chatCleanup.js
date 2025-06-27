// utils/chatCleanup.js - Version avec connexion dédiée
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

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

// Archiver les programmes terminés - VERSION CONNEXION DÉDIÉE
const archiveFinishedProgramsTask = async () => {
  const now = new Date();
  console.log(`📊 Début archivage CONNEXION DÉDIÉE - tentative connexion DB...`);
  
  // NOUVEAU: Créer une connexion Prisma dédiée JUSTE pour ce CRON
  let dedicatedPrisma = null;
  
  try {
    console.log(`🔧 Création connexion Prisma DÉDIÉE pour CRON...`);
    
    // URL dédiée pour CRON uniquement
    const cronDbUrl = new URL(process.env.DATABASE_URL);
    cronDbUrl.searchParams.set('connection_limit', '1');
    cronDbUrl.searchParams.set('pool_timeout', '60');
    cronDbUrl.searchParams.set('connect_timeout', '30');
    cronDbUrl.searchParams.set('application_name', 'kine_cron'); // Nom spécial pour identifier
    
    dedicatedPrisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: cronDbUrl.toString()
        }
      }
    });
    
    console.log(`✅ Connexion DÉDIÉE CRON établie - recherche programmes terminés...`);
    
    // Transaction avec la connexion dédiée
    const result = await dedicatedPrisma.$transaction(async (tx) => {
      const finishedPrograms = await tx.programme.findMany({
        where: {
          dateFin: { lt: now },
          isArchived: false
        },
        select: { id: true, titre: true, dateFin: true },
        orderBy: { dateFin: 'asc' },
        take: 100
      });

      console.log(`📋 ${finishedPrograms.length} programmes terminés trouvés`);

      if (finishedPrograms.length === 0) {
        return { programs: 0, messages: 0 };
      }

      console.log(`🔄 Archivage DÉDIÉ de ${finishedPrograms.length} programmes...`);

      // Archiver
      const updateResult = await tx.programme.updateMany({
        where: {
          id: { in: finishedPrograms.map(p => p.id) }
        },
        data: {
          isArchived: true,
          archivedAt: now
        }
      });

      // Compter messages
      const messageCount = await tx.chatSession.count({
        where: {
          programmeId: { in: finishedPrograms.map(p => p.id) }
        }
      });

      console.log(`📦 ${updateResult.count} programmes archivés avec ${messageCount} messages`);

      return {
        programs: updateResult.count,
        messages: messageCount,
        details: finishedPrograms
      };
    }, {
      timeout: 45000 // 45 secondes pour transaction
    });

    return result;
    
  } catch (error) {
    console.error(`❌ Erreur avec connexion dédiée:`, error.message);
    throw error;
  } finally {
    // CRUCIAL: Fermer la connexion dédiée
    if (dedicatedPrisma) {
      console.log(`🔌 Fermeture connexion DÉDIÉE CRON...`);
      try {
        await dedicatedPrisma.$disconnect();
        console.log(`🔌 Connexion DÉDIÉE fermée`);
      } catch (error) {
        console.error(`⚠️ Erreur fermeture connexion dédiée:`, error.message);
      }
    }
  }
};

// Supprimer définitivement les programmes archivés depuis plus de 6 mois
const cleanupOldArchivedProgramsTask = async () => {
  // Pour l'instant, on garde l'ancien système pour les autres tâches
  const prismaService = require('../services/prismaService');
  const now = new Date();
  
  const result = await prismaService.executeWithTempConnection(async (prisma) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

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

    const messageCount = await prisma.chatSession.count({
      where: {
        programmeId: {
          in: oldArchivedPrograms.map(p => p.id)
        }
      }
    });

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

    console.log(`🗑️ Suppression définitive: ${deletedPrograms} programmes et ${messageCount} messages`);
    
    return {
      programs: deletedPrograms,
      messages: messageCount,
      details: deletedDetails
    };
  });
  
  return result;
};

// Nettoyer l'historique des chats kinés > 5 jours
const cleanOldKineChatHistory = async () => {
  const prismaService = require('../services/prismaService');
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
  console.log('🚀 Démarrage des tâches CRON - TEST CONNEXION DÉDIÉE...');

  // TEST: Archivage TOUTES LES HEURES avec connexion dédiée
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    const hour = now.getHours();
    console.log(`🕐 Test archivage CONNEXION DÉDIÉE - heure ${hour}h00`);
    
    await executeWithTimeout(
      `archivage programmes terminés DÉDIÉ (${hour}h00)`,
      archiveFinishedProgramsTask,
      90000 // 90 secondes
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Nettoyage chat kiné - 00h15
  cron.schedule('15 0 * * *', async () => {
    await executeWithTimeout(
      'nettoyage chat kiné',
      cleanOldKineChatHistory,
      60000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Nettoyage hebdomadaire - Mercredi 01h00
  cron.schedule('0 1 * * 3', async () => {
    await executeWithTimeout(
      'nettoyage programmes archivés',
      cleanupOldArchivedProgramsTask,
      300000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  console.log('✅ Tâches CRON configurées - CONNEXION DÉDIÉE');
  console.log('📅 Planning: CHAQUE HEURE archivage (connexion dédiée), 00h15 chat, mercredi 01h00 nettoyage');
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