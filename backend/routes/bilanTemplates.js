const express = require('express');
const router = express.Router();

const bilanTemplatesController = require('../controllers/bilanTemplatesController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');

// Lecture pour kinés authentifiés (publics + privés du kiné)
router.get('/bilan-templates', authenticate, bilanTemplatesController.listAccessible);

// CRUD privé du kiné
router.post('/bilan-templates', authenticate, bilanTemplatesController.create);
router.put('/bilan-templates/:id', authenticate, bilanTemplatesController.update);
router.delete('/bilan-templates/:id', authenticate, bilanTemplatesController.softDelete);

// CRUD admin (publics uniquement)
router.get('/admin/bilan-templates', authenticate, requireAdmin, bilanTemplatesController.adminList);
router.post('/admin/bilan-templates', authenticate, requireAdmin, bilanTemplatesController.adminCreate);
router.put('/admin/bilan-templates/:id', authenticate, requireAdmin, bilanTemplatesController.adminUpdate);
router.delete('/admin/bilan-templates/:id', authenticate, requireAdmin, bilanTemplatesController.adminDelete);

module.exports = router;
