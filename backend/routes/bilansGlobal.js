const express = require('express');
const router = express.Router();

const bilansGlobalController = require('../controllers/bilansGlobalController');
const { authenticate } = require('../middleware/authenticate');
const { pdfGenerationLimiter } = require('../middleware/rateLimiter');

// Routes globales (non scopées à un patient)
router.get('/patients-with-bilans', authenticate, bilansGlobalController.getPatientsWithBilans);
// Rendu HTML (tout plan : un kiné rétrogradé lit toujours ses bilans)
router.get('/:id/render', authenticate, bilansGlobalController.renderBilan);
// PDF serveur (Puppeteer) — ouvert à tout plan (un bilan réalisé appartient au kiné),
// rate-limité (coût CPU) : pdfGenerationLimiter. Le plan ne gate que la création/rédaction (plan 2).
// (crudWriteLimiter ignore les GET, insuffisant pour cette route coûteuse)
router.get('/:id/pdf', authenticate, pdfGenerationLimiter, bilansGlobalController.downloadBilanPdf);

module.exports = router;
