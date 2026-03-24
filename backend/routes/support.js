// routes/support.js
const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');

// ========== ROUTES KINE ==========

// GET /api/support/tickets — liste des tickets du kine
router.get('/tickets', authenticate, supportController.getTickets);

// GET /api/support/tickets/:id — detail d'un ticket
router.get('/tickets/:id', authenticate, supportController.getTicketById);

// POST /api/support/tickets — creer un ticket
router.post('/tickets', authenticate, supportController.createTicket);

// POST /api/support/tickets/:id/messages — ajouter un message
router.post('/tickets/:id/messages', authenticate, supportController.addMessage);

// PUT /api/support/tickets/:id/close — cloturer un ticket
router.put('/tickets/:id/close', authenticate, supportController.closeTicket);

// ========== ROUTES ADMIN ==========

// GET /api/support/admin/tickets — tickets OPEN
router.get('/admin/tickets', authenticate, requireAdmin, supportController.getOpenTickets);

// POST /api/support/admin/tickets/:id/reply — repondre
router.post('/admin/tickets/:id/reply', authenticate, requireAdmin, supportController.adminReply);

// PUT /api/support/admin/tickets/:id/resolve — resoudre
router.put('/admin/tickets/:id/resolve', authenticate, requireAdmin, supportController.resolveTicket);

module.exports = router;
