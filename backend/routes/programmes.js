const express = require('express');
const router = express.Router();

const programmesController = require('../controllers/programmesController');
const { authenticate } = require('../middleware/authenticate');

// ROUTES SPÉCIFIQUES EN PREMIER (avant les routes avec paramètres)
// Route pour générer le lien de chat
router.post('/:programmeId/generate-link', authenticate, programmesController.generateProgrammeLink);

// NOUVELLE ROUTE : Envoi WhatsApp
router.post('/:id/send-whatsapp', authenticate, async (req, res) => {
  try {
    const { sendProgramLink } = require('../routes/webhook/whatsapp');
    const prismaService = require('../services/prismaService');
    const prisma = prismaService.getInstance();
    
    const programmeId = parseInt(req.params.id);
    const { chatLink } = req.body;

    // Vérifier que le lien est fourni
    if (!chatLink) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lien de chat requis' 
      });
    }

    // Récupérer le programme avec le patient
    const programme = await prisma.programme.findUnique({
      where: { id: programmeId },
      include: { 
        patient: {
          include: {
            kine: true // Pour vérifier que c'est le bon kiné
          }
        }
      }
    });

    if (!programme) {
      return res.status(404).json({ 
        success: false, 
        error: 'Programme non trouvé' 
      });
    }

    // Vérifier que le programme n'est pas expiré
    if (programme.dateFin < new Date()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Programme expiré - impossible d\'envoyer le lien' 
      });
    }

    // Vérifier que le patient a un numéro de téléphone
    if (!programme.patient.phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Numéro de téléphone manquant pour ce patient' 
      });
    }

    // Nettoyer le numéro de téléphone (format international)
    const cleanPhone = programme.patient.phone.replace(/\s+/g, '').replace(/^0/, '33');

    // Vérifier le format du numéro
    if (!/^\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Format de numéro de téléphone invalide' 
      });
    }

    // Envoyer le message WhatsApp
    const whatsappResult = await sendProgramLink(
      cleanPhone,
      programme.patient.firstName,
      chatLink
    );

    if (whatsappResult.success) {
      res.json({
        success: true,
        message: 'Message WhatsApp envoyé avec succès',
        phone: programme.patient.phone,
        sentAt: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Échec de l\'envoi WhatsApp',
        details: whatsappResult.error
      });
    }

  } catch (error) {
    console.error('Erreur envoi WhatsApp:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur interne du serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Routes CRUD standard
router.post('/', authenticate, programmesController.createProgramme);
router.put('/:id', authenticate, programmesController.updateProgramme);
router.delete('/:id', authenticate, programmesController.deleteProgramme);

// Route GET avec paramètre EN DERNIER (elle capture tout ce qui n'a pas matché avant)
router.get('/:patientId', authenticate, programmesController.getProgrammesByPatient);

module.exports = router;