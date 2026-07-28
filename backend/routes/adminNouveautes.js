// routes/adminNouveautes.js — Gestion des nouveautés (admin uniquement)
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const nouveautesController = require('../controllers/nouveautesController');

// --- Upload multer (disque temporaire, comme les avatars) ---
const uploadDir = path.join(__dirname, '../uploads/nouveautes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `nouveaute-${suffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max (GIFs)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté. Acceptés : GIF, PNG, JPEG, WebP'));
  },
});

// Toutes les routes admin sont protégées par requireAdmin
router.get('/', authenticate, requireAdmin, nouveautesController.adminList);
router.post('/', authenticate, requireAdmin, nouveautesController.adminCreate);
router.post('/upload', authenticate, requireAdmin, upload.single('image'), nouveautesController.adminUploadImage);
router.put('/:id', authenticate, requireAdmin, nouveautesController.adminUpdate);
router.delete('/:id', authenticate, requireAdmin, nouveautesController.adminDelete);

module.exports = router;
