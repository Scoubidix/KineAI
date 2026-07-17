const express = require('express');
const router = express.Router();
const controller = require('../controllers/visioController');
const { authenticate } = require('../middleware/authenticate');
const { authenticateVisioPatient } = require('../middleware/visioPatientAuth');
const { crudWriteLimiter } = require('../middleware/rateLimiter');

// ---- Kiné ----
router.post('/seances', authenticate, crudWriteLimiter, controller.createSeance);
router.get('/seances', authenticate, controller.listSeances);
router.get('/seances/:id', authenticate, controller.getSeance);
router.patch('/seances/:id/consent', authenticate, crudWriteLimiter, controller.setConsent);
router.patch('/seances/:id/cancel', authenticate, crudWriteLimiter, controller.cancelSeance);

// ---- Patient (token de séance) ----
router.get('/session/:token', authenticateVisioPatient, controller.getSession);
router.post('/ack-info/:token', authenticateVisioPatient, controller.ackInfo);

module.exports = router;
