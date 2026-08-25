const express = require('express');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const exercicesController = require('../controllers/exercicesController');
const { authenticate } = require('../middleware/authenticate');
const { videoUploadLimiter, crudWriteLimiter } = require('../middleware/rateLimiter');
const { validate, createExerciceSchema, updateExerciceSchema } = require('../middleware/validate');
const { requireAdmin } = require('../middleware/authorization');

// Configuration de multer pour l'upload de vidéos
const uploadDir = path.join(__dirname, '../uploads/videos');

// Créer le dossier uploads/videos s'il n'existe pas
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `video-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const MAX_UPLOAD_MB = 50; // doit rester aligné sur VIDEO_CONFIG.maxSizeMB

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté. Formats acceptés: MP4, MOV, AVI'));
    }
  }
});

/**
 * Multer refuse au-delà de la limite AVANT le contrôleur. Sans ce relais,
 * l'erreur remonte au handler global en 500 et le kiné ne sait pas quoi faire.
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: `Vidéo trop lourde (maximum ${MAX_UPLOAD_MB} Mo). Filme en 1080p plutôt qu'en 4K, ou raccourcis la séquence.`,
    });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// Routes pour les exercices (similaire aux patients)
router.get('/public', authenticate, exercicesController.getPublicExercices);
router.get('/private', authenticate, exercicesController.getPrivateExercices);

// NOUVELLE ROUTE : Récupérer tous les tags disponibles
router.get('/tags', authenticate, exercicesController.getAllTags);

// ===== ROUTES ADMIN (gestion de la bibliothèque publique) =====
router.get('/admin/legacy-gif-count', authenticate, requireAdmin, exercicesController.getLegacyGifCount);
router.get('/admin/public', authenticate, requireAdmin, exercicesController.getAdminPublicExercices);
router.patch('/admin/:id/publish', authenticate, requireAdmin, exercicesController.publishExercice);
router.patch('/admin/:id/unpublish', authenticate, requireAdmin, exercicesController.unpublishExercice);
router.put('/admin/:id', authenticate, requireAdmin, validate(updateExerciceSchema), exercicesController.adminUpdateExercice);
router.delete('/admin/:id', authenticate, requireAdmin, exercicesController.adminDeleteExercice);

router.post('/', authenticate, crudWriteLimiter, validate(createExerciceSchema), exercicesController.createExercice);
router.put('/:id', authenticate, crudWriteLimiter, validate(updateExerciceSchema), exercicesController.updateExercice);
router.delete('/:id', authenticate, crudWriteLimiter, exercicesController.deleteExercice);

// Route pour upload vidéo : transcodage MP4 720p + poster JPEG
router.post('/upload-video', authenticate, videoUploadLimiter, upload.single('video'), handleUploadError, exercicesController.uploadExerciceMedia);

module.exports = router;