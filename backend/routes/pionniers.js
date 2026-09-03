// routes/pionniers.js — salon communautaire « Groupe Pionniers »
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const pionniersController = require('../controllers/pionniersController');
const { authenticate } = require('../middleware/authenticate');
const { requirePionnier } = require('../middleware/authorization');
const { pionnierMessageLimiter } = require('../middleware/rateLimiter');
const { validate, pionnierReadSchema } = require('../middleware/validate');
const { cleanupTempFile } = require('../utils/uploadedImage');
const logger = require('../utils/logger');

// Stockage temporaire sur disque : le controller lit le buffer, valide les magic
// bytes, televerse sur GCS puis supprime le fichier local.
const pionniersUploadDir = path.join(__dirname, '../uploads/pionniers');
if (!fs.existsSync(pionniersUploadDir)) {
  fs.mkdirSync(pionniersUploadDir, { recursive: true });
}

const pionnierStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pionniersUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `pionnier-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const pionnierImageUpload = multer({
  storage: pionnierStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Format non supporte. Formats acceptes: JPEG, PNG, WebP'));
  }
});

// Compteur de non-lus : accessible a tout kine authentifie. C'est la reponse
// (hasAccess) qui indique au front s'il doit afficher l'onglet, d'ou l'absence
// volontaire de requirePionnier ici.
router.get('/unread-count', authenticate, pionniersController.getUnreadCount);

// Salon : reserve aux membres
router.get('/messages', authenticate, requirePionnier, pionniersController.getMessages);
router.post(
  '/messages',
  authenticate,
  requirePionnier,
  pionnierMessageLimiter,
  pionnierImageUpload.single('image'),
  pionniersController.postMessage
);
router.delete('/messages/:id', authenticate, requirePionnier, pionniersController.deleteMessage);
router.post('/read', authenticate, requirePionnier, validate(pionnierReadSchema), pionniersController.setRead);

// Erreurs multer : sans ce middleware, un fichier trop lourd ou d'un format refuse
// remonte au handler Express par defaut et renvoie du HTML 500 au lieu du format maison.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  cleanupTempFile(req.file);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false, error: 'Image trop lourde (5 Mo maximum)', code: 'FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({ success: false, error: 'Fichier invalide', code: 'INVALID_UPLOAD' });
  }

  logger.warn(`Upload Pionniers refuse: ${err.message}`);
  return res.status(400).json({
    success: false,
    error: 'Format non supporté. Formats acceptés : JPEG, PNG, WebP',
    code: 'INVALID_IMAGE'
  });
});

module.exports = router;
