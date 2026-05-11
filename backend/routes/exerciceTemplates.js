const express = require('express');
const router = express.Router();

const templatesController = require('../controllers/templatesController');
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');

// Routes pour les templates d'exercices
router.get('/all', authenticate, templatesController.getAllTemplates);
router.get('/public', authenticate, templatesController.getPublicTemplates);
router.get('/private', authenticate, templatesController.getPrivateTemplates);
router.get('/:id', authenticate, templatesController.getTemplateById);

router.post('/', authenticate, crudWriteLimiter, templatesController.createTemplate);
router.put('/:id', authenticate, crudWriteLimiter, templatesController.updateTemplate);
router.delete('/:id', authenticate, crudWriteLimiter, templatesController.deleteTemplate);

module.exports = router;
