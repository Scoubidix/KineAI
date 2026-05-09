const express = require('express');
const router = express.Router();

const bilansController = require('../controllers/bilansController');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { z } = require('zod');

// Schémas de validation
const bilanTypeSchema = z.enum(['INITIAL', 'INTERMEDIAIRE', 'FINAL']);

// structuredData : objet avec canonical (clé→valeur) + custom (label/value libres)
const structuredDataSchema = z.object({
  canonical: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).default({}),
  custom: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(200),
  })).default([]),
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
