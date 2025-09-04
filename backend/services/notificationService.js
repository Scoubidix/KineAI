// services/notificationService.js
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

class NotificationService {
  
  /**
   * Créer une nouvelle notification
   */
  async createNotification({ 
    type, 
    title, 
    message, 
    kineId, 
    patientId = null, 
    programmeId = null, 
    metadata = null 
  }) {
    try {
      const prisma = prismaService.getInstance();
      
      const notification = await prisma.notification.create({
        data: {
          type,
          title,
          message,
          kineId,
          patientId,
          programmeId,
          metadata: metadata ? JSON.stringify(metadata) : null,
          isRead: false
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          programme: {
            select: {
              id: true,
              titre: true
            }
          }
        }
      });

      logger.info(`📢 NOTIFICATION: ${type} créée pour kiné ${sanitizeId(kineId)} - ${title}`);
      
      return {
        success: true,
        notification
      };

    } catch (error) {
      logger.error('Erreur création notification:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Récupérer les notifications d'un kiné avec filtres
   */
  async getNotificationsByKine(kineUid, options = {}) {
    try {
      const prisma = prismaService.getInstance();
      
      // Récupérer d'abord le kiné par son UID Firebase
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid },
        select: { id: true }
      });

      if (!kine) {
        return {
          success: false,
          error: 'Kinésithérapeute non trouvé'
        };
      }

      const {
        isRead = null,
        type = null,
        limit = 50,
        offset = 0
      } = options;

      // Construire les filtres
      const where = {
        kineId: kine.id
      };

      if (isRead !== null) {
        where.isRead = isRead;
      }

      if (type) {
        where.type = type;
      }

      // Récupérer les notifications
      const notifications = await prisma.notification.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          programme: {
            select: {
              id: true,
              titre: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset
      });

      // Compter le total
      const total = await prisma.notification.count({ where });

      // Formatter les données
      const formattedNotifications = notifications.map(notif => ({
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        isRead: notif.isRead,
        createdAt: notif.createdAt,
        patient: notif.patient ? {
          id: notif.patient.id,
          name: `${notif.patient.firstName} ${notif.patient.lastName}`
        } : null,
        programme: notif.programme ? {
          id: notif.programme.id,
          titre: notif.programme.titre
        } : null,
        metadata: notif.metadata ? JSON.parse(notif.metadata) : null
      }));

      return {
        success: true,
        notifications: formattedNotifications,
        pagination: {
          total,
          limit,
          offset,
          hasMore: (offset + limit) < total
        }
      };

    } catch (error) {
      logger.error('Erreur récupération notifications:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Compter les notifications non lues d'un kiné
   */
  async getUnreadCount(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      // Récupérer le kiné par son UID Firebase
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid },
        select: { id: true }
      });

      if (!kine) {
        return {
          success: false,
          error: 'Kinésithérapeute non trouvé'
        };
      }

      const count = await prisma.notification.count({
        where: {
          kineId: kine.id,
          isRead: false
        }
      });

      return {
        success: true,
        count
      };

    } catch (error) {
      logger.error('Erreur comptage notifications non lues:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId, kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      // Récupérer le kiné par son UID Firebase
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid },
        select: { id: true }
      });

      if (!kine) {
        return {
          success: false,
          error: 'Kinésithérapeute non trouvé'
        };
      }

      // Vérifier que la notification appartient bien au kiné
      const notification = await prisma.notification.findFirst({
        where: {
          id: parseInt(notificationId),
          kineId: kine.id
        }
      });

      if (!notification) {
        return {
          success: false,
          error: 'Notification non trouvée'
        };
      }

      // Marquer comme lue
      const updatedNotification = await prisma.notification.update({
        where: {
          id: parseInt(notificationId)
        },
        data: {
          isRead: true
        }
      });

      return {
        success: true,
        notification: updatedNotification
      };

    } catch (error) {
      logger.error('Erreur marquage notification lue:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Marquer toutes les notifications d'un kiné comme lues
   */
  async markAllAsRead(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      // Récupérer le kiné par son UID Firebase
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid },
        select: { id: true }
      });

      if (!kine) {
        return {
          success: false,
          error: 'Kinésithérapeute non trouvé'
        };
      }

      const result = await prisma.notification.updateMany({
        where: {
          kineId: kine.id,
          isRead: false
        },
        data: {
          isRead: true
        }
      });

      return {
        success: true,
        count: result.count
      };

    } catch (error) {
      logger.error('Erreur marquage toutes notifications lues:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Supprimer les anciennes notifications (nettoyage)
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const prisma = prismaService.getInstance();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          },
          isRead: true // Seulement les notifications déjà lues
        }
      });

      logger.info(`🧹 CLEANUP: ${result.count} notifications supprimées (+ de ${daysOld} jours)`);

      return {
        success: true,
        deletedCount: result.count
      };

    } catch (error) {
      logger.error('Erreur nettoyage notifications:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Récupérer les statistiques des notifications d'un kiné
   */
  async getNotificationStats(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      // Récupérer le kiné par son UID Firebase
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid },
        select: { id: true }
      });

      if (!kine) {
        return {
          success: false,
          error: 'Kinésithérapeute non trouvé'
        };
      }

      // Statistiques par type
      const statsByType = await prisma.notification.groupBy({
        by: ['type'],
        where: {
          kineId: kine.id
        },
        _count: {
          type: true
        }
      });

      // Statistiques générales
      const [totalCount, unreadCount, todayCount] = await Promise.all([
        prisma.notification.count({
          where: { kineId: kine.id }
        }),
        prisma.notification.count({
          where: { kineId: kine.id, isRead: false }
        }),
        prisma.notification.count({
          where: {
            kineId: kine.id,
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        })
      ]);

      return {
        success: true,
        stats: {
          total: totalCount,
          unread: unreadCount,
          today: todayCount,
          byType: statsByType.reduce((acc, stat) => {
            acc[stat.type] = stat._count.type;
            return acc;
          }, {})
        }
      };

    } catch (error) {
      logger.error('Erreur statistiques notifications:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new NotificationService();