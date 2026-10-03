// routes/media.js — Médias servis par redirection (publique : <img>/<video> n'envoient pas de jeton)
const express = require('express');
const router = express.Router();
const { mediaLinkLimiter } = require('../middleware/rateLimiter');
const mediaController = require('../controllers/mediaController');

// GET /api/media/demo/:programmeId/:exerciceModeleId.(mp4|gif)?exp=…&sig=… → 302 vers le stockage
router.get('/demo/:programmeId/:file', mediaLinkLimiter, mediaController.redirectDemo);

module.exports = router;
