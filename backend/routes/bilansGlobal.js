const express = require('express');
const router = express.Router();

const bilansGlobalController = require('../controllers/bilansGlobalController');
const { authenticate } = require('../middleware/authenticate');

// Routes globales (non scopées à un patient)
router.get('/patients-with-bilans', authenticate, bilansGlobalController.getPatientsWithBilans);

module.exports = router;
