const express = require('express');
const router = express.Router();
const templateService = require('../services/templateService');
const { authenticate } = require('../middleware/authenticate');
const { requireAssistant } = require('../middleware/authorization');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeName, sanitizeId } = require('../utils/logSanitizer');
const { sendMessageTemplate } = require('./webhook/whatsapp');
const prismaService = require('../services/prismaService');
const { gptLimiter } = require('../middleware/rateLimiter');
const adminAiService = require('../services/adminAiService');

// Helper: get kineId from Firebase UID
async function getKineId(uid) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid } });
  return kine;
}

// ========== GET /api/templates - Liste tous les templates ==========

router.get('/', authenticate, async (req, res) => {
  try {
    const { category, search, scope } = req.query;
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const result = await templateService.getAllTemplates({
      category, search, kineId: kine.id, scope
    });

    res.json(result);
  } catch (error) {
    logger.error('Erreur GET /api/templates:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des templates' });
  }
});

// ========== GET /api/templates/categories - Liste des catégories ==========

router.get('/categories', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const result = await templateService.getCategories(kine.id);
    res.json(result);
  } catch (error) {
    logger.error('Erreur GET /api/templates/categories:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des catégories' });
  }
});

// ========== POST /api/templates/personalize - Personnalise un template ==========

router.post('/personalize', authenticate, async (req, res) => {
  try {
    const { templateId, patientId, contactId } = req.body;
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    if (!templateId) {
      return res.status(400).json({ success: false, error: 'templateId requis' });
    }

    if (!patientId && !contactId) {
      return res.status(400).json({ success: false, error: 'patientId ou contactId requis' });
    }

    const result = await templateService.personalizeTemplate({
      templateId: parseInt(templateId),
      patientId: patientId ? parseInt(patientId) : null,
      contactId: contactId ? parseInt(contactId) : null,
      kineId: kine.id
    });

    res.json(result);
  } catch (error) {
    logger.error('Erreur POST /api/templates/personalize:', error.message);
    if (error.message.includes('introuvable')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la personnalisation du template' });
  }
});

// ========== POST /api/templates - Créer un template privé ==========

router.post('/', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const { title, category, subject, body, tags } = req.body;
    const template = await templateService.createTemplate({
      kineId: kine.id, title, category, subject, body, tags
    });

    res.status(201).json({ success: true, template });
  } catch (error) {
    logger.error('Erreur POST /api/templates:', error.message);
    if (error.message.includes('requis')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la création du template' });
  }
});

// ========== POST /api/templates/generate - Génération IA de message (PAYWALL) ==========

router.post('/generate', gptLimiter, authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'prompt requis (texte non vide)' });
    }

    if (prompt.length > 500) {
      return res.status(400).json({ success: false, error: 'prompt trop long (500 caractères max)' });
    }

    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    logger.info(`POST /api/templates/generate - Kiné ID: ${sanitizeId(kine.id)}`);

    const generatedMessage = await adminAiService.generateMessage(prompt.trim());

    res.json({ success: true, generatedMessage });
  } catch (error) {
    logger.error('Erreur POST /api/templates/generate:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la génération du message' });
  }
});

// ========== PUT /api/templates/:id - Modifier un template privé ==========

router.put('/:id', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const templateId = parseInt(req.params.id);
    const template = await templateService.updateTemplate(templateId, kine.id, req.body);
    res.json({ success: true, template });
  } catch (error) {
    logger.error('Erreur PUT /api/templates/:id:', error.message);
    if (error.message.includes('introuvable') || error.message.includes('non autorisée')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la modification du template' });
  }
});

// ========== POST /api/templates/history - Sauvegarde dans l'historique (PAYWALL) ==========

router.post('/history', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { patientId, contactId, templateId, templateTitle, subject, body, method, recipientName, recipientEmail } = req.body;
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    if (!templateTitle || !subject || !body || !method) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes (templateTitle, subject, body, method requis)'
      });
    }

    if (!['EMAIL', 'WHATSAPP'].includes(method)) {
      return res.status(400).json({ success: false, error: 'method doit être EMAIL ou WHATSAPP' });
    }

    const result = await templateService.saveToHistory({
      kineId: kine.id,
      patientId: patientId ? parseInt(patientId) : null,
      contactId: contactId ? parseInt(contactId) : null,
      templateId: templateId ? parseInt(templateId) : null,
      templateTitle,
      subject,
      body,
      recipientName,
      recipientEmail,
      method
    });

    res.json(result);
  } catch (error) {
    logger.error('Erreur POST /api/templates/history:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde dans l\'historique' });
  }
});

// ========== GET /api/templates/history - Historique des envois ==========

router.get('/history', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await templateService.getHistory(kine.id, { limit, offset });
    res.json(result);
  } catch (error) {
    logger.error('Erreur GET /api/templates/history:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération de l\'historique' });
  }
});

// ========== DELETE /api/templates/history/:id - Supprimer une entrée d'historique ==========

router.delete('/history/:id', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const historyId = parseInt(req.params.id);
    await templateService.deleteHistoryEntry(historyId, kine.id);
    res.json({ success: true, message: 'Entrée supprimée' });
  } catch (error) {
    logger.error('Erreur DELETE /api/templates/history/:id:', error.message);
    if (error.message.includes('introuvable') || error.message.includes('refusé')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression' });
  }
});

// ========== DELETE /api/templates/history - Supprimer tout l'historique ==========

router.delete('/history', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const count = await templateService.deleteAllHistory(kine.id);
    res.json({ success: true, message: `${count} entrées supprimées` });
  } catch (error) {
    logger.error('Erreur DELETE /api/templates/history:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression' });
  }
});

// ========== POST /api/templates/send-whatsapp - Envoie via WhatsApp Business API (PAYWALL) ==========

router.post('/send-whatsapp', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { patientId, templateId, templateTitle, subject, body } = req.body;
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const prisma = prismaService.getInstance();

    // Récupérer le patient
    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(patientId) },
      select: {
        id: true, firstName: true, lastName: true,
        phone: true, whatsappConsent: true, kineId: true
      }
    });

    if (!patient) return res.status(404).json({ success: false, error: 'Patient introuvable' });

    if (patient.kineId !== kine.id) {
      return res.status(403).json({ success: false, error: 'Accès refusé - Patient non associé à ce kiné' });
    }

    if (!patient.whatsappConsent) {
      return res.status(403).json({ success: false, error: 'Patient n\'a pas donné son consentement WhatsApp' });
    }

    if (!patient.phone) {
      return res.status(400).json({ success: false, error: 'Patient n\'a pas de numéro de téléphone' });
    }

    const cleanPhone = patient.phone.replace(/[\s\-\(\)]/g, '');
    const phoneNumber = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone.startsWith('0') ? '33' + cleanPhone.slice(1) : cleanPhone;

    logger.info(`POST /api/templates/send-whatsapp - Patient: ${sanitizeName(patient.firstName)} ${sanitizeName(patient.lastName)} (ID: ${sanitizeId(patient.id)}), Template: ${templateTitle}`);

    const whatsappResult = await sendMessageTemplate(phoneNumber, body);

    if (!whatsappResult.success) {
      logger.error('Échec envoi WhatsApp:', whatsappResult.error);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi WhatsApp',
        details: whatsappResult.error
      });
    }

    await templateService.saveToHistory({
      kineId: kine.id,
      patientId: parseInt(patientId),
      templateId: templateId ? parseInt(templateId) : null,
      templateTitle,
      subject: subject || '',
      body,
      recipientName: `${patient.firstName} ${patient.lastName}`,
      method: 'WHATSAPP'
    });

    res.json({
      success: true,
      message: 'Message WhatsApp envoyé avec succès',
      whatsappData: whatsappResult.data
    });

  } catch (error) {
    logger.error('Erreur POST /api/templates/send-whatsapp:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi WhatsApp' });
  }
});

// ========== DELETE /api/templates/:id - Supprimer un template privé ==========
// IMPORTANT : déclaré après /history et /send-whatsapp pour éviter que Express matche "history" comme :id

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const kine = await getKineId(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné introuvable' });

    const templateId = parseInt(req.params.id);
    await templateService.deleteTemplate(templateId, kine.id);
    res.json({ success: true, message: 'Template supprimé' });
  } catch (error) {
    logger.error('Erreur DELETE /api/templates/:id:', error.message);
    if (error.message.includes('introuvable') || error.message.includes('non autorisée')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression du template' });
  }
});

module.exports = router;
