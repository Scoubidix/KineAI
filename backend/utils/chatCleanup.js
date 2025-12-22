// utils/chatCleanup.js - Version finale avec singleton prismaService
const cron = require('node-cron');
const prismaService = require('../services/prismaService');
const notificationService = require('../services/notificationService');
const logger = require('./logger');
const { sanitizeUID, sanitizeEmail, sanitizeId, sanitizeName } = require('./logSanitizer');
const admin = require('firebase-admin');

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
  logger.info(`🔔 Début création notifications programmes terminés`);

  try {
    const prisma = prismaService.getInstance();

    const result = await prisma.$transaction(async (tx) => {
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
            const patientName = `${programme.patient.firstName} ${programme.patient.lastName}`;  // ✅ NOM COMPLET pour BDD
            const title = 'Programme terminé';
            const message = `Le programme "${programme.titre}" de ${patientName} est terminé`;  // ✅ NOM COMPLET

            const metadata = {
              totalDays,
              validatedDays,
              completionPercentage,
              adherenceRatio: `${validatedDays}/${totalDays}`,
              adherenceText: `${validatedDays}/${totalDays} jours complétés, ${completionPercentage}% d'adhérence`,  // ✅ Ajout adherenceText
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

            logger.info(`🔔 Notification créée: ${sanitizeName(patientName)} - ${programme.titre} - Adhérence ${validatedDays}/${totalDays} (${completionPercentage}%)`);
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
  }
};

// Archiver les programmes terminés
const archiveFinishedProgramsTask = async () => {
  const now = new Date();
  logger.info(`📊 Début archivage`);

  try {
    const prisma = prismaService.getInstance();

    const result = await prisma.$transaction(async (tx) => {
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
  }
};


// Supprimer définitivement les programmes archivés
const cleanupOldArchivedProgramsTask = async () => {
  logger.info(`🗑️ Début nettoyage programmes archivés`);

  try {
    const prisma = prismaService.getInstance();

    const result = await prisma.$transaction(async (tx) => {
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
  }
};

// Supprimer les GIFs orphelins de Firebase Storage
const cleanupOrphanGifsTask = async () => {
  logger.info(`🗑️ Début nettoyage GIFs orphelins`);

  try {
    const prisma = prismaService.getInstance();

    // 1. Récupérer tous les GIFs de Firebase Storage
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'exercices/' });

    const firebaseGifs = files
      .filter(file => file.name.endsWith('.gif'))
      .map(file => {
        const encodedPath = encodeURIComponent(file.name);
        return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
      });

    logger.info(`📂 ${firebaseGifs.length} GIFs trouvés dans Firebase Storage`);

    if (firebaseGifs.length === 0) {
      logger.info('🧹 Aucun GIF dans Firebase Storage');
      return { gifsChecked: 0, gifsDeleted: 0 };
    }

    // 2. Récupérer tous les gifUrl de la base de données
    const exercicesWithGifs = await prisma.exerciceModele.findMany({
      where: {
        gifUrl: { not: null }
      },
      select: { gifUrl: true }
    });

    const dbGifUrls = new Set(exercicesWithGifs.map(ex => ex.gifUrl));
    logger.info(`📋 ${dbGifUrls.size} GIFs référencés dans la base de données`);

    // 3. Identifier les GIFs orphelins
    const orphanGifs = firebaseGifs.filter(gifUrl => !dbGifUrls.has(gifUrl));
    logger.info(`🔍 ${orphanGifs.length} GIFs orphelins détectés`);

    if (orphanGifs.length === 0) {
      logger.info('✅ Aucun GIF orphelin à supprimer');
      return { gifsChecked: firebaseGifs.length, gifsDeleted: 0 };
    }

    // 4. Filtrer les GIFs orphelins > 24h (via métadonnées)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    let deletedCount = 0;
    const deletedDetails = [];

    for (const gifUrl of orphanGifs) {
      try {
        // Extraire le chemin du fichier depuis l'URL
        const match = gifUrl.match(/\/o\/([^?]+)\?/);
        if (!match) {
          logger.warn(`⚠️ Format URL invalide: ${gifUrl}`);
          continue;
        }

        const filePath = decodeURIComponent(match[1]);
        const file = bucket.file(filePath);

        // Vérifier l'âge du fichier
        const [metadata] = await file.getMetadata();
        const createdAt = new Date(metadata.timeCreated);

        if (createdAt < oneDayAgo) {
          // Supprimer le GIF orphelin de plus de 24h
          await file.delete();
          deletedCount++;

          deletedDetails.push({
            url: gifUrl,
            path: filePath,
            createdAt: metadata.timeCreated,
            age: Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)) + 'h'
          });

          logger.info(`🗑️ GIF orphelin supprimé: ${filePath} (créé ${Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60))}h ago)`);
        } else {
          logger.info(`⏳ GIF orphelin récent ignoré: ${filePath} (créé ${Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60))}h ago)`);
        }
      } catch (deleteError) {
        logger.error(`❌ Erreur suppression GIF ${gifUrl}:`, deleteError.message);
      }
    }

    logger.info(`🗑️ Nettoyage terminé: ${deletedCount} GIFs orphelins supprimés sur ${orphanGifs.length} détectés`);

    return {
      gifsChecked: firebaseGifs.length,
      orphansDetected: orphanGifs.length,
      gifsDeleted: deletedCount,
      details: deletedDetails
    };

  } catch (error) {
    logger.error(`❌ Erreur nettoyage GIFs:`, error.message);
    throw error;
  }
};

// Démarrer les tâches automatiques - PRODUCTION avec backup et notifications
const startProgramCleanupCron = () => {
  logger.info('🚀 Démarrage PRODUCTION - Tâches cron avec singleton prismaService');

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

  // PRODUCTION: Nettoyage GIFs orphelins - Mercredi 01h30 + backup 01h38
  cron.schedule('30 1 * * 3', async () => {
    logger.info(`🗑️ [Mercredi 01h30] Nettoyage GIFs orphelins PRINCIPAL`);

    await executeWithTimeout(
      'nettoyage GIFs orphelins PRINCIPAL (01h30)',
      cleanupOrphanGifsTask,
      120000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  cron.schedule('38 1 * * 3', async () => {
    logger.info(`🗑️ [Mercredi 01h38] Nettoyage GIFs orphelins BACKUP`);

    await executeWithTimeout(
      'nettoyage GIFs orphelins BACKUP (01h38)',
      cleanupOrphanGifsTask,
      120000
    );
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  logger.info('✅ PRODUCTION configurée - 8 tâches avec backup automatique + notifications');
  logger.info('📅 Planning: 00h01+00h09 notifications, 00h10+00h18 archivage, mercredi 01h15+01h23 nettoyage programmes, mercredi 01h30+01h38 nettoyage GIFs');
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

// 🆕 NOUVEAU: Test manuel nettoyage GIFs orphelins
const manualGifCleanupTest = async () => {
  return await executeWithTimeout(
    'test manuel nettoyage GIFs orphelins',
    cleanupOrphanGifsTask,
    120000
  );
};

module.exports = {
  startProgramCleanupCron,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask,
  createProgramCompletedNotificationsTask, // 🆕 NOUVEAU
  cleanupOrphanGifsTask, // 🆕 NOUVEAU
  manualArchiveTest,
  manualCleanupTest,
  manualNotificationsTest, // 🆕 NOUVEAU
  manualGifCleanupTest // 🆕 NOUVEAU
};