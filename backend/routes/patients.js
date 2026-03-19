const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();

const patientsController = require('../controllers/patientsController');
const { authenticate } = require('../middleware/authenticate');
const { validate, createPatientSchema, updatePatientSchema } = require('../middleware/validate');

router.get('/kine/:kineId', authenticate, patientsController.getPatients);
router.get('/:id', authenticate, patientsController.getPatientById);
router.post('/', authenticate, validate(createPatientSchema), patientsController.createPatient);
router.put('/:id', authenticate, validate(updatePatientSchema), patientsController.updatePatient);
router.delete('/:id', authenticate, patientsController.deletePatient); 

module.exports = router;
