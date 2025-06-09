const express = require('express');
const router = express.Router();

const programmesController = require('../controllers/programmesController');
const { authenticate } = require('../middleware/authenticate');

// IMPORTANT: Les routes spécifiques AVANT les routes avec paramètres
// Route pour générer le lien de chat (AVANT /:patientId)
router.post('/:programmeId/generate-link', authenticate, programmesController.generateProgrammeLink);

// Routes existantes
router.get('/:patientId', authenticate, programmesController.getProgrammesByPatient);
router.post('/', authenticate, programmesController.createProgramme);
router.put('/:id', authenticate, programmesController.updateProgramme);
router.delete('/:id', authenticate, programmesController.deleteProgramme);

module.exports = router;