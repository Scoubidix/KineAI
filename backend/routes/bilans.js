const express = require('express');
const router = express.Router();

const bilansController = require('../controllers/bilansController');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { z } = require('zod');

// Schémas de validation
const bilanTypeSchema = z.enum(['INITIAL', 'INTERMEDIAIRE', 'FINAL']);

// structuredData : liste plate ordonnée d'items (canonical avec key+value,
// ou custom avec label+value). L'ordre du tableau est la source de vérité
// pour l'affichage (groupement par catégorie dérivé côté front).
const measurementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('canonical'),
    key: z.string().trim().min(1).max(80),
    // null = ajouté mais non saisi ; les vraies valeurs (0, false, '') sont valides
    value: z.union([z.number(), z.boolean(), z.string().max(500), z.null()]),
  }),
  z.object({
    kind: z.literal('custom'),
    label: z.string().trim().min(1).max(200),
    value: z.string().max(500), // peut être '' tant que pas saisie
  }),
]);

const structuredDataSchema = z.object({
  measurements: z.array(measurementSchema).max(200).default([]),
}).nullable().optional();

const createBilanSchema = z.object({
  motif: z.string().trim().max(500).optional(),
  rawNotes: z.string().trim().min(1).max(50000),
  bilanHtml: z.string().min(1).max(100000),
  type: bilanTypeSchema.optional(),
  structuredData: structuredDataSchema,
});

const updateBilanSchema = z.object({
  motif: z.string().trim().max(500).optional(),
  rawNotes: z.string().trim().min(1).max(50000).optional(),
  bilanHtml: z.string().min(1).max(100000).optional(),
  type: bilanTypeSchema.optional(),
  structuredData: structuredDataSchema,
});

// CRUD bilans — toutes les routes nécessitent authenticate
router.post('/:patientId/bilans', authenticate, validate(createBilanSchema), bilansController.createBilan);
router.get('/:patientId/bilans', authenticate, bilansController.getBilans);
router.get('/:patientId/bilans/:bilanId', authenticate, bilansController.getBilanById);
router.put('/:patientId/bilans/:bilanId', authenticate, validate(updateBilanSchema), bilansController.updateBilan);
router.delete('/:patientId/bilans/:bilanId', authenticate, bilansController.deleteBilan);

module.exports = router;
