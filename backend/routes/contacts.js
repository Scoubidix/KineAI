const express = require('express');
const router = express.Router();
const contactService = require('../services/contactService');
const { authenticate } = require('../middleware/authenticate');
const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');
const { sanitizeUID } = require('../utils/logSanitizer');

// Helper: get kineId from Firebase UID
async function getKineId(uid) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid } });
  return kine ? kine.id : null;
}

// GET /api/contacts
router.get('/', authenticate, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const contacts = await contactService.getAllContacts(kineId);
    res.json({ success: true, contacts });
  } catch (error) {
    logger.error('Erreur GET /api/contacts:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des contacts' });
  }
});

// POST /api/contacts
router.post('/', authenticate, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const { firstName, lastName, email, phone, type } = req.body;
    const contact = await contactService.createContact({ kineId, firstName, lastName, email, phone, type });
    res.status(201).json({ success: true, contact });
  } catch (error) {
    logger.error('Erreur POST /api/contacts:', error.message);
    if (error.message.includes('requis')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la création du contact' });
  }
});

// PUT /api/contacts/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const contactId = parseInt(req.params.id);
    const contact = await contactService.updateContact(contactId, kineId, req.body);
    res.json({ success: true, contact });
  } catch (error) {
    logger.error('Erreur PUT /api/contacts:', error.message);
    if (error.message.includes('introuvable') || error.message.includes('refusé')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la modification du contact' });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const kineId = await getKineId(req.uid);
    if (!kineId) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const contactId = parseInt(req.params.id);
    await contactService.deleteContact(contactId, kineId);
    res.json({ success: true, message: 'Contact supprimé' });
  } catch (error) {
    logger.error('Erreur DELETE /api/contacts:', error.message);
    if (error.message.includes('introuvable') || error.message.includes('refusé')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression du contact' });
  }
});

module.exports = router;
