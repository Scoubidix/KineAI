// routes/adminDictationTerms.js — vocabulaire signalé par les kinés (admin uniquement)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const { validate, dictationTermStatutSchema, dictationTermEditSchema } = require('../middleware/validate');
const dictationTermController = require('../controllers/dictationTermController');

router.get('/', authenticate, requireAdmin, dictationTermController.adminList);
router.patch('/:id/statut', authenticate, requireAdmin, validate(dictationTermStatutSchema), dictationTermController.adminSetStatut);
router.patch('/:id', authenticate, requireAdmin, validate(dictationTermEditSchema), dictationTermController.adminEdit);

module.exports = router;
