// routes/conversations.js
// Chat unifié : endpoint /chat (SSE) + CRUD conversations. Monté sur /api/chat/kine.
// NOTE B2 : le middleware checkTokenQuota s'insérera sur POST /chat (après gptLimiter).
const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { authenticate } = require('../middleware/authenticate');
const { gptLimiter } = require('../middleware/rateLimiter');

/**
 * POST /api/chat/kine/chat
 * Endpoint unifié (SSE) : { message, conversationId? }
 */
router.post('/chat', authenticate, gptLimiter, conversationController.sendChat);

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
