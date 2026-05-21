const express = require('express');
const router = express.Router();
const { z } = require('zod');
const contactKineService = require('../services/contactKineService');
const { authenticate } = require('../middleware/authenticate');
const { crudWriteLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');

// Helper : Firebase UID → DB kine.id
async function getKineId(uid) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid } });
  return kine ? kine.id : null;
}

// Schémas Zod
const createContactKineSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const updateContactKineSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

// GET /api/contacts-kine
router.get('/', authenticate, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contacts = await contactKineService.getAllContactsKine(kineId);
    res.json({ success: true, contacts });
  } catch (err) {
    logger.error('Erreur GET /api/contacts-kine:', err.message);
    res.status(500).json({ success: false, error: 'Erreur récupération contacts', code: 'INTERNAL_ERROR' });
  }
});

// GET /api/contacts-kine/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contactId = parseInt(req.params.id, 10);
    if (Number.isNaN(contactId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const contact = await contactKineService.getContactKineById(contactId, kineId);
    if (!contact) return res.status(404).json({ success: false, error: 'Contact introuvable', code: 'NOT_FOUND' });

    res.json({ success: true, contact });
  } catch (err) {
    logger.error('Erreur GET /api/contacts-kine/:id:', err.message);
    res.status(500).json({ success: false, error: 'Erreur', code: 'INTERNAL_ERROR' });
  }
});

// POST /api/contacts-kine
router.post('/', authenticate, crudWriteLimiter, validate(createContactKineSchema), async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contact = await contactKineService.createContactKine({
      kineId,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone || null,
      notes: req.body.notes || null,
    });
    res.status(201).json({ success: true, contact });
  } catch (err) {
    logger.error('Erreur POST /api/contacts-kine:', err.message);
    if (err.code === 'DUPLICATE_CONTACT') {
      return res.status(409).json({ success: false, error: err.message, code: err.code });
    }
    res.status(500).json({ success: false, error: 'Erreur création contact', code: 'INTERNAL_ERROR' });
  }
});

// PUT /api/contacts-kine/:id
router.put('/:id', authenticate, crudWriteLimiter, validate(updateContactKineSchema), async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contactId = parseInt(req.params.id, 10);
    if (Number.isNaN(contactId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const contact = await contactKineService.updateContactKine(contactId, kineId, req.body);
    res.json({ success: true, contact });
  } catch (err) {
    logger.error('Erreur PUT /api/contacts-kine/:id:', err.message);
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message, code: err.code });
    }
    if (err.code === 'DUPLICATE_CONTACT') {
      return res.status(409).json({ success: false, error: err.message, code: err.code });
    }
    res.status(500).json({ success: false, error: 'Erreur modification contact', code: 'INTERNAL_ERROR' });
  }
});

// DELETE /api/contacts-kine/:id
router.delete('/:id', authenticate, crudWriteLimiter, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });

    const contactId = parseInt(req.params.id, 10);
    if (Number.isNaN(contactId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    await contactKineService.deleteContactKine(contactId, kineId);
    res.json({ success: true, message: 'Contact supprimé' });
  } catch (err) {
    logger.error('Erreur DELETE /api/contacts-kine/:id:', err.message);
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message, code: err.code });
    }
    res.status(500).json({ success: false, error: 'Erreur suppression contact', code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
