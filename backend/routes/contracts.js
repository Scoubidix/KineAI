const express = require('express');
const router = express.Router();
const { z } = require('zod');
const contractsController = require('../controllers/contractsController');
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');

// Schémas Zod
const contractTypeSchema = z.enum(['REMPLACEMENT_LIBERAL', 'ASSISTANAT_LIBERAL']);
const roleInitiateurSchema = z.enum(['TITULAIRE', 'REMPLACANT_OU_ASSISTANT']);

const createContractSchema = z.object({
  type: contractTypeSchema,
  roleInitiateur: roleInitiateurSchema,
  // Soit contactKineId, soit infos brutes (vérifié dans le service)
  contactKineId: z.number().int().positive().optional(),
  destinataireFirstName: z.string().trim().min(1).max(100).optional(),
  destinataireLastName: z.string().trim().min(1).max(100).optional(),
  destinataireEmail: z.string().trim().email().max(255).optional(),
  destinatairePhone: z.string().trim().max(20).optional().or(z.literal('')),
  // data : JSON libre (snapshot infos contrat), schéma souple
  data: z.record(z.any()).optional(),
});

const updateContractSchema = z.object({
  type: contractTypeSchema.optional(),
  roleInitiateur: roleInitiateurSchema.optional(),
  contactKineId: z.number().int().positive().nullable().optional(),
  destinataireFirstName: z.string().trim().min(1).max(100).optional(),
  destinataireLastName: z.string().trim().min(1).max(100).optional(),
  destinataireEmail: z.string().trim().email().max(255).optional(),
  destinatairePhone: z.string().trim().max(20).optional().or(z.literal('')),
  data: z.record(z.any()).optional(),
});

const signInitiatorSchema = z.object({
  signatureText: z.string().trim().min(2).max(200),
  mention: z.string().trim().min(1).max(255).optional(),
});

const sendInvitationSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']),
});

// Toutes les routes nécessitent authenticate
router.get('/', authenticate, contractsController.listContracts);
router.get('/unread-count', authenticate, contractsController.getUnreadCount);
router.post('/mark-viewed', authenticate, contractsController.markViewed);
router.get('/:id', authenticate, contractsController.getContract);
router.get('/:id/preview-pdf', authenticate, contractsController.previewPdf);
router.post('/', authenticate, crudWriteLimiter, validate(createContractSchema), contractsController.createContract);
router.put('/:id', authenticate, crudWriteLimiter, validate(updateContractSchema), contractsController.updateContract);
router.post('/:id/sign-initiator', authenticate, crudWriteLimiter, validate(signInitiatorSchema), contractsController.signInitiator);
router.post('/:id/send-invitation', authenticate, crudWriteLimiter, validate(sendInvitationSchema), contractsController.sendInvitation);
router.post('/:id/revoke-invitation', authenticate, crudWriteLimiter, contractsController.revokeInvitation);
router.get('/:id/final-pdf', authenticate, contractsController.getFinalPdfUrl);
router.delete('/:id', authenticate, crudWriteLimiter, contractsController.deleteContract);

module.exports = router;
