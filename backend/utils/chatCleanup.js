// utils/chatCleanup.js - Version finale avec connexions dédiées, backup et notifications
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
const logger = require('./logger');

// Wrapper avec timeout et retry pour les tâches CRON
const executeWithTimeout = async (taskName, taskFunction, timeoutMs = 120000) => {
  const startTime = Date.now();
  logger.info(`🚀 Démarrage ${taskName}...`);
  
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

// 🆕 NOUVELLE TÂCHE : Créer notifications pour programmes terminés
const createProgramCompletedNotificationsTask = async () => {
  const now = new Date();
  logger.info(`🔔 Début création notifications programmes terminés CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    logger.info(`🔧 Création connexion DÉDIÉE pour notifications programmes`);
    
    const cronDbUrl = new URL(process.env.DATABASE_URL);
    cronDbUrl.searchParams.set('connection_limit', '1');
    cronDbUrl.searchParams.set('pool_timeout', '60');
    cronDbUrl.searchParams.set('connect_timeout', '30');
    cronDbUrl.searchParams.set('application_name', 'kine_program_notifications');
    
    dedicatedPrisma = new PrismaClient({
      log: ['error', 'warn'],
      datasources: {
        db: {
          url: cronDbUrl.toString()
        }
      }
    });
    
    logger.info(`✅ Connexion DÉDIÉE établie - recherche programmes terminés`);
    
    const result = await dedicatedPrisma.$transaction(async (tx) => {
      // Trouver les programmes terminés (dateFin <= aujourd'hui) et pas encore archivés
      const completedPrograms = await tx.programme.findMany({
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

      let notificationsCreees = 0;
      const details = [];

      for (const programme of completedPrograms) {
        try {
          // Vérifier si une notification PROGRAM_COMPLETED existe déjà
          const existingNotification = await tx.notification.findFirst({
            where: {
              type: 'PROGRAM_COMPLETED',
              kineId: programme.patient.kineId,
              patientId: programme.patient.id,
              programmeId: programme.id
            }
          });

          if (!existingNotification) {
            // Calculer les statistiques de completion
            const totalDays = Math.ceil(
              (new Date(programme.dateFin) - new Date(programme.dateDebut)) / (1000 * 60 * 60 * 24)
            ) + 1;
            const validatedDays = programme.sessionValidations.length;
            const completionPercentage = Math.round((validatedDays / totalDays) * 100);

            // Créer la notification
            const patientName = `${programme.patient.firstName} ${programme.patient.lastName}`;
            const title = 'Programme terminé';
            const message = `Le programme "${programme.titre}" de ${patientName} est terminé - Adhérence ${validatedDays}/${totalDays} jours (${completionPercentage}%)`;

            const metadata = {
              totalDays,
              validatedDays,
              completionPercentage,
              adherenceRatio: `${validatedDays}/${totalDays}`,
              programmeStartDate: programme.dateDebut,
              programmeEndDate: programme.dateFin,
              completedAt: now.toISOString(),
              trigger: 'cron_daily_check'
            };

            await tx.notification.create({
              data: {
                type: 'PROGRAM_COMPLETED',
                title,
                message,
                kineId: programme.patient.kineId,
                patientId: programme.patient.id,
                programmeId: programme.id,
                metadata: JSON.stringify(metadata),
                isRead: false
              }
            });

            notificationsCreees++;
            details.push({
              programmeId: programme.id,
              titre: programme.titre,
              patient: patientName,
              adherence: `${validatedDays}/${totalDays} jours (${completionPercentage}%)`
            });

            logger.info(`🔔 Notification créée: ${patientName} - ${programme.titre} - Adhérence ${validatedDays}/${totalDays} (${completionPercentage}%)`);
          } else {
            logger.info(`⏭️ Notification déjà existante pour programme ${programme.id}`);
          }
        } catch (notifError) {
          logger.error(`❌ Erreur création notification programme ${programme.id}:`, notifError.message);
        }
      }

      logger.info(`🔔 ${notificationsCreees} notifications créées pour programmes terminés`);

      return {
        programmesTraites: completedPrograms.length,
        notificationsCreees,
        details
      };
    }, {
      timeout: 60000
    });

    return result;
    
  } catch (error) {
    logger.error(`❌ Erreur création notifications:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      logger.info(`🔌 Fermeture connexion DÉDIÉE notifications`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        logger.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Archiver les programmes terminés - VERSION CONNEXION DÉDIÉE
const archiveFinishedProgramsTask = async () => {
  const now = new Date();
  logger.info(`📊 Début archivage CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    logger.info(`🔧 Création connexion Prisma DÉDIÉE pour archivage`);
    
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
    
    logger.info(`✅ Connexion DÉDIÉE établie - recherche programmes terminés`);
    
    const result = await dedicatedPrisma.$transaction(async (tx) => {
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
    }, {
      timeout: 45000
    });

    return result;
    
  } catch (error) {
    logger.error(`❌ Erreur archivage:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      logger.info(`🔌 Fermeture connexion DÉDIÉE archivage`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        logger.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Nettoyer l'historique des chats kinés - VERSION CONNEXION DÉDIÉE
const cleanOldKineChatHistory = async () => {
  logger.info(`💬 Début nettoyage chat kiné CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    logger.info(`🔧 Création connexion DÉDIÉE pour nettoyage chat`);
    
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
    
    logger.info(`🗑️ Chat kiné: ${result.count} messages supprimés (> 5 jours)`);
    return result;
    
  } catch (error) {
    logger.error(`❌ Erreur nettoyage chat:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      logger.info(`🔌 Fermeture connexion DÉDIÉE nettoyage chat`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        logger.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Supprimer définitivement les programmes archivés - VERSION CONNEXION DÉDIÉE
const cleanupOldArchivedProgramsTask = async () => {
  logger.info(`🗑️ Début nettoyage programmes archivés CONNEXION DÉDIÉE`);
  
  let dedicatedPrisma = null;
  
  try {
    logger.info(`🔧 Création connexion DÉDIÉE pour nettoyage programmes`);
    
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
        logger.info('🧹 Aucun programme archivé à supprimer (< 6 mois)');
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
    }, {
      timeout: 60000
    });

    return result;
    
  } catch (error) {
    logger.error(`❌ Erreur nettoyage programmes:`, error.message);
    throw error;
  } finally {
    if (dedicatedPrisma) {
      logger.info(`🔌 Fermeture connexion DÉDIÉE nettoyage programmes`);
      try {
        await dedicatedPrisma.$disconnect();
      } catch (error) {
        logger.error(`⚠️ Erreur fermeture:`, error.message);
      }
    }
  }
};

// Démarrer les tâches automatiques - PRODUCTION avec backup et notifications
const startProgramCleanupCron = () => {
  logger.info('🚀 Démarrage PRODUCTION - Toutes tâches CONNEXION DÉDIÉE avec backup et notifications');

  // 🆕 NOUVEAU: Notifications programmes terminés - 00h01 + backup 00h09
  cron.schedule('1 0 * * *', async () => {
    logger.info(`🔔 [00h01] Notifications programmes terminés PRINCIPAL`);
    
    await executeWithTimeout(
      'notifications programmes terminés PRINCIPAL (00h01)',
      createProgramCompletedNotificationsTask,
      90000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('9 0 * * *', async () => {
    logger.info(`🔔 [00h09] Notifications programmes terminés BACKUP`);
    
    await executeWithTimeout(
      'notifications programmes terminés BACKUP (00h09)',
      createProgramCompletedNotificationsTask,
      90000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

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

  // PRODUCTION: Nettoyage chat kiné - 00h30 + backup 00h38
  cron.schedule('30 0 * * *', async () => {
    logger.info(`💬 [00h30] Nettoyage chat kiné PRINCIPAL`);
    
    await executeWithTimeout(
      'nettoyage chat kiné PRINCIPAL (00h30)',
      cleanOldKineChatHistory,
      60000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('38 0 * * *', async () => {
    logger.info(`💬 [00h38] Nettoyage chat kiné BACKUP`);
    
    await executeWithTimeout(
      'nettoyage chat kiné BACKUP (00h38)',
      cleanOldKineChatHistory,
      60000
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

  logger.info('✅ PRODUCTION configurée - 8 tâches avec backup automatique + notifications');
  logger.info('📅 Planning: 00h01+00h09 notifications, 00h10+00h18 archivage, 00h30+00h38 chat, mercredi 01h15+01h23 nettoyage');
  logger.info('🔒 Toutes les tâches utilisent des connexions dédiées');
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
  cleanOldKineChatHistory,
  createProgramCompletedNotificationsTask, // 🆕 NOUVEAU
  manualArchiveTest,
  manualCleanupTest,
  manualKineChatCleanupTest,
  manualNotificationsTest // 🆕 NOUVEAU
};