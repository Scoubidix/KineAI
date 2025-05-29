const express = require('express');
const router = express.Router();

const patientsController = require('../controllers/patientsController');
const { authenticate } = require('../middleware/authenticate');

router.get('/:kineId', authenticate, patientsController.getPatients);
router.post('/', authenticate, patientsController.createPatient);
router.put('/:id', authenticate, patientsController.updatePatient);

module.exports = router;
