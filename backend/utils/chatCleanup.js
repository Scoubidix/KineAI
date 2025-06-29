// utils/chatCleanup.js - Version finale avec connexions dédiées et backup
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
  console.log(`📊 Début archivage CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    console.log(`🔧 Création connexion Prisma DÉDIÉE pour archivage`);
    
    const cronDbUrl = new URL(process.env.DATABASE_URL);
    cronDbUrl.searchParams.set('connection_limit', '1');
    cronDbUrl.searchParams.set('pool_timeout', '60');
    cronDbUrl.searchParams.set('connect_timeout', '30');
    cronDbUrl.searchParams.set('application_name', 'kine_archive');
    
    dedicatedPrisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: cronDbUrl.toString()
        }
      }
    });
    
    console.log(`✅ Connexion DÉDIÉE établie - recherche programmes terminés`);
    
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

      const updateResult = await tx.programme.updateMany({
        where: {
          id: { in: finishedPrograms.map(p => p.id) }
        },
        data: {
          isArchived: true,
          archivedAt: now
        }
      });

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
      timeout: 45000
    });

    return result;
    
  } catch (error) {
    console.error(`❌ Erreur archivage:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      console.log(`🔌 Fermeture connexion DÉDIÉE archivage`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        console.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Nettoyer l'historique des chats kinés - VERSION CONNEXION DÉDIÉE
const cleanOldKineChatHistory = async () => {
  console.log(`💬 Début nettoyage chat kiné CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    console.log(`🔧 Création connexion DÉDIÉE pour nettoyage chat`);
    
    const cronDbUrl = new URL(process.env.DATABASE_URL);
    cronDbUrl.searchParams.set('connection_limit', '1');
    cronDbUrl.searchParams.set('pool_timeout', '60');
    cronDbUrl.searchParams.set('connect_timeout', '30');
    cronDbUrl.searchParams.set('application_name', 'kine_cleanup_chat');
    
    dedicatedPrisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: cronDbUrl.toString()
        }
      }
    });
    
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const result = await dedicatedPrisma.chatKine.deleteMany({
      where: {
        createdAt: {
          lt: fiveDaysAgo
        }
      }
    });
    
    console.log(`🗑️ Chat kiné: ${result.count} messages supprimés (> 5 jours)`);
    return result;
    
  } catch (error) {
    console.error(`❌ Erreur nettoyage chat:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      console.log(`🔌 Fermeture connexion DÉDIÉE nettoyage chat`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        console.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Supprimer définitivement les programmes archivés - VERSION CONNEXION DÉDIÉE
const cleanupOldArchivedProgramsTask = async () => {
  console.log(`🗑️ Début nettoyage programmes archivés CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    console.log(`🔧 Création connexion DÉDIÉE pour nettoyage programmes`);
    
    const cronDbUrl = new URL(process.env.DATABASE_URL);
    cronDbUrl.searchParams.set('connection_limit', '1');
    cronDbUrl.searchParams.set('pool_timeout', '60');
    cronDbUrl.searchParams.set('connect_timeout', '30');
    cronDbUrl.searchParams.set('application_name', 'kine_cleanup_programs');
    
    dedicatedPrisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: cronDbUrl.toString()
        }
      }
    });

    const result = await dedicatedPrisma.$transaction(async (tx) => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const oldArchivedPrograms = await tx.programme.findMany({
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

      const messageCount = await tx.chatSession.count({
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
          await tx.programme.delete({
            where: { id: program.id }
          });
          
          deletedPrograms++;
          deletedDetails.push({
            id: program.id,
            titre: program.titre,
            archivedAt: program.archivedAt
          });
        } catch (deleteError) {
          console.error(`❌ Erreur suppression programme ${program.id}:`, deleteError.message);
        }
      }

      console.log(`🗑️ Suppression: ${deletedPrograms} programmes et ${messageCount} messages`);
      
      return {
        programs: deletedPrograms,
        messages: messageCount,
        details: deletedDetails
      };
    }, {
      timeout: 60000
    });

    return result;
    
  } catch (error) {
    console.error(`❌ Erreur nettoyage programmes:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      console.log(`🔌 Fermeture connexion DÉDIÉE nettoyage programmes`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        console.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Démarrer les tâches automatiques - PRODUCTION avec backup
const startProgramCleanupCron = () => {
  console.log('🚀 Démarrage PRODUCTION - Toutes tâches CONNEXION DÉDIÉE avec backup');

  // PRODUCTION: Archivage programmes - 23h30 + backup 23h40
  cron.schedule('30 23 * * *', async () => {
    console.log(`📅 [23h30] Archivage programmes PRINCIPAL`);
    
    await executeWithTimeout(
      'archivage programmes PRINCIPAL (23h30)',
      archiveFinishedProgramsTask,
      90000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('40 23 * * *', async () => {
    console.log(`📅 [23h40] Archivage programmes BACKUP`);
    
    await executeWithTimeout(
      'archivage programmes BACKUP (23h40)',
      archiveFinishedProgramsTask,
      90000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // PRODUCTION: Nettoyage chat kiné - 00h15 + backup 00h25
  cron.schedule('15 0 * * *', async () => {
    console.log(`💬 [00h15] Nettoyage chat kiné PRINCIPAL`);
    
    await executeWithTimeout(
      'nettoyage chat kiné PRINCIPAL (00h15)',
      cleanOldKineChatHistory,
      60000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('25 0 * * *', async () => {
    console.log(`💬 [00h25] Nettoyage chat kiné BACKUP`);
    
    await executeWithTimeout(
      'nettoyage chat kiné BACKUP (00h25)',
      cleanOldKineChatHistory,
      60000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // PRODUCTION: Nettoyage programmes archivés - Mercredi 01h15 + backup 01h25
  cron.schedule('15 1 * * 3', async () => {
    console.log(`🗑️ [Mercredi 01h15] Nettoyage programmes archivés PRINCIPAL`);
    
    await executeWithTimeout(
      'nettoyage programmes archivés PRINCIPAL (01h15)',
      cleanupOldArchivedProgramsTask,
      120000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('25 1 * * 3', async () => {
    console.log(`🗑️ [Mercredi 01h25] Nettoyage programmes archivés BACKUP`);
    
    await executeWithTimeout(
      'nettoyage programmes archivés BACKUP (01h25)',
      cleanupOldArchivedProgramsTask,
      120000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  console.log('✅ PRODUCTION configurée - 6 tâches avec backup automatique');
  console.log('📅 Planning: 23h30+23h40 archivage, 00h15+00h25 chat, mercredi 01h15+01h25 nettoyage');
  console.log('🔒 Toutes les tâches utilisent des connexions dédiées');
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