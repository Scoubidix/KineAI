// controllers/supportController.js
const supportService = require('../services/supportService');
const logger = require('../utils/logger');
const { sanitizeUID } = require('../utils/logSanitizer');

const supportController = {

  /**
   * POST /api/support/tickets
   * Creer un nouveau ticket
   */
  async createTicket(req, res) {
    try {
      const { subject, body } = req.body;

      if (!subject || !body) {
        return res.status(400).json({ success: false, error: 'Objet et message requis' });
      }
      if (subject.length > 255) {
        return res.status(400).json({ success: false, error: 'Objet trop long (255 caracteres max)' });
      }
      if (body.length > 5000) {
        return res.status(400).json({ success: false, error: 'Message trop long (5000 caracteres max)' });
      }

      const ticket = await supportService.createTicket(req.uid, { subject, body });
      logger.info(`Ticket support cree`, sanitizeUID(req.uid));
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      logger.error('Erreur creation ticket support', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/support/tickets/:id/messages
   * Ajouter un message a un ticket
   */
  async addMessage(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const { body } = req.body;

      if (!body) {
        return res.status(400).json({ success: false, error: 'Message requis' });
      }
      if (body.length > 5000) {
        return res.status(400).json({ success: false, error: 'Message trop long (5000 caracteres max)' });
      }

      const message = await supportService.addMessage(req.uid, ticketId, { body });
      if (!message) {
        return res.status(404).json({ success: false, error: 'Ticket non trouve ou acces refuse' });
      }

      res.status(201).json({ success: true, data: message });
    } catch (err) {
      logger.error('Erreur ajout message support', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/support/tickets
   * Recuperer les tickets du kine connecte
   */
  async getTickets(req, res) {
    try {
      const tickets = await supportService.getTickets(req.uid);
      res.json({ success: true, data: tickets });
    } catch (err) {
      logger.error('Erreur recuperation tickets', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/support/tickets/:id
   * Recuperer un ticket par ID
   */
  async getTicketById(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const ticket = await supportService.getTicketById(req.uid, ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Ticket non trouve ou acces refuse' });
      }
      res.json({ success: true, data: ticket });
    } catch (err) {
      logger.error('Erreur recuperation ticket', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * PUT /api/support/tickets/:id/close
   * Cloturer un ticket (cote kine)
   */
  async closeTicket(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const ticket = await supportService.closeTicket(req.uid, ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Ticket non trouve ou acces refuse' });
      }
      res.json({ success: true, data: ticket });
    } catch (err) {
      logger.error('Erreur cloture ticket', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  // ========== ADMIN ==========

  /**
   * GET /api/support/admin/tickets
   * Recuperer tous les tickets OPEN
   */
  async getOpenTickets(req, res) {
    try {
      const tickets = await supportService.getOpenTickets();
      res.json({ success: true, data: tickets });
    } catch (err) {
      logger.error('Erreur recuperation tickets admin', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/support/admin/tickets/:id/reply
   * Repondre a un ticket (admin)
   */
  async adminReply(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const { body } = req.body;

      if (!body) {
        return res.status(400).json({ success: false, error: 'Message requis' });
      }
      if (body.length > 5000) {
        return res.status(400).json({ success: false, error: 'Message trop long (5000 caracteres max)' });
      }

      const message = await supportService.adminReply(ticketId, { body });
      if (!message) {
        return res.status(404).json({ success: false, error: 'Ticket non trouve' });
      }

      res.status(201).json({ success: true, data: message });
    } catch (err) {
      logger.error('Erreur reponse admin support', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * PUT /api/support/admin/tickets/:id/resolve
   * Marquer un ticket comme resolu
   */
  async resolveTicket(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const ticket = await supportService.resolveTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Ticket non trouve' });
      }
      res.json({ success: true, data: ticket });
    } catch (err) {
      logger.error('Erreur resolution ticket', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
};

module.exports = supportController;
