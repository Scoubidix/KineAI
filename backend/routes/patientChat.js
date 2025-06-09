const express = require('express');
const router = express.Router();
const { authenticatePatient, checkTokenExpiry, logPatientAccess } = require('../middleware/patientAuth');
const { generateChatResponse, generateWelcomeMessage } = require('../services/openaiService');

/**
 * POST /api/patient/chat/:token
 * Envoyer un message au chat du patient
 */
router.post('/chat/:token', 
  authenticatePatient,
  checkTokenExpiry(24),
  logPatientAccess,
  async (req, res) => {
    try {
      const { message, chatHistory } = req.body;

      // Validation du message
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message requis et non vide'
        });
      }

      if (message.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'Message trop long (maximum 1000 caractères)'
        });
      }

      // Validation de l'historique (optionnel)
      let validHistory = [];
      if (chatHistory && Array.isArray(chatHistory)) {
        validHistory = chatHistory
          .filter(msg => msg.role && msg.content && ['user', 'assistant'].includes(msg.role))
          .slice(-10); // Garder seulement les 10 derniers messages
      }

      // Appel au service OpenAI avec les données du patient
      const chatResponse = await generateChatResponse(
        req.patient,
        [req.programme], // Array avec le programme actuel
        message.trim(),
        validHistory
      );

      if (!chatResponse.success) {
        return res.status(500).json({
          success: false,
          error: 'Erreur lors de la génération de la réponse',
          details: chatResponse.error
        });
      }

      // Construire la réponse
      const response = {
        success: true,
        message: chatResponse.message,
        usage: chatResponse.usage,
        patient: {
          id: req.patient.id,
          nom: `${req.patient.firstName} ${req.patient.lastName}`,
          age: calculateAge(req.patient.birthDate)
        },
        programme: {
          id: req.programme.id,
          titre: req.programme.titre,
          duree: req.programme.duree
        },
        timestamp: new Date().toISOString()
      };

      // Ajouter warning d'expiration si présent
      if (req.expiryWarning) {
        response.warning = req.expiryWarning;
      }

      res.json(response);

    } catch (error) {
      console.error('Erreur route chat patient:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors du chat',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/patient/welcome/:token
 * Récupérer le message d'accueil personnalisé
 */
router.get('/welcome/:token',
  authenticatePatient,
  checkTokenExpiry(24),
  async (req, res) => {
    try {
      // Générer le message d'accueil
      const welcomeResponse = await generateWelcomeMessage(
        req.patient,
        [req.programme]
      );

      const response = {
        success: true,
        welcomeMessage: welcomeResponse.success ? welcomeResponse.message : 
          "Bonjour ! Je suis votre assistant kinésithérapeute virtuel. Comment puis-je vous aider aujourd'hui ?",
        patient: {
          id: req.patient.id,
          nom: `${req.patient.firstName} ${req.patient.lastName}`,
          age: calculateAge(req.patient.birthDate)
        },
        programme: {
          id: req.programme.id,
          titre: req.programme.titre,
          description: req.programme.description,
          duree: req.programme.duree,
          dateFin: req.programme.dateFin,
          exerciceCount: req.programme.exercices?.length || 0
        },
        timestamp: new Date().toISOString()
      };

      // Ajouter warning d'expiration si présent
      if (req.expiryWarning) {
        response.warning = req.expiryWarning;
      }

      res.json(response);

    } catch (error) {
      console.error('Erreur route welcome patient:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la génération du message d\'accueil',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/patient/programme/:token
 * Récupérer les détails du programme du patient
 */
router.get('/programme/:token',
  authenticatePatient,
  async (req, res) => {
    try {
      const response = {
        success: true,
        programme: {
          id: req.programme.id,
          titre: req.programme.titre,
          description: req.programme.description,
          duree: req.programme.duree,
          dateFin: req.programme.dateFin,
          exercices: req.programme.exercices.map(ex => ({
            id: ex.id,
            nom: ex.exerciceModele?.nom,
            series: ex.series,
            repetitions: ex.repetitions,
            pause: ex.pause,
            consigne: ex.consigne
          }))
        },
        patient: {
          id: req.patient.id,
          nom: `${req.patient.firstName} ${req.patient.lastName}`
        },
        tokenInfo: {
          expiresAt: req.tokenData.expiresAt,
          issuedAt: req.tokenData.issuedAt
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Erreur route programme patient:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la récupération du programme',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/patient/validate/:token
 * Valider un token sans effectuer d'action (pour le frontend)
 */
router.post('/validate/:token',
  authenticatePatient,
  (req, res) => {
    res.json({
      success: true,
      message: 'Token valide',
      patient: {
        id: req.patient.id,
        nom: `${req.patient.firstName} ${req.patient.lastName}`
      },
      programme: {
        id: req.programme.id,
        titre: req.programme.titre
      },
      tokenInfo: {
        expiresAt: req.tokenData.expiresAt,
        issuedAt: req.tokenData.issuedAt
      }
    });
  }
);

// Fonction utilitaire pour calculer l'âge
function calculateAge(birthDateStr) {
  const birthDate = new Date(birthDateStr);
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
}

module.exports = router;