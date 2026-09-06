const express = require('express');
const router = express.Router();

const bilansGlobalController = require('../controllers/bilansGlobalController');
const { authenticate } = require('../middleware/authenticate');
const { requireBilanEditor } = require('../middleware/authorization');
const { pdfGenerationLimiter } = require('../middleware/rateLimiter');

// Routes globales (non scopées à un patient)
router.get('/patients-with-bilans', authenticate, bilansGlobalController.getPatientsWithBilans);
// Rendu HTML (tout plan : un kiné rétrogradé lit toujours ses bilans)
router.get('/:id/render', authenticate, bilansGlobalController.renderBilan);
// PDF serveur (Puppeteer) — réservé dès Pratique, rate-limité (coût CPU) : pdfGenerationLimiter
// (crudWriteLimiter ignore les GET, insuffisant pour cette route coûteuse)
router.get('/:id/pdf', authenticate, pdfGenerationLimiter, requireBilanEditor, bilansGlobalController.downloadBilanPdf);

module.exports = router;
