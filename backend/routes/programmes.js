const express = require('express');
const router = express.Router();

const programmesController = require('../controllers/programmesController');
const { authenticate } = require('../middleware/authenticate');

router.get('/:patientId', authenticate, programmesController.getProgrammesByPatient);
router.post('/', authenticate, programmesController.createProgramme);
router.put('/:id', authenticate, programmesController.updateProgramme);
router.delete('/:id', authenticate, programmesController.deleteProgramme);

module.exports = router;
