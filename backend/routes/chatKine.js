const express = require('express');
const router = express.Router();
const chatKineController = require('../controllers/chatKineController');
const { authenticate } = require('../middleware/authenticate');
const { gptLimiter } = require('../middleware/rateLimiter');
const { requireAssistantOrPreview } = require('../middleware/authorization');

// ========== IA ADMINISTRATIVE (BILAN KINÉ) ==========
// Les 3 IAs de chat (basique/biblio/clinique) et le followup ont été remplacés
// par le chat unifié (routes/conversations.js : POST /chat + conversations).
// Seule l'IA administrative (restructuration de bilans) reste sur ce routeur,
// avec son historique séparé et son paywall par plan.

/**
 * POST /api/chat/kine/ia-administrative
 * IA administrative spécialisée (bilan kiné)
 */
router.post('/ia-administrative', authenticate, gptLimiter, requireAssistantOrPreview('ADMINISTRATIF'), chatKineController.sendIaAdministrative);

/**
 * GET /api/chat/kine/history-administrative?days=X
 * Historique IA Administrative
 */
router.get('/history-administrative', authenticate, chatKineController.getHistoryAdministrative);

/**
 * DELETE /api/chat/kine/history-administrative
 * Supprimer historique IA Administrative
 */
router.delete('/history-administrative', authenticate, chatKineController.clearHistoryAdministrative);

module.exports = router;
