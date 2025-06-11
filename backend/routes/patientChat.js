const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticatePatient, checkTokenExpiry, logPatientAccess } = require('../middleware/patientAuth');
const { generateChatResponse, generateWelcomeMessage } = require('../services/openaiService');

const prisma = new PrismaClient();

// Fonctions utilitaires pour l'historique
const getTodayChatHistory = async (patientId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const history = await prisma.chatSession.findMany({
      where: {
        patientId: parseInt(patientId),
        sessionDate: today
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        message: true,
        role: true,
        createdAt: true
      }
    });

    return history.map(msg => ({
      role: msg.role.toLowerCase(),
      content: msg.message,
      timestamp: msg.createdAt
    }));
  } catch (error) {
    console.error('Erreur récupération historique chat:', error);
    return [];
  }
};

const saveChatMessage = async (patientId, message, role) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await prisma.chatSession.create({
      data: {
        message,
        role: role.toUpperCase(),
        patientId: parseInt(patientId),
        sessionDate: today
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde message chat:', error);
    throw error;
  }
};

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
      const { message } = req.body;

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

      const patientId = req.patient.id;

      // 1. Récupérer l'historique du jour depuis la base de données
      const chatHistory = await getTodayChatHistory(patientId);

      // 2. Sauvegarder le message utilisateur
      await saveChatMessage(patientId, message.trim(), 'USER');

      // 3. Appel au service OpenAI avec l'historique récupéré
      const chatResponse = await generateChatResponse(
        req.patient,
        [req.programme],
        message.trim(),
        chatHistory
      );

      if (!chatResponse.success) {
        return res.status(500).json({
          success: false,
          error: 'Erreur lors de la génération de la réponse',
          details: chatResponse.error
        });
      }

      // 4. Sauvegarder la réponse de l'IA
      await saveChatMessage(patientId, chatResponse.message, 'ASSISTANT');

      // 5. Construire la réponse
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
 * Récupérer le message d'accueil personnalisé OU l'historique existant
 */
router.get('/welcome/:token',
  authenticatePatient,
  checkTokenExpiry(24),
  async (req, res) => {
    try {
      const patientId = req.patient.id;

      // Vérifier s'il y a déjà un historique aujourd'hui
      const existingHistory = await getTodayChatHistory(patientId);

      if (existingHistory.length > 0) {
        // Retourner l'historique existant
        const response = {
          success: true,
          hasHistory: true,
          chatHistory: existingHistory,
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

        if (req.expiryWarning) {
          response.warning = req.expiryWarning;
        }

        return res.json(response);
      }

      // Sinon, générer un nouveau message d'accueil
      const welcomeResponse = await generateWelcomeMessage(
        req.patient,
        [req.programme]
      );

      // Sauvegarder le message d'accueil
      if (welcomeResponse.success) {
        await saveChatMessage(patientId, welcomeResponse.message, 'ASSISTANT');
      }

      const response = {
        success: true,
        hasHistory: false,
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
 * GET /api/patient/chat-history/:token
 * Récupérer l'historique du chat du jour (nouvelle route)
 */
router.get('/chat-history/:token',
  authenticatePatient,
  async (req, res) => {
    try {
      const patientId = req.patient.id;
      const history = await getTodayChatHistory(patientId);

      res.json({
        success: true,
        history,
        count: history.length,
        patient: {
          id: req.patient.id,
          nom: `${req.patient.firstName} ${req.patient.lastName}`
        }
      });

    } catch (error) {
      console.error('Erreur récupération historique chat:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération de l\'historique',
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