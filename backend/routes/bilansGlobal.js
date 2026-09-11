const express = require('express');
const router = express.Router();
const { z } = require('zod');
const multer = require('multer');

const bilansGlobalController = require('../controllers/bilansGlobalController');
const { authenticate } = require('../middleware/authenticate');
const { pdfGenerationLimiter, crudWriteLimiter, gptLimiter, dictationLimiter, dictationCorrectLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { requireBilanEditor } = require('../middleware/authorization');
const { SECTION_KEYS } = require('../services/bilanDocument');
const { MODES } = require('../services/dictationCorrectionService');
const { KINDS, MAX_SEGMENTS } = require('../services/bilanJobRules');

// Routes globales (non scopées à un patient)
router.get('/patients-with-bilans', authenticate, bilansGlobalController.getPatientsWithBilans);

// Dictée (spec dictée §5.1). La route de statut est déclarée avant les routes /:id.
router.get('/dictation/status', authenticate, bilansGlobalController.dictationStatus);
const dictationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const dictationAudio = (req, res, next) => dictationUpload.single('audio')(req, res, (err) => {
  if (!err) return next();
  const tooLarge = err.code === 'LIMIT_FILE_SIZE';
  return res.status(tooLarge ? 413 : 400).json({ success: false, error: tooLarge ? 'Segment audio trop volumineux (8 Mo max)' : 'Segment audio invalide', code: tooLarge ? 'AUDIO_INVALID' : 'INVALID_SEGMENT' });
});

const bilanTypeSchema = z.enum(['INITIAL', 'INTERMEDIAIRE', 'FINAL']);
// Le document est validé finement par le service (catalogue) ; ici forme grossière seulement.
const documentShape = z.object({ schemaVersion: z.number().int() }).passthrough();

const createBilanDraftSchema = z.object({
  type: bilanTypeSchema.optional(),
  patientId: z.number().int().positive().nullable().optional(),
  motif: z.string().trim().max(500).nullable().optional(),
});

const patchBilanSchema = z.object({
  rawNotes: z.string().max(50000).nullable().optional(),
  motif: z.string().trim().max(500).nullable().optional(),
  type: bilanTypeSchema.optional(),
  document: documentShape.optional(),
  expectedUpdatedAt: z.string().datetime(),
});

const attachPatientSchema = z.object({ patientId: z.number().int().positive() });

const composeSchema = z.object({
  sections: z.array(z.enum(SECTION_KEYS)).min(1).max(SECTION_KEYS.length).optional(),
});

// Ressource brouillons / bilans V1 (spec §5.1). Création réservée dès Pratique ;
// lecture, autosave, rattachement, finalisation et suppression ouverts au propriétaire.
router.post('/', authenticate, crudWriteLimiter, requireBilanEditor, validate(createBilanDraftSchema), bilansGlobalController.createBilanDraft);
router.get('/', authenticate, bilansGlobalController.listMyBilans);
router.get('/:id', authenticate, bilansGlobalController.getBilanForEditor);
router.patch('/:id', authenticate, crudWriteLimiter, validate(patchBilanSchema), bilansGlobalController.patchBilan);
router.post('/:id/attach', authenticate, crudWriteLimiter, validate(attachPatientSchema), bilansGlobalController.attachPatient);
router.post('/:id/finalize', authenticate, crudWriteLimiter, bilansGlobalController.finalizeBilan);
router.delete('/:id', authenticate, crudWriteLimiter, bilansGlobalController.deleteBilan);

// IA (spec §6) : plan Pratique+ et limiteur IA (5/min). L'extraction n'écrit rien ;
// la rédaction écrit les sections demandées en check-and-set (409 STALE_DRAFT).
router.post('/:id/extract', authenticate, gptLimiter, requireBilanEditor, bilansGlobalController.extractBilan);
router.post('/:id/compose', authenticate, gptLimiter, requireBilanEditor, validate(composeSchema), bilansGlobalController.composeBilan);
// « Rédiger avec l'IA » en un appel : extraction, acceptation automatique, rédaction (spec flux deux étapes §5)
router.post('/:id/compose-from-notes', authenticate, gptLimiter, requireBilanEditor, bilansGlobalController.composeBilanFromNotes);
// Un segment de dictée → texte, rien n'est écrit ; l'autosave du front porte le texte dans rawNotes.
router.post('/:id/dictation', authenticate, dictationLimiter, requireBilanEditor, dictationAudio, bilansGlobalController.transcribeDictation);
const correctDictationSchema = z.object({ text: z.string().max(20000), mode: z.enum(MODES) });
// Passe de correction à la fin de la prise (spec correction §3) : rien n'est écrit, texte brut renvoyé sur échec
router.post('/:id/dictation/correct', authenticate, dictationCorrectLimiter, requireBilanEditor, validate(correctDictationSchema), bilansGlobalController.correctDictation);

// Traitement de dictée côté serveur (spec traitement serveur §4.2) : le navigateur envoie, le serveur enchaîne.
const createJobSchema = z.object({ kind: z.enum(KINDS).optional() });
const finishJobSchema = z.object({ segmentsTotal: z.number().int().min(0).max(MAX_SEGMENTS) });
router.post('/:id/job', authenticate, crudWriteLimiter, requireBilanEditor, validate(createJobSchema), bilansGlobalController.createJob);
router.post('/:id/job/segments', authenticate, dictationLimiter, requireBilanEditor, dictationAudio, bilansGlobalController.uploadJobSegment);
router.post('/:id/job/finish', authenticate, crudWriteLimiter, requireBilanEditor, validate(finishJobSchema), bilansGlobalController.finishJob);
// Pas de limiteur : sondage toutes les 2 s par un kiné authentifié, lecture seule.
router.get('/:id/job', authenticate, bilansGlobalController.getJob);
router.post('/:id/job/skip-failed', authenticate, crudWriteLimiter, requireBilanEditor, bilansGlobalController.skipFailedSegments);
router.post('/:id/job/retry', authenticate, crudWriteLimiter, requireBilanEditor, bilansGlobalController.retryJob);

// Rendu HTML (tout plan : un kiné rétrogradé lit toujours ses bilans)
router.get('/:id/render', authenticate, bilansGlobalController.renderBilan);
// PDF serveur (Puppeteer) — ouvert à tout plan (un bilan réalisé appartient au kiné),
// rate-limité (coût CPU) : pdfGenerationLimiter. Le plan ne gate que la création/rédaction (plan 2).
// (crudWriteLimiter ignore les GET, insuffisant pour cette route coûteuse)
router.get('/:id/pdf', authenticate, pdfGenerationLimiter, bilansGlobalController.downloadBilanPdf);

module.exports = router;
