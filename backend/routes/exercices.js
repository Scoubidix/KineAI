const express = require('express');
const router = express.Router();

const exercicesController = require('../controllers/exercicesController');
const { authenticate } = require('../middleware/authenticate');

// Routes pour les exercices (similaire aux patients)
router.get('/public', authenticate, exercicesController.getPublicExercices);
router.get('/private', authenticate, exercicesController.getPrivateExercices);
router.post('/', authenticate, exercicesController.createExercice);
router.put('/:id', authenticate, exercicesController.updateExercice);
router.delete('/:id', authenticate, exercicesController.deleteExercice);

module.exports = router;
