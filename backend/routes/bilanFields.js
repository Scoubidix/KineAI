const express = require('express');
const router = express.Router();

const bilanFieldsController = require('../controllers/bilanFieldsController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');

// Lecture publique pour kinés authentifiés (champs actifs uniquement)
router.get('/bilan-fields', authenticate, bilanFieldsController.getActiveFields);

// CRUD admin (lecture complète + écriture)
router.get('/admin/bilan-fields', authenticate, requireAdmin, bilanFieldsController.adminGetAllFields);
router.post('/admin/bilan-fields', authenticate, requireAdmin, bilanFieldsController.adminCreateField);
router.put('/admin/bilan-fields/:id', authenticate, requireAdmin, bilanFieldsController.adminUpdateField);
router.delete('/admin/bilan-fields/:id', authenticate, requireAdmin, bilanFieldsController.adminDeleteField);

module.exports = router;
