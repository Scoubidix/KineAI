const express = require('express');
const router = express.Router();
const templateService = require('../services/templateService');
const { authenticate } = require('../middleware/authenticate');
const { requireAssistant } = require('../middleware/authorization');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeName, sanitizeId } = require('../utils/logSanitizer');
const { sendMessageTemplate } = require('./webhook/whatsapp');

/**
 * Routes API pour la gestion des templates administratifs
 * Toutes les routes nécessitent l'authentification Firebase
 */

// ========== GET /api/templates - Liste tous les templates ==========

router.get('/', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { category, search } = req.query;

    logger.debug(`📋 GET /api/templates - Kiné: ${sanitizeUID(req.uid)}, Filtres: category=${category}, search=${search}`);

    const result = await templateService.getAllTemplates({
      category,
      search
    });

    res.json(result);

  } catch (error) {
    logger.error('❌ Erreur GET /api/templates:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des templates'
    });
  }
});

// ========== GET /api/templates/categories - Liste des catégories ==========

router.get('/categories', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    logger.debug(`📂 GET /api/templates/categories - Kiné: ${sanitizeUID(req.uid)}`);

    const result = await templateService.getCategories();

    res.json(result);

  } catch (error) {
    logger.error('❌ Erreur GET /api/templates/categories:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des catégories'
    });
  }
});

// ========== POST /api/templates/personalize - Personnalise un template ==========

router.post('/personalize', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { templateId, patientId } = req.body;
    const firebaseUid = req.uid;
    const prisma = require('../services/prismaService').getInstance();

    // Récupérer le kineId depuis le Firebase UID
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        success: false,
        error: 'Kiné introuvable'
      });
    }

    if (!templateId || !patientId) {
      return res.status(400).json({
        success: false,
        error: 'templateId et patientId requis'
      });
    }

    logger.debug(`🎨 POST /api/templates/personalize - Template: ${templateId}, Patient: ${patientId}, Kiné: ${sanitizeUID(req.uid)}`);

    const result = await templateService.personalizeTemplate({
      templateId: parseInt(templateId),
      patientId: parseInt(patientId),
      kineId: kine.id
    });

    res.json(result);

  } catch (error) {
    logger.error('❌ Erreur POST /api/templates/personalize:', error.message);

    if (error.message.includes('introuvable')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors de la personnalisation du template'
    });
  }
});

// ========== POST /api/templates/history - Sauvegarde dans l'historique ==========

router.post('/history', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { patientId, templateId, templateTitle, subject, body, method } = req.body;
    const firebaseUid = req.uid;
    const prisma = require('../services/prismaService').getInstance();

    // Récupérer le kineId depuis le Firebase UID
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        success: false,
        error: 'Kiné introuvable'
      });
    }

    if (!patientId || !templateId || !templateTitle || !subject || !body || !method) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes (patientId, templateId, templateTitle, subject, body, method requis)'
      });
    }

    if (!['EMAIL', 'WHATSAPP'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'method doit être EMAIL ou WHATSAPP'
      });
    }

    logger.info(`💾 POST /api/templates/history - Template: ${templateTitle}, Méthode: ${method}, Kiné: ${sanitizeUID(req.uid)}`);

    const result = await templateService.saveToHistory({
      kineId: kine.id,
      patientId: parseInt(patientId),
      templateId: parseInt(templateId),
      templateTitle,
      subject,
      body,
      method
    });

    res.json(result);

  } catch (error) {
    logger.error('❌ Erreur POST /api/templates/history:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde dans l\'historique'
    });
  }
});

// ========== GET /api/templates/history - Historique des envois ==========

router.get('/history', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const prisma = require('../services/prismaService').getInstance();

    // Récupérer le kineId depuis le Firebase UID
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        success: false,
        error: 'Kiné introuvable'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    logger.debug(`📜 GET /api/templates/history - Kiné: ${sanitizeUID(req.uid)}, limit=${limit}, offset=${offset}`);

    const result = await templateService.getHistory(kine.id, { limit, offset });

    res.json(result);

  } catch (error) {
    logger.error('❌ Erreur GET /api/templates/history:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

// ========== POST /api/templates/send-whatsapp - Envoie via WhatsApp Business API ==========

router.post('/send-whatsapp', authenticate, requireAssistant('TEMPLATES_ADMIN'), async (req, res) => {
  try {
    const { patientId, templateId, templateTitle, subject, body } = req.body;
    const firebaseUid = req.uid;
    const prisma = require('../services/prismaService').getInstance();

    // Récupérer le kineId depuis le Firebase UID
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        success: false,
        error: 'Kiné introuvable'
      });
    }

    // Récupérer le patient
    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(patientId) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        whatsappConsent: true,
        kineId: true
      }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient introuvable'
      });
    }

    // Vérifier ownership
    if (patient.kineId !== kine.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé - Patient non associé à ce kiné'
      });
    }

    // Vérifier consentement WhatsApp
    if (!patient.whatsappConsent) {
      return res.status(403).json({
        success: false,
        error: 'Patient n\'a pas donné son consentement WhatsApp'
      });
    }

    // Vérifier numéro de téléphone
    if (!patient.phone) {
      return res.status(400).json({
        success: false,
        error: 'Patient n\'a pas de numéro de téléphone'
      });
    }

    // Nettoyer le numéro de téléphone
    const cleanPhone = patient.phone.replace(/[\s\-\(\)]/g, '');
    const phoneNumber = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone.startsWith('0') ? '33' + cleanPhone.slice(1) : cleanPhone;

    // Pour WhatsApp : envoyer SEULEMENT le body (pas le subject)
    // Le subject est trop formel pour WhatsApp
    logger.info(`📱 POST /api/templates/send-whatsapp - Patient: ${sanitizeName(patient.firstName)} ${sanitizeName(patient.lastName)} (ID: ${sanitizeId(patient.id)}), Template: ${templateTitle}`);

    // Envoyer via WhatsApp Business API
    const whatsappResult = await sendMessageTemplate(phoneNumber, body);

    if (!whatsappResult.success) {
      logger.error('❌ Échec envoi WhatsApp:', whatsappResult.error);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi WhatsApp',
        details: whatsappResult.error
      });
    }

    // Sauvegarder dans l'historique
    await templateService.saveToHistory({
      kineId: kine.id,
      patientId: parseInt(patientId),
      templateId: parseInt(templateId),
      templateTitle,
      subject: subject || '',
      body,
      method: 'WHATSAPP'
    });

    logger.info(`✅ WhatsApp envoyé avec succès - Template: ${templateTitle}`);

    res.json({
      success: true,
      message: 'Message WhatsApp envoyé avec succès',
      whatsappData: whatsappResult.data
    });

  } catch (error) {
    logger.error('❌ Erreur POST /api/templates/send-whatsapp:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi WhatsApp'
    });
  }
});

module.exports = router;
