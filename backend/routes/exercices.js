const express = require('express');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const exercicesController = require('../controllers/exercicesController');
const { authenticate } = require('../middleware/authenticate');
const { videoUploadLimiter } = require('../middleware/rateLimiter');

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

const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB max
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

// Routes pour les exercices (similaire aux patients)
router.get('/public', authenticate, exercicesController.getPublicExercices);
router.get('/private', authenticate, exercicesController.getPrivateExercices);

// NOUVELLE ROUTE : Récupérer tous les tags disponibles
router.get('/tags', authenticate, exercicesController.getAllTags);

router.post('/', authenticate, exercicesController.createExercice);
router.put('/:id', authenticate, exercicesController.updateExercice);
router.delete('/:id', authenticate, exercicesController.deleteExercice);

// Route pour upload vidéo et conversion en GIF
router.post('/upload-video', authenticate, videoUploadLimiter, upload.single('video'), exercicesController.uploadVideoAndConvert);

module.exports = router;