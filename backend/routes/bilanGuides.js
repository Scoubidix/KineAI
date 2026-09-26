// routes/bilanGuides.js — Fiches pratiques des tests du bilan (monté sur /api, comme bilanFields)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const { validate, bilanGuideSchema } = require('../middleware/validate');
const bilanGuidesController = require('../controllers/bilanGuidesController');

// Kiné : fiche d'un test (le bouton ⓘ n'apparaît que si GET /api/bilan-fields renvoie hasGuide)
router.get('/bilan-guides/:key', authenticate, bilanGuidesController.getGuide);

// Admin : tests actifs + leur fiche, édition d'une fiche
router.get('/admin/bilan-guides', authenticate, requireAdmin, bilanGuidesController.adminList);
router.put('/admin/bilan-guides/:key', authenticate, requireAdmin, validate(bilanGuideSchema), bilanGuidesController.adminUpsert);

module.exports = router;
