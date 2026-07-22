const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/visioController');
const { authenticate } = require('../middleware/authenticate');
const { authenticateVisioPatient } = require('../middleware/visioPatientAuth');
const { crudWriteLimiter } = require('../middleware/rateLimiter');

// Upload en mémoire (pass-through vers Brevo, jamais stocké sur disque/GCS)
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---- Kiné ----
router.post('/seances', authenticate, crudWriteLimiter, controller.createSeance);
router.get('/seances', authenticate, controller.listSeances);
router.get('/seances/:id', authenticate, controller.getSeance);
router.patch('/seances/:id/consent', authenticate, crudWriteLimiter, controller.setConsent);
router.patch('/seances/:id/cancel', authenticate, crudWriteLimiter, controller.cancelSeance);
router.patch('/seances/:id/reschedule', authenticate, crudWriteLimiter, controller.rescheduleSeance);
router.post('/seances/:id/resend-link', authenticate, crudWriteLimiter, controller.resendLink);
router.patch('/seances/:id/compte-rendu', authenticate, crudWriteLimiter, controller.saveCompteRendu);
router.get('/seances/:id/compte-rendu/pdf', authenticate, controller.compteRenduPdf);
router.post('/seances/:id/send-document', authenticate, crudWriteLimiter, uploadDoc.single('document'), controller.sendDocument);

// ---- Patient (token de séance) ----
router.get('/session/:token', authenticateVisioPatient, controller.getSession);
router.post('/ack-info/:token', authenticateVisioPatient, controller.ackInfo);

module.exports = router;
