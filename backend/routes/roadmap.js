// routes/roadmap.js — Roadmap côté kiné (lecture + envoi d'idée)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { roadmapIdeeLimiter } = require('../middleware/rateLimiter');
const { validate, roadmapIdeeSchema } = require('../middleware/validate');
const roadmapController = require('../controllers/roadmapController');

// GET /api/roadmap — cards actives groupées (objectif n°1, court terme, moyen/long terme, livrées)
router.get('/', authenticate, roadmapController.getRoadmap);

// POST /api/roadmap/idees — proposer une idée (privée, visible dans l'admin)
router.post('/idees', authenticate, roadmapIdeeLimiter, validate(roadmapIdeeSchema), roadmapController.createIdee);

module.exports = router;
