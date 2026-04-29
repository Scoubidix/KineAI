// routes/legalAcceptances.js
const express = require('express');
const router = express.Router();
const legalAcceptanceController = require('../controllers/legalAcceptanceController');
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');

// GET /api/legal-acceptances/status — statut d'acceptation du kine (pas de rate limit)
router.get('/status', authenticate, legalAcceptanceController.getStatus);

// GET /api/legal-acceptances/history — historique complet (audit RGPD, pas de rate limit)
router.get('/history', authenticate, legalAcceptanceController.getHistory);

// POST /api/legal-acceptances — enregistrer des acceptations (🚦 30 ecritures/min)
router.post('/', authenticate, crudWriteLimiter, legalAcceptanceController.recordAcceptances);

module.exports = router;
