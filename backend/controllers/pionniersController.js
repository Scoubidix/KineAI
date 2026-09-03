// controllers/pionniersController.js
const service = require('../services/pionniersChatService');
const { processUploadedImage, cleanupTempFile } = require('../utils/uploadedImage');
const { uploadPionnierImage } = require('../services/gcsStorageService');
const logger = require('../utils/logger');

const MAX_BODY_LENGTH = 4000;

/** Convertit un parametre de requete en entier positif, ou undefined. */
function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const pionniersController = {

  /** GET /api/pionniers/messages?before=&after=&limit= */
  async getMessages(req, res) {
    try {
      const before = toPositiveInt(req.query.before);
      const after = toPositiveInt(req.query.after);
      const limit = toPositiveInt(req.query.limit);

      if (before && after) {
        return res.status(400).json({
          success: false,
          error: 'Les paramètres before et after sont exclusifs',
          code: 'INVALID_PAGINATION'
        });
      }

      const messages = await service.listMessages({ before, after, limit });
      res.json({ success: true, messages });
    } catch (err) {
      logger.error('Erreur lecture du salon Pionniers', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur', code: 'PIONNIERS_LIST_ERROR' });
    }
  },

  /**
   * GET /api/pionniers/unread-count
   * Ouverte a tout kine authentifie : c'est cet appel qui dit au front s'il doit
   * afficher l'onglet. Un non-membre recoit 200 + hasAccess false, jamais 403.
   */
  async getUnreadCount(req, res) {
    try {
      const { kineId, hasAccess, isAdmin } = await service.resolveAccess(req.uid);

      if (!hasAccess) {
        return res.json({
          success: true, hasAccess: false, isAdmin: false, kineId: null, count: 0, firstUnreadId: null
        });
      }

      // kineId est renvoye pour que le front sache quels messages sont les siens
      // (donc supprimables) sans un second appel au profil.
      const { count, firstUnreadId } = await service.getUnreadCount(kineId);
      res.json({ success: true, hasAccess: true, isAdmin, kineId, count, firstUnreadId });
    } catch (err) {
      logger.error('Erreur compteur non-lus Pionniers', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur', code: 'PIONNIERS_UNREAD_ERROR' });
    }
  },

  /** POST /api/pionniers/messages (multipart, image optionnelle) */
  async postMessage(req, res) {
    try {
      const body = (req.body.body || '').trim();
      const replyToId = toPositiveInt(req.body.replyToId) || null;

      if (!body && !req.file) {
        return res.status(400).json({ success: false, error: 'Message ou image requis', code: 'EMPTY_MESSAGE' });
      }
      if (body.length > MAX_BODY_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Message trop long (${MAX_BODY_LENGTH} caractères max)`,
          code: 'MESSAGE_TOO_LONG'
        });
      }

      const { imagePath, error } = await processUploadedImage(req.file, uploadPionnierImage);
      if (error) {
        return res.status(400).json({ success: false, error, code: 'INVALID_IMAGE' });
      }

      const message = await service.createMessage(req.kineId, { body, replyToId, imagePath });
      res.status(201).json({ success: true, message });
    } catch (err) {
      logger.error('Erreur envoi message Pionniers', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur', code: 'PIONNIERS_CREATE_ERROR' });
    } finally {
      // Multer a deja ecrit le fichier sur disque quand une validation sort en
      // amont de processUploadedImage : sans ce filet, le temporaire s'accumule.
      cleanupTempFile(req.file);
    }
  },

  /** DELETE /api/pionniers/messages/:id */
  async deleteMessage(req, res) {
    try {
      const messageId = toPositiveInt(req.params.id);
      if (!messageId) {
        return res.status(400).json({ success: false, error: 'Identifiant invalide', code: 'INVALID_ID' });
      }

      const { status } = await service.deleteMessage({
        kineId: req.kineId,
        isAdmin: req.isAdmin,
        messageId,
      });

      if (status === 'NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'Message non trouvé', code: 'MESSAGE_NOT_FOUND' });
      }
      if (status === 'FORBIDDEN') {
        return res.status(403).json({ success: false, error: 'Suppression non autorisée', code: 'DELETE_FORBIDDEN' });
      }

      res.json({ success: true });
    } catch (err) {
      logger.error('Erreur suppression message Pionniers', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur', code: 'PIONNIERS_DELETE_ERROR' });
    }
  },

  /** POST /api/pionniers/read */
  async setRead(req, res) {
    try {
      const lastReadMessageId = await service.setLastRead(req.kineId, req.body.lastReadMessageId);
      res.json({ success: true, lastReadMessageId });
    } catch (err) {
      logger.error('Erreur curseur de lecture Pionniers', { error: err.message });
      res.status(500).json({ success: false, error: 'Erreur serveur', code: 'PIONNIERS_READ_ERROR' });
    }
  },
};

module.exports = pionniersController;
