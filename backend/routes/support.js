// routes/support.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { authenticate } = require('../middleware/authenticate');
const { supportTicketLimiter, supportMessageLimiter } = require('../middleware/rateLimiter');
const { requireAdmin } = require('../middleware/authorization');

// Configuration multer pour les pieces jointes des tickets support
const supportUploadDir = path.join(__dirname, '../uploads/support');
if (!fs.existsSync(supportUploadDir)) {
  fs.mkdirSync(supportUploadDir, { recursive: true });
}

const supportStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, supportUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `support-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const supportImageUpload = multer({
  storage: supportStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 Mo max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporte. Formats acceptes: JPEG, PNG, WebP'));
    }
  }
});

// ========== ROUTES KINE ==========

// GET /api/support/tickets — liste des tickets du kine
router.get('/tickets', authenticate, supportController.getTickets);

// GET /api/support/tickets/:id — detail d'un ticket
router.get('/tickets/:id', authenticate, supportController.getTicketById);

// POST /api/support/tickets — creer un ticket (image optionnelle)
router.post('/tickets', authenticate, supportTicketLimiter, supportImageUpload.single('image'), supportController.createTicket);

// POST /api/support/tickets/:id/messages — ajouter un message (image optionnelle)
router.post('/tickets/:id/messages', authenticate, supportMessageLimiter, supportImageUpload.single('image'), supportController.addMessage);

// PUT /api/support/tickets/:id/close — cloturer un ticket
router.put('/tickets/:id/close', authenticate, supportController.closeTicket);

// ========== ROUTES ADMIN ==========

// GET /api/support/admin/tickets — tickets OPEN
router.get('/admin/tickets', authenticate, requireAdmin, supportController.getOpenTickets);

// POST /api/support/admin/tickets/:id/reply — repondre (image optionnelle)
router.post('/admin/tickets/:id/reply', authenticate, requireAdmin, supportImageUpload.single('image'), supportController.adminReply);

// PUT /api/support/admin/messages/:messageId — modifier un message admin (image optionnelle)
router.put('/admin/messages/:messageId', authenticate, requireAdmin, supportImageUpload.single('image'), supportController.adminUpdateMessage);

// DELETE /api/support/admin/messages/:messageId — supprimer un message admin
router.delete('/admin/messages/:messageId', authenticate, requireAdmin, supportController.adminDeleteMessage);

// PUT /api/support/admin/tickets/:id/resolve — resoudre
router.put('/admin/tickets/:id/resolve', authenticate, requireAdmin, supportController.resolveTicket);

module.exports = router;
