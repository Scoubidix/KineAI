// controllers/notificationsController.js
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const notificationsController = {

  /**
   * GET /api/notifications
   * Récupérer les notifications du kiné connecté
   */
  async getNotifications(req, res) {
    try {
      const kineUid = req.uid; // UID Firebase du kiné connecté
      
      if (!kineUid) {
        return res.status(401).json({
          success: false,
          error: 'Authentification invalide - UID manquant'
        });
      }

      // Paramètres de requête
      const {
        isRead = null,
        type = null,
        limit = 50,
        offset = 0
      } = req.query;

      // Convertir les paramètres
      const options = {
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : null,
        type: type || null,
        limit: Math.min(parseInt(limit) || 50, 100), // Maximum 100
        offset: parseInt(offset) || 0
      };

      const result = await notificationService.getNotificationsByKine(kineUid, options);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        notifications: result.notifications,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur getNotifications:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la récupération des notifications',
        details: error.message
      });
    }
  },

  /**
   * GET /api/notifications/unread-count
   * Compter les notifications non lues
   */
  async getUnreadCount(req, res) {
    try {
      const kineUid = req.uid;
      
      if (!kineUid) {
        return res.status(401).json({
          success: false,
          error: 'Authentification invalide - UID manquant'
        });
      }

      const result = await notificationService.getUnreadCount(kineUid);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        count: result.count,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur getUnreadCount:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors du comptage des notifications',
        details: error.message
      });
    }
  },

  /**
   * PUT /api/notifications/:id/read
   * Marquer une notification comme lue
   */
  async markAsRead(req, res) {
    try {
      const kineUid = req.uid;
      const notificationId = req.params.id;
      
      if (!kineUid) {
        return res.status(401).json({
          success: false,
          error: 'Authentification invalide - UID manquant'
        });
      }

      if (!notificationId || isNaN(parseInt(notificationId))) {
        return res.status(400).json({
          success: false,
          error: 'ID de notification invalide'
        });
      }

      const result = await notificationService.markAsRead(notificationId, kineUid);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: 'Notification marquée comme lue',
        notification: {
          id: result.notification.id,
          isRead: result.notification.isRead
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur markAsRead:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors du marquage de la notification',
        details: error.message
      });
    }
  },

  /**
   * PUT /api/notifications/mark-all-read
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(req, res) {
    try {
      const kineUid = req.uid;
      
      if (!kineUid) {
        return res.status(401).json({
          success: false,
          error: 'Authentification invalide - UID manquant'
        });
      }

      const result = await notificationService.markAllAsRead(kineUid);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: `${result.count} notifications marquées comme lues`,
        count: result.count,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur markAllAsRead:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors du marquage des notifications',
        details: error.message
      });
    }
  },

  /**
   * GET /api/notifications/stats
   * Statistiques des notifications
   */
  async getStats(req, res) {
    try {
      const kineUid = req.uid;
      
      if (!kineUid) {
        return res.status(401).json({
          success: false,
          error: 'Authentification invalide - UID manquant'
        });
      }

      const result = await notificationService.getNotificationStats(kineUid);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        stats: result.stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur getStats:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la récupération des statistiques',
        details: error.message
      });
    }
  },

  /**
   * POST /api/notifications/cleanup
   * Nettoyer les anciennes notifications (admin)
   */
  async cleanup(req, res) {
    try {
      const kineUid = req.uid;
      
      if (!kineUid) {
        return res.status(401).json({
          success: false,
          error: 'Authentification invalide - UID manquant'
        });
      }

      const { daysOld = 30 } = req.body;

      if (isNaN(parseInt(daysOld)) || parseInt(daysOld) < 7) {
        return res.status(400).json({
          success: false,
          error: 'Nombre de jours invalide (minimum 7 jours)'
        });
      }

      const result = await notificationService.cleanupOldNotifications(parseInt(daysOld));

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: `${result.deletedCount} anciennes notifications supprimées`,
        deletedCount: result.deletedCount,
        daysOld: parseInt(daysOld),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur cleanup:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors du nettoyage',
        details: error.message
      });
    }
  },

  /**
   * GET /api/notifications/types
   * Récupérer les types de notifications disponibles
   */
  async getTypes(req, res) {
    try {
      const types = [
        {
          value: 'DAILY_VALIDATION',
          label: 'Validation journée',
          description: 'Patient valide une journée de programme',
          icon: 'calendar-check'
        },
        {
          value: 'PROGRAM_COMPLETED',
          label: 'Programme terminé',
          description: 'Un programme patient est terminé',
          icon: 'trophy'
        },
        {
          value: 'PAIN_ALERT',
          label: 'Alerte douleur',
          description: 'Niveau de douleur élevé signalé',
          icon: 'alert-circle'
        }
      ];

      res.json({
        success: true,
        types,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur contrôleur getTypes:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la récupération des types',
        details: error.message
      });
    }
  }
};

module.exports = notificationsController;