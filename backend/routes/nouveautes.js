// routes/nouveautes.js — Nouveautés côté kiné (lecture + accusé de lecture)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');
const nouveautesController = require('../controllers/nouveautesController');

// GET /api/nouveautes — liste des nouveautés visibles par le kiné (avec flag vue)
router.get('/', authenticate, nouveautesController.getNouveautes);

// GET /api/nouveautes/unread-count — nombre à signaler (point pulsant)
router.get('/unread-count', authenticate, nouveautesController.getUnreadCount);

// POST /api/nouveautes/mark-seen — marque tout comme vu (ouverture de la modale)
router.post('/mark-seen', authenticate, crudWriteLimiter, nouveautesController.markSeen);

module.exports = router;
