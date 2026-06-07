// routes/conversations.js
// Chat unifié : endpoint /chat (SSE) + CRUD conversations + usage quota. Monté sur /api/chat/kine.
const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { authenticate } = require('../middleware/authenticate');
const { gptLimiter } = require('../middleware/rateLimiter');
const { checkTokenQuota } = require('../middleware/tokenQuota');

/**
 * POST /api/chat/kine/chat
 * Endpoint unifié (SSE) : { message, conversationId? }
 * checkTokenQuota bloque en 429 QUOTA_EXCEEDED avant l'ouverture du stream.
 */
router.post('/chat', authenticate, gptLimiter, checkTokenQuota, conversationController.sendChat);

/**
 * GET /api/chat/kine/usage — consommation tokens du jour (jauge UI)
 */
router.get('/usage', authenticate, conversationController.getUsage);

/**
 * GET /api/chat/kine/conversations — liste sidebar
 */
router.get('/conversations', authenticate, conversationController.listConversations);

/**
 * GET /api/chat/kine/conversations/:id — messages d'une conversation
 */
router.get('/conversations/:id', authenticate, conversationController.getConversation);

/**
 * PATCH /api/chat/kine/conversations/:id — renommage
 */
router.patch('/conversations/:id', authenticate, conversationController.renameConversation);

/**
 * DELETE /api/chat/kine/conversations/:id — soft delete
 */
router.delete('/conversations/:id', authenticate, conversationController.deleteConversation);

module.exports = router;
