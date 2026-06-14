// controllers/supportController.js
const fs = require('fs');
const supportService = require('../services/supportService');
const { validateImageBuffer, uploadSupportImage } = require('../services/gcsStorageService');
const logger = require('../utils/logger');
const { sanitizeUID } = require('../utils/logSanitizer');

/**
 * Traite l'image uploadee par multer (req.file) : validation magic bytes + upload GCS.
 * Nettoie systematiquement le fichier temporaire.
 * @returns {Promise<{ imagePath?: string|null, error?: string }>}
 */
async function handleImageUpload(req) {
  if (!req.file) return { imagePath: null };
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const { valid, detectedType } = validateImageBuffer(fileBuffer);
    if (!valid) {
      return { error: 'Le fichier n\'est pas une image valide (JPEG, PNG ou WebP).' };
    }
    const imagePath = await uploadSupportImage(fileBuffer, req.file.originalname, detectedType);
    return { imagePath };
  } finally {
    try { fs.unlinkSync(req.file.path); } catch (e) { logger.warn('Nettoyage fichier tmp support echoue:', e.message); }
  }
}

const supportController = {

  /**
   * POST /api/support/tickets
   * Creer un nouveau ticket (multipart, image optionnelle)
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

      const { imagePath, error } = await handleImageUpload(req);
      if (error) {
        return res.status(400).json({ success: false, error });
      }

      const ticket = await supportService.createTicket(req.uid, { subject, body, imagePath });
      logger.info(`Ticket support cree`, sanitizeUID(req.uid));
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      logger.error('Erreur creation ticket support', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/support/tickets/:id/messages
   * Ajouter un message a un ticket (multipart, image optionnelle)
   */
  async addMessage(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const { body } = req.body;

      if (!body && !req.file) {
        return res.status(400).json({ success: false, error: 'Message ou image requis' });
      }
      if (body && body.length > 5000) {
        return res.status(400).json({ success: false, error: 'Message trop long (5000 caracteres max)' });
      }

      const { imagePath, error } = await handleImageUpload(req);
      if (error) {
        return res.status(400).json({ success: false, error });
      }

      const message = await supportService.addMessage(req.uid, ticketId, { body: body || '', imagePath });
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
   * Repondre a un ticket (admin, multipart, image optionnelle)
   */
  async adminReply(req, res) {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ success: false, error: 'ID de ticket invalide' });
      }
      const { body } = req.body;

      if (!body && !req.file) {
        return res.status(400).json({ success: false, error: 'Message ou image requis' });
      }
      if (body && body.length > 5000) {
        return res.status(400).json({ success: false, error: 'Message trop long (5000 caracteres max)' });
      }

      const { imagePath, error } = await handleImageUpload(req);
      if (error) {
        return res.status(400).json({ success: false, error });
      }

      const message = await supportService.adminReply(ticketId, { body: body || '', imagePath });
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
   * PUT /api/support/admin/messages/:messageId
   * Modifier un message envoye par l'admin (texte + image)
   */
  async adminUpdateMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      if (isNaN(messageId)) {
        return res.status(400).json({ success: false, error: 'ID de message invalide' });
      }
      const { body } = req.body;
      const removeImage = req.body.removeImage === 'true' || req.body.removeImage === true;

      if (!body) {
        return res.status(400).json({ success: false, error: 'Message requis' });
      }
      if (body.length > 5000) {
        return res.status(400).json({ success: false, error: 'Message trop long (5000 caracteres max)' });
      }

      const { imagePath: newImagePath, error } = await handleImageUpload(req);
      if (error) {
        return res.status(400).json({ success: false, error });
      }

      const result = await supportService.adminUpdateMessage(messageId, { body, newImagePath, removeImage });
      if (!result) {
        return res.status(404).json({ success: false, error: 'Message non trouve' });
      }
      if (result.forbidden) {
        return res.status(403).json({ success: false, error: 'Seuls les messages de l\'admin peuvent etre modifies' });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Erreur modification message support', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  },

  /**
   * DELETE /api/support/admin/messages/:messageId
   * Supprimer un message envoye par l'admin
   */
  async adminDeleteMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      if (isNaN(messageId)) {
        return res.status(400).json({ success: false, error: 'ID de message invalide' });
      }

      const result = await supportService.adminDeleteMessage(messageId);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Message non trouve' });
      }
      if (result.forbidden) {
        return res.status(403).json({ success: false, error: 'Seuls les messages de l\'admin peuvent etre supprimes' });
      }

      res.json({ success: true });
    } catch (err) {
      logger.error('Erreur suppression message support', { error: err.message });
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
