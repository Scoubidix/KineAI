const express = require('express');
const router = express.Router();

const { getPatients, createPatient } = require('../controllers/patientsController');
const { authenticate } = require('../middleware/authenticate');

router.get('/:kineId', authenticate, getPatients);
router.post('/', authenticate, createPatient);

module.exports = router;
