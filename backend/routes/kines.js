const express = require('express');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { authenticate } = require('../middleware/authenticate');
const { validate, createKineSchema, updateKineProfileSchema } = require('../middleware/validate');
const { avatarUploadLimiter, signupLimiter, supportTicketLimiter } = require('../middleware/rateLimiter');
const { sendNotification } = require('../services/telegramService');
const { sanitizeEmail } = require('../utils/logSanitizer');
const {
  createKine,
  getKineProfile,
  updateKineProfile,
  uploadKineAvatar,
  deleteKineAvatar,
  getAdherenceByDate,
  getPatientSessionsByDate
} = require('../controllers/kineController');

// Configuration multer pour l'upload d'avatars
const avatarUploadDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `avatar-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
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

// POST /kine - Créer un nouveau kiné (lors de l'inscription)
router.post('/', signupLimiter, validate(createKineSchema), createKine);

// GET /kine/profile - Récupérer le profil du kiné connecté (nécessite auth)
router.get('/profile', authenticate, getKineProfile);

// PUT /kine/profile - Modifier le profil du kiné connecté (nécessite auth)
router.put('/profile', authenticate, validate(updateKineProfileSchema), updateKineProfile);

// POST /kine/profile/avatar - Upload ou remplacement de l'avatar
router.post('/profile/avatar', authenticate, avatarUploadLimiter, avatarUpload.single('avatar'), uploadKineAvatar);

// DELETE /kine/profile/avatar - Supprimer l'avatar
router.delete('/profile/avatar', authenticate, avatarUploadLimiter, deleteKineAvatar);

// ==========================================
// NOUVELLES ROUTES POUR LE SUIVI D'ADHÉRENCE
// ==========================================

// GET /kine/adherence/:date - Calculer l'adhérence globale pour une date donnée
// Exemple: GET /kine/adherence/2025-07-02
router.get('/adherence/:date', authenticate, getAdherenceByDate);

// GET /kine/patients-sessions/:date - Liste détaillée des patients et leur statut de validation
// Exemple: GET /kine/patients-sessions/2025-07-02
router.get('/patients-sessions/:date', authenticate, getPatientSessionsByDate);

// Demande de vérification manuelle d'email
router.post('/request-manual-verification', authenticate, supportTicketLimiter, async (req, res) => {
  try {
    const email = req.userEmail || 'inconnu';
    logger.info(`Demande de vérification manuelle pour ${sanitizeEmail(email)}`);

    await sendNotification(
      `📧 <b>Demande de vérification manuelle mail demandée</b>\n\n🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Erreur demande vérification manuelle', { error: error.message });
    res.status(500).json({ success: false, error: 'Erreur lors de la demande' });
  }
});

module.exports = router;