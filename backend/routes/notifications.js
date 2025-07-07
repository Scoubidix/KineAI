// routes/notifications.js
const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const { authenticate } = require('../middleware/authenticate');

// ===============================
// ROUTES DE NOTIFICATIONS
// ===============================

/**
 * GET /api/notifications
 * Récupérer les notifications du kiné connecté avec filtres et pagination
 * Query params:
 * - isRead: true/false (optionnel)
 * - type: DAILY_VALIDATION/PROGRAM_COMPLETED/PAIN_ALERT (optionnel)
 * - limit: nombre max de résultats (défaut: 50, max: 100)
 * - offset: décalage pour pagination (défaut: 0)
 */
router.get('/', authenticate, notificationsController.getNotifications);

/**
 * GET /api/notifications/unread-count
 * Compter les notifications non lues du kiné connecté
 */
router.get('/unread-count', authenticate, notificationsController.getUnreadCount);

/**
 * GET /api/notifications/stats
 * Statistiques des notifications du kiné connecté
 */
router.get('/stats', authenticate, notificationsController.getStats);

/**
 * GET /api/notifications/types
 * Récupérer la liste des types de notifications disponibles
 */
router.get('/types', authenticate, notificationsController.getTypes);

/**
 * PUT /api/notifications/:id/read
 * Marquer une notification spécifique comme lue
 */
router.put('/:id/read', authenticate, notificationsController.markAsRead);

/**
 * PUT /api/notifications/mark-all-read
 * Marquer toutes les notifications du kiné comme lues
 */
router.put('/mark-all-read', authenticate, notificationsController.markAllAsRead);

/**
 * POST /api/notifications/cleanup
 * Nettoyer les anciennes notifications lues
 * Body: { daysOld: number } (défaut: 30, minimum: 7)
 */
router.post('/cleanup', authenticate, notificationsController.cleanup);

module.exports = router;