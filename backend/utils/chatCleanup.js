// utils/chatCleanup.js - Version finale avec singleton prismaService
const cron = require('node-cron');
const prismaService = require('../services/prismaService');
const notificationService = require('../services/notificationService');
const logger = require('./logger');
const { sanitizeUID, sanitizeEmail, sanitizeId, sanitizeName } = require('./logSanitizer');

// Wrapper avec timeout et retry pour les tâches CRON
const executeWithTimeout = async (taskName, taskFunction, timeoutMs = 120000) => {
  const startTime = Date.now();

  // État du pool avant la tâche (sans healthCheck - min_instance=1)
  const statsBefore = prismaService.getConnectionStats();
  logger.info(`🚀 Démarrage ${taskName}...`, {
    poolStats: statsBefore
  });

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
    logger.info(`✅ ${taskName} terminé en ${Math.round(duration/1000)}s`);
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`❌ [${new Date().toISOString()}] Erreur ${taskName} après ${Math.round(duration/1000)}s:`, error.message);
    
    // Retry une seule fois si timeout
    if (error.message.includes('Timeout') && duration < timeoutMs) {
      logger.info(`🔄 Retry ${taskName} dans 30 secondes...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      try {
        const retryResult = await taskFunction();
        logger.info(`✅ ${taskName} réussi au retry`);
        return retryResult;
      } catch (retryError) {
        logger.error(`❌ ${taskName} échec au retry:`, retryError.message);
        throw retryError;
      }
    }
    
    throw error;
  }
};

// 🆕 TÂCHE BATCH : Créer notifications pour programmes terminés
// Version optimisée sans transaction interactive (évite blocage connexion)
const createProgramCompletedNotificationsTask = async () => {
  const now = new Date();

  logger.info(`🔔 Début création notifications programmes terminés`);

  try {
    const prisma = prismaService.getInstance();

    // Query 1 : Récupérer les programmes terminés (connexion libérée après)
    const completedPrograms = await prisma.programme.findMany({
      where: {
        dateFin: { lte: now },
        isArchived: false
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            kineId: true
          }
        },
        sessionValidations: {
          where: { isValidated: true },
          select: { id: true }
        }
      },
      orderBy: { dateFin: 'asc' },
      take: 100
    });

    logger.info(`📋 ${completedPrograms.length} programmes terminés trouvés`);

    if (completedPrograms.length === 0) {
      return { programmesTraites: 0, notificationsCreees: 0 };
    }

    // Query 2 : Récupérer TOUTES les notifications existantes en une seule query
    const existingNotifications = await prisma.notification.findMany({
      where: {
        type: 'PROGRAM_COMPLETED',
        programmeId: { in: completedPrograms.map(p => p.id) }
      },
      select: { programmeId: true }
    });

    // Traitement JS (aucune connexion DB utilisée)
    const existingProgramIds = new Set(existingNotifications.map(n => n.programmeId));
    const programmesToNotify = completedPrograms.filter(p => !existingProgramIds.has(p.id));

    logger.info(`📋 ${programmesToNotify.length} programmes sans notification`);

    if (programmesToNotify.length === 0) {
      return { programmesTraites: completedPrograms.length, notificationsCreees: 0 };
    }

    // Préparer les données pour batch insert (aucune connexion DB)
    const notificationsData = programmesToNotify.map(programme => {
      const totalDays = Math.ceil(
        (new Date(programme.dateFin) - new Date(programme.dateDebut)) / (1000 * 60 * 60 * 24)
      ) + 1;
      const validatedDays = programme.sessionValidations.length;
      const completionPercentage = Math.round((validatedDays / totalDays) * 100);
      const patientName = `${programme.patient.firstName} ${programme.patient.lastName}`;

      const metadata = {
        totalDays,
        validatedDays,
        completionPercentage,
        adherenceRatio: `${validatedDays}/${totalDays}`,
        adherenceText: `${validatedDays}/${totalDays} jours complétés, ${completionPercentage}% d'adhérence`,
        programmeStartDate: programme.dateDebut,
        programmeEndDate: programme.dateFin,
        completedAt: now.toISOString(),
        trigger: 'cron_daily_check'
      };

      return {
        type: 'PROGRAM_COMPLETED',
        title: 'Programme terminé',
        message: `Le programme "${programme.titre}" de ${patientName} est terminé`,
        kineId: programme.patient.kineId,
        patientId: programme.patient.id,
        programmeId: programme.id,
        metadata: JSON.stringify(metadata),
        isRead: false
      };
    });

    // Query 3 : INSERT BATCH en une seule query (connexion libérée après)
    const result = await prisma.notification.createMany({
      data: notificationsData,
      skipDuplicates: true  // Sécurité si doublon
    });

    // Log des détails
    const details = programmesToNotify.map(programme => {
      const totalDays = Math.ceil(
        (new Date(programme.dateFin) - new Date(programme.dateDebut)) / (1000 * 60 * 60 * 24)
      ) + 1;
      const validatedDays = programme.sessionValidations.length;
      const completionPercentage = Math.round((validatedDays / totalDays) * 100);
      const patientName = `${programme.patient.firstName} ${programme.patient.lastName}`;

      logger.info(`🔔 Notification créée: ${sanitizeName(patientName)} - ${programme.titre} - Adhérence ${validatedDays}/${totalDays} (${completionPercentage}%)`);

      return {
        programmeId: programme.id,
        titre: programme.titre,
        patient: patientName,
        adherence: `${validatedDays}/${totalDays} jours (${completionPercentage}%)`
      };
    });

    logger.info(`🔔 ${result.count} notifications créées pour programmes terminés`);

    return {
      programmesTraites: completedPrograms.length,
      notificationsCreees: result.count,
      details
    };

  } catch (error) {
    logger.error(`❌ Erreur création notifications:`, error.message);
    throw error;
  }
};

// Archiver les programmes terminés
const archiveFinishedProgramsTask = async () => {
  const now = new Date();
  logger.info(`📊 Début archivage`);

  try {
    const result = await prismaService.executeInTransactionForCron(async (tx) => {
      const finishedPrograms = await tx.programme.findMany({
        where: {
          dateFin: { lte: now },
          isArchived: false
        },
        select: { id: true, titre: true, dateFin: true },
        orderBy: { dateFin: 'asc' },
        take: 100
      });

      logger.info(`📋 ${finishedPrograms.length} programmes terminés trouvés`);

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

      logger.info(`📦 ${updateResult.count} programmes archivés avec ${messageCount} messages`);

      return {
        programs: updateResult.count,
        messages: messageCount,
        details: finishedPrograms
      };
    });

    return result;

  } catch (error) {
    logger.error(`❌ Erreur archivage:`, error.message);
    throw error;
  }
};


// Supprimer définitivement les programmes archivés
const cleanupOldArchivedProgramsTask = async () => {
  logger.info(`🗑️ Début nettoyage programmes archivés`);

  try {
    const result = await prismaService.executeInTransactionForCron(async (tx) => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      const oldArchivedPrograms = await tx.programme.findMany({
        where: {
          isArchived: true,
          archivedAt: {
            lt: tenYearsAgo
          }
        },
        select: { id: true, titre: true, archivedAt: true }
      });

      if (oldArchivedPrograms.length === 0) {
        logger.info('🧹 Aucun programme archivé à supprimer (< 10 ans)');
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
          logger.error(`❌ Erreur suppression programme ${program.id}:`, deleteError.message);
        }
      }

      logger.info(`🗑️ Suppression: ${deletedPrograms} programmes et ${messageCount} messages`);

      return {
        programs: deletedPrograms,
        messages: messageCount,
        details: deletedDetails
      };
    });

    return result;

  } catch (error) {
    logger.error(`❌ Erreur nettoyage programmes:`, error.message);
    throw error;
  }
};

// Démarrer les tâches automatiques - PRODUCTION avec backup et notifications
const startProgramCleanupCron = () => {
  logger.info('🚀 Démarrage PRODUCTION - Tâches cron avec singleton prismaService');

  // 🔍 DIAGNOSTIC: Afficher les paramètres du pool de connexions
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    logger.info('🔍 DATABASE_URL pool config:', {
      connection_limit: dbUrl.searchParams.get('connection_limit') || 'default',
      pool_timeout: dbUrl.searchParams.get('pool_timeout') || 'default',
      connect_timeout: dbUrl.searchParams.get('connect_timeout') || 'default',
      host: dbUrl.hostname
    });
  } catch (e) {
    logger.warn('⚠️ Impossible de parser DATABASE_URL pour diagnostic');
  }

  // 🔄 MIGRÉ VERS CLOUD SCHEDULER - Notifications programmes terminés
  // Cloud Scheduler appelle GET /test-notifications-programs en HTTP (CPU alloué)
  // → Résout le problème de CPU throttlé avec node-cron sur Cloud Run (facturation par requête)
  // Ancien cron node-cron désactivé :
  // cron.schedule('1 0 * * *', ...) → remplacé par Cloud Scheduler job "notifications-programmes-termines"
  // cron.schedule('9 0 * * *', ...) → backup supprimé (Cloud Scheduler a son propre retry)

  // PRODUCTION: Archivage programmes - 00h10 + backup 00h18
  cron.schedule('10 0 * * *', async () => {
    logger.info(`📅 [00h10] Archivage programmes PRINCIPAL`);
    
    await executeWithTimeout(
      'archivage programmes PRINCIPAL (00h10)',
      archiveFinishedProgramsTask,
      90000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('18 0 * * *', async () => {
    logger.info(`📅 [00h18] Archivage programmes BACKUP`);
    
    await executeWithTimeout(
      'archivage programmes BACKUP (00h18)',
      archiveFinishedProgramsTask,
      90000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });


  // PRODUCTION: Nettoyage programmes archivés - Mercredi 01h15 + backup 01h23
  cron.schedule('15 1 * * 3', async () => {
    logger.info(`🗑️ [Mercredi 01h15] Nettoyage programmes archivés PRINCIPAL`);
    
    await executeWithTimeout(
      'nettoyage programmes archivés PRINCIPAL (01h15)',
      cleanupOldArchivedProgramsTask,
      120000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('23 1 * * 3', async () => {
    logger.info(`🗑️ [Mercredi 01h23] Nettoyage programmes archivés BACKUP`);

    await executeWithTimeout(
      'nettoyage programmes archivés BACKUP (01h23)',
      cleanupOldArchivedProgramsTask,
      120000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  logger.info('✅ PRODUCTION configurée - 6 tâches avec backup automatique + notifications');
  logger.info('📅 Planning: 00h01+00h09 notifications, 00h10+00h18 archivage, mercredi 01h15+01h23 nettoyage programmes');
  logger.info('🔒 Toutes les tâches utilisent le singleton prismaService');
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


// 🆕 NOUVEAU: Test manuel notifications
const manualNotificationsTest = async () => {
  return await executeWithTimeout(
    'test manuel notifications programmes',
    createProgramCompletedNotificationsTask,
    60000
  );
};

module.exports = {
  startProgramCleanupCron,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask,
  createProgramCompletedNotificationsTask,
  manualArchiveTest,
  manualCleanupTest,
  manualNotificationsTest
};