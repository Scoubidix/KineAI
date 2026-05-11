const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();

const patientsController = require('../controllers/patientsController');
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');
const { validate, createPatientSchema, updatePatientSchema } = require('../middleware/validate');

router.get('/kine/:kineId', authenticate, patientsController.getPatients);
router.get('/:id', authenticate, patientsController.getPatientById);
router.post('/', authenticate, crudWriteLimiter, validate(createPatientSchema), patientsController.createPatient);
router.put('/:id', authenticate, crudWriteLimiter, validate(updatePatientSchema), patientsController.updatePatient);
router.delete('/:id', authenticate, crudWriteLimiter, patientsController.deletePatient);

module.exports = router;
