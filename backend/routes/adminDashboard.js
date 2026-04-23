// routes/adminDashboard.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const adminStatsService = require('../services/adminStatsService');
const logger = require('../utils/logger');

/**
 * GET /admin/dashboard/stats
 * Statistiques globales pour le dashboard admin
 */
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await adminStatsService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Erreur récupération stats admin', { error: error.message });
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des statistiques', code: 'STATS_ERROR' });
  }
});

module.exports = router;
