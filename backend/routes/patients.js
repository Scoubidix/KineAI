const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();

const patientsController = require('../controllers/patientsController');
const patientNotesController = require('../controllers/patientNotesController');
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');
const { validate, createPatientSchema, updatePatientSchema, updatePatientContactSchema, patientNoteSchema } = require('../middleware/validate');

router.get('/kine/:kineId', authenticate, patientsController.getPatients);
router.get('/:id', authenticate, patientsController.getPatientById);
router.post('/', authenticate, crudWriteLimiter, validate(createPatientSchema), patientsController.createPatient);
router.put('/:id', authenticate, crudWriteLimiter, validate(updatePatientSchema), patientsController.updatePatient);
router.patch('/:id/contact', authenticate, crudWriteLimiter, validate(updatePatientContactSchema), patientsController.updatePatientContact);
router.delete('/:id', authenticate, crudWriteLimiter, patientsController.deletePatient);

// Notes rapides du dossier patient (tous les plans)
router.get('/:id/notes', authenticate, patientNotesController.listNotes);
router.post('/:id/notes', authenticate, crudWriteLimiter, validate(patientNoteSchema), patientNotesController.createNote);
router.put('/:id/notes/:noteId', authenticate, crudWriteLimiter, validate(patientNoteSchema), patientNotesController.updateNote);
router.delete('/:id/notes/:noteId', authenticate, crudWriteLimiter, patientNotesController.deleteNote);

module.exports = router;
