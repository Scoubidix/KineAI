// services/notificationTriggers.js
const notificationService = require('./notificationService');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');

class NotificationTriggers {

  /**
   * Déclencher les notifications après validation d'une session
   */
  async handleSessionValidation(validation, patient, programme) {
    try {
      const notifications = [];

      // 1. NOTIFICATION DE VALIDATION QUOTIDIENNE (toujours créée)
      const dailyValidationNotif = await this.createDailyValidationNotification(
        validation, 
        patient, 
        programme
      );
      if (dailyValidationNotif.success) {
        notifications.push(dailyValidationNotif.notification);
      }

      // 2. ALERTE DOULEUR (si niveau >= 7)
      if (validation.painLevel >= 7) {
        const painAlertNotif = await this.createPainAlertNotification(
          validation, 
          patient, 
          programme
        );
        if (painAlertNotif.success) {
          notifications.push(painAlertNotif.notification);
        }
      }

      // 3. VÉRIFIER SI LE PROGRAMME EST TERMINÉ
      const programCompletedNotif = await this.checkAndCreateProgramCompletedNotification(
        validation,
        patient, 
        programme
      );
      if (programCompletedNotif.success && programCompletedNotif.notification) {
        notifications.push(programCompletedNotif.notification);
      }

      logger.info(`🔔 TRIGGERS: ${notifications.length} notifications créées pour validation session`);

      return {
        success: true,
        notifications,
        count: notifications.length
      };

    } catch (error) {
      logger.error('Erreur déclenchement notifications:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Créer notification de validation quotidienne
   */
  async createDailyValidationNotification(validation, patient, programme) {
    try {
      const patientName = `${patient.firstName} ${patient.lastName}`;
      const validationDate = new Date(validation.date).toLocaleDateString('fr-FR');
      
      const title = 'Validation journée';
      const message = `${patientName} a validé sa journée du ${validationDate} (${programme.titre})`;

      const metadata = {
        validationDate: validation.date,
        painLevel: validation.painLevel,
        difficultyLevel: validation.difficultyLevel,
        validatedAt: validation.validatedAt
      };

      // ✅ kineId maintenant garanti depuis patientChat.js
      if (!patient.kineId) {
        throw new Error(`KineId manquant pour le patient ${patient.id}`);
      }

      return await notificationService.createNotification({
        type: 'DAILY_VALIDATION',
        title,
        message,
        kineId: patient.kineId,
        patientId: patient.id,
        programmeId: programme.id,
        metadata
      });

    } catch (error) {
      logger.error('Erreur création notification validation quotidienne:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Créer notification d'alerte douleur
   */
  async createPainAlertNotification(validation, patient, programme) {
    try {
      const patientName = `${patient.firstName} ${patient.lastName}`;
      
      const title = 'Alerte douleur';
      const message = `${patientName} signale une douleur niveau ${validation.painLevel}/10 (${programme.titre})`;

      const metadata = {
        painLevel: validation.painLevel,
        difficultyLevel: validation.difficultyLevel,
        validationDate: validation.date,
        validatedAt: validation.validatedAt,
        alertThreshold: 7
      };

      // ✅ kineId maintenant garanti depuis patientChat.js
      if (!patient.kineId) {
        throw new Error(`KineId manquant pour le patient ${patient.id}`);
      }

      return await notificationService.createNotification({
        type: 'PAIN_ALERT',
        title,
        message,
        kineId: patient.kineId,
        patientId: patient.id,
        programmeId: programme.id,
        metadata
      });

    } catch (error) {
      logger.error('Erreur création notification alerte douleur:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Vérifier si le programme est terminé et créer la notification
   * 🔧 FIX: Comparaison de dates corrigée pour détecter fin de programme le bon jour
   */
  async checkAndCreateProgramCompletedNotification(validation, patient, programme) {
    try {
      const prisma = prismaService.getInstance();

      // Récupérer toutes les validations de ce programme
      const allValidations = await prisma.sessionValidation.findMany({
        where: {
          patientId: patient.id,
          programmeId: programme.id,
          isValidated: true
        },
        orderBy: {
          date: 'asc'
        }
      });

      // Calculer le nombre de jours de validation attendus
      const programmeStartDate = new Date(programme.dateDebut);
      const programmeEndDate = new Date(programme.dateFin);
      
      // 🔧 FIX: Créer des dates "jour seulement" pour comparaison correcte
      const programmeStartDay = new Date(programmeStartDate.getFullYear(), programmeStartDate.getMonth(), programmeStartDate.getDate());
      const programmeEndDay = new Date(programmeEndDate.getFullYear(), programmeEndDate.getMonth(), programmeEndDate.getDate());
      
      const totalDays = Math.ceil((programmeEndDay - programmeStartDay) / (1000 * 60 * 60 * 24)) + 1;

      // Vérifier si le programme est maintenant terminé
      const validatedDays = allValidations.length;
      const completionPercentage = Math.round((validatedDays / totalDays) * 100);

      // 🔧 FIX: Comparaison de dates jour seulement (sans heures)
      const now = new Date();
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const isPastEndDate = currentDay >= programmeEndDay;
      const isHighCompletion = completionPercentage >= 90;

      // 🔍 DEBUG: Logs pour comprendre la logique
      logger.debug(`🔍 PROGRAMME COMPLETION DEBUG:`);
      logger.debug(`🔍 - Programme: ${programme.titre} (ID: ${programme.id})`);
      logger.debug(`🔍 - Date début: ${programmeStartDay.toISOString().split('T')[0]}`);
      logger.debug(`🔍 - Date fin: ${programmeEndDay.toISOString().split('T')[0]}`);
      logger.debug(`🔍 - Date actuelle: ${currentDay.toISOString().split('T')[0]}`);
      logger.debug(`🔍 - isPastEndDate: ${isPastEndDate}`);
      logger.debug(`🔍 - Jours validés: ${validatedDays}/${totalDays} (${completionPercentage}%)`);
      logger.debug(`🔍 - isHighCompletion: ${isHighCompletion}`);

      if (isPastEndDate || isHighCompletion) {
        // Vérifier qu'on n'a pas déjà créé cette notification
        const existingNotification = await prisma.notification.findFirst({
          where: {
            type: 'PROGRAM_COMPLETED',
            kineId: patient.kineId,
            patientId: patient.id,
            programmeId: programme.id
          }
        });

        if (!existingNotification) {
          // Créer la notification de programme terminé
          const patientName = `${patient.firstName} ${patient.lastName}`;
          
          const title = 'Programme terminé';
          const message = `Le programme "${programme.titre}" de ${patientName} est terminé`;

          const metadata = {
            totalDays,
            validatedDays,
            completionPercentage,
            adherenceRatio: `${validatedDays}/${totalDays}`,
            adherenceText: `${validatedDays}/${totalDays} jours complétés, ${completionPercentage}% d'adhérence`,
            programmeStartDate: programme.dateDebut,
            programmeEndDate: programme.dateFin,
            completedAt: new Date().toISOString(),
            trigger: isPastEndDate ? 'date_reached' : 'high_completion'
          };

          // ✅ kineId maintenant garanti depuis patientChat.js
          if (!patient.kineId) {
            throw new Error(`KineId manquant pour le patient ${patient.id}`);
          }

          const result = await notificationService.createNotification({
            type: 'PROGRAM_COMPLETED',
            title,
            message,
            kineId: patient.kineId,
            patientId: patient.id,
            programmeId: programme.id,
            metadata
          });

          logger.info(`🎉 PROGRAMME TERMINÉ: ${patientName} - ${programme.titre} - Adhérence ${validatedDays}/${totalDays} (${completionPercentage}%)`);
          logger.info(`🎉 Trigger: ${isPastEndDate ? 'Date atteinte' : 'Adhérence élevée'}`);

          return result;
        } else {
          logger.debug(`⚠️ PROGRAMME TERMINÉ: Notification déjà existante pour ${programme.titre}`);
        }
      } else {
        logger.debug(`⏳ PROGRAMME EN COURS: ${programme.titre} - ${validatedDays}/${totalDays} jours (${completionPercentage}%)`);
      }

      // Programme pas encore terminé ou notification déjà créée
      return {
        success: true,
        notification: null,
        isCompleted: isPastEndDate || isHighCompletion,
        progress: {
          validatedDays,
          totalDays,
          completionPercentage
        }
      };

    } catch (error) {
      logger.error('Erreur vérification programme terminé:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Déclencher notification de message patient (pour l'intégration future)
   */
  async handlePatientMessage(chatSession, patient, programme) {
    try {
      // Cette fonction sera utilisée si on veut créer des notifications
      // pour certains types de messages patients (ex: questions urgentes)
      
      const patientName = `${patient.firstName} ${patient.lastName}`;
      const messagePreview = chatSession.message.length > 100 
        ? chatSession.message.substring(0, 100) + '...'
        : chatSession.message;

      const title = 'Nouveau message patient';
      const message = `${patientName}: "${messagePreview}"`;

      const metadata = {
        messageId: chatSession.id,
        messagePreview,
        timestamp: chatSession.createdAt
      };

      return await notificationService.createNotification({
        type: 'PATIENT_MESSAGE',
        title,
        message,
        kineId: patient.kineId,
        patientId: patient.id,
        programmeId: programme.id,
        metadata
      });

    } catch (error) {
      logger.error('Erreur création notification message patient:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Utilitaire : Supprimer les notifications en doublon
   */
  async cleanupDuplicateNotifications(kineId) {
    try {
      const prisma = prismaService.getInstance();

      // Supprimer les doublons de validation quotidienne (même patient, même date, même programme)
      const duplicates = await prisma.$queryRaw`
        SELECT id FROM notifications 
        WHERE type = 'DAILY_VALIDATION' 
        AND kine_id = ${kineId}
        AND id NOT IN (
          SELECT MIN(id) 
          FROM notifications 
          WHERE type = 'DAILY_VALIDATION' 
          AND kine_id = ${kineId}
          GROUP BY patient_id, programme_id, DATE(created_at)
        )
      `;

      if (duplicates.length > 0) {
        const duplicateIds = duplicates.map(d => d.id);
        const deleteResult = await prisma.notification.deleteMany({
          where: {
            id: { in: duplicateIds }
          }
        });

        logger.info(`🧹 CLEANUP: ${deleteResult.count} notifications dupliquées supprimées`);
      }

      return {
        success: true,
        deletedCount: duplicates.length
      };

    } catch (error) {
      logger.error('Erreur nettoyage doublons notifications:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new NotificationTriggers();