const express = require('express');
const router = express.Router();
const { z } = require('zod');

const bilansGlobalController = require('../controllers/bilansGlobalController');
const { authenticate } = require('../middleware/authenticate');
const { pdfGenerationLimiter, crudWriteLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { requireBilanEditor } = require('../middleware/authorization');

// Routes globales (non scopées à un patient)
router.get('/patients-with-bilans', authenticate, bilansGlobalController.getPatientsWithBilans);

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

// Ressource brouillons / bilans V1 (spec §5.1). Création réservée dès Pratique ;
// lecture, autosave, rattachement, finalisation et suppression ouverts au propriétaire.
router.post('/', authenticate, crudWriteLimiter, requireBilanEditor, validate(createBilanDraftSchema), bilansGlobalController.createBilanDraft);
router.get('/', authenticate, bilansGlobalController.listMyBilans);
router.get('/:id', authenticate, bilansGlobalController.getBilanForEditor);
router.patch('/:id', authenticate, crudWriteLimiter, validate(patchBilanSchema), bilansGlobalController.patchBilan);
router.post('/:id/attach', authenticate, crudWriteLimiter, validate(attachPatientSchema), bilansGlobalController.attachPatient);
router.post('/:id/finalize', authenticate, crudWriteLimiter, bilansGlobalController.finalizeBilan);
router.delete('/:id', authenticate, crudWriteLimiter, bilansGlobalController.deleteBilan);

// Rendu HTML (tout plan : un kiné rétrogradé lit toujours ses bilans)
router.get('/:id/render', authenticate, bilansGlobalController.renderBilan);
// PDF serveur (Puppeteer) — ouvert à tout plan (un bilan réalisé appartient au kiné),
// rate-limité (coût CPU) : pdfGenerationLimiter. Le plan ne gate que la création/rédaction (plan 2).
// (crudWriteLimiter ignore les GET, insuffisant pour cette route coûteuse)
router.get('/:id/pdf', authenticate, pdfGenerationLimiter, bilansGlobalController.downloadBilanPdf);

module.exports = router;
