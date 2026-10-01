// routes/news.js — News de la semaine côté kiné (lecture paginée + accusé de lecture)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');
const nouveautesController = require('../controllers/nouveautesController');

// GET /api/news?limit=10&before=<ISO>&beforeId=<id> — news visibles, plus récentes d'abord
router.get('/', authenticate, nouveautesController.getNews);

// POST /api/news/mark-seen — marque les news visibles comme vues (ouverture de la page)
router.post('/mark-seen', authenticate, crudWriteLimiter, nouveautesController.markNewsSeen);

module.exports = router;
