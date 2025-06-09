const express = require('express');
const router = express.Router();

const programmesController = require('../controllers/programmesController');
const { authenticate } = require('../middleware/authenticate');

// ROUTES SPÉCIFIQUES EN PREMIER (avant les routes avec paramètres)
// Route pour générer le lien de chat
router.post('/:programmeId/generate-link', authenticate, programmesController.generateProgrammeLink);

// Routes CRUD standard
router.post('/', authenticate, programmesController.createProgramme);
router.put('/:id', authenticate, programmesController.updateProgramme);
router.delete('/:id', authenticate, programmesController.deleteProgramme);

// Route GET avec paramètre EN DERNIER (elle capture tout ce qui n'a pas matché avant)
router.get('/:patientId', authenticate, programmesController.getProgrammesByPatient);

module.exports = router;