const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/visioController');
const { authenticate } = require('../middleware/authenticate');
const { authenticateVisioPatient } = require('../middleware/visioPatientAuth');
const { crudWriteLimiter, visioPatientLimiter, visioSendLimiter } = require('../middleware/rateLimiter');
const { requireFeature } = require('../middleware/authorization');

// Upload en mémoire (pass-through vers Brevo, jamais stocké sur disque/GCS)
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Wrapper qui intercepte les erreurs Multer (levées AVANT le contrôleur) et renvoie un
// 400 explicite plutôt qu'un 500 générique. Notamment LIMIT_FILE_SIZE (> 10 Mo).
function uploadDocument(req, res, next) {
  uploadDoc.single('document')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Fichier trop volumineux (10 Mo maximum)', code: 'FILE_TOO_LARGE' });
      }
      return res.status(400).json({ success: false, error: 'Fichier invalide', code: 'INVALID_UPLOAD' });
    }
    if (err) return next(err);
    next();
  });
}

// ---- Kiné ----
// visioSendLimiter (20/h/kiné) sur les 3 routes qui envoient un mail/WhatsApp au patient.
router.post('/seances', authenticate, crudWriteLimiter, visioSendLimiter, requireFeature('VIDEO_TRANSMISSION'), controller.createSeance);
router.get('/seances', authenticate, controller.listSeances);
router.post('/seances/archive', authenticate, crudWriteLimiter, controller.archiveSeances);
router.get('/seances/:id', authenticate, controller.getSeance);
router.patch('/seances/:id/unarchive', authenticate, crudWriteLimiter, controller.unarchiveSeance);
router.patch('/seances/:id/consent', authenticate, crudWriteLimiter, controller.setConsent);
router.patch('/seances/:id/cancel', authenticate, crudWriteLimiter, controller.cancelSeance);
router.patch('/seances/:id/reschedule', authenticate, crudWriteLimiter, controller.rescheduleSeance);
router.post('/seances/:id/resend-link', authenticate, crudWriteLimiter, visioSendLimiter, controller.resendLink);
router.patch('/seances/:id/compte-rendu', authenticate, crudWriteLimiter, controller.saveCompteRendu);
router.get('/seances/:id/compte-rendu/pdf', authenticate, controller.compteRenduPdf);
router.post('/seances/:id/send-document', authenticate, crudWriteLimiter, visioSendLimiter, uploadDocument, controller.sendDocument);

// ---- Patient (token de séance) ----
// visioPatientLimiter AVANT l'auth : on rejette le flood avant de toucher la DB.
router.get('/session/:token', visioPatientLimiter, authenticateVisioPatient, controller.getSession);
router.post('/ack-info/:token', visioPatientLimiter, authenticateVisioPatient, controller.ackInfo);

module.exports = router;
// Exposé pour les tests unitaires (le montage reste `app.use(router)`).
module.exports.uploadDocument = uploadDocument;
