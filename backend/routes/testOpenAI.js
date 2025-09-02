const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { generateChatResponse, generateWelcomeMessage } = require('../services/openaiService');
const { generateChatUrl, validatePatientToken } = require('../services/patientTokenService');

// Test génération token patient
router.post('/test-token', (req, res) => {
  try {
    const { patientId, programmeId, durationDays } = req.body;
    
    // Simuler une date de fin
    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() + (durationDays || 14));
    
    const tokenResult = generateChatUrl(patientId || 123, programmeId || 1, dateFin);
    
    res.json(tokenResult);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur génération token',
      details: error.message
    });
  }
});

// Test validation token patient
router.post('/test-validate-token', (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token requis'
      });
    }
    
    const validation = validatePatientToken(token);
    res.json(validation);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur validation token',
      details: error.message
    });
  }
});

// Route de test pour le chat
router.post('/test-chat', async (req, res) => {
  try {
    const { message, patientId } = req.body;

    // Données de test simulées
    const mockPatientData = {
      id: patientId || 123,
      firstName: "Test",
      lastName: "Patient", 
      birthDate: "1990-05-15",
      email: "test@example.com",
      phone: "+33123456789"
    };

    const mockProgrammes = [{
      id: 1,
      titre: "Rééducation épaule droite",
      description: "Programme de renforcement et mobilité pour l'épaule après blessure",
      duree: 14,
      exercices: [
        {
          exerciceModele: { nom: "Élévation latérale bras" },
          series: 3,
          repetitions: 12,
          pause: 30,
          consigne: "Mouvement lent et contrôlé, arrêter si douleur"
        },
        {
          exerciceModele: { nom: "Rotation externe avec élastique" },
          series: 2,
          repetitions: 15,
          pause: 45,
          consigne: "Garder le coude collé au corps"
        },
        {
          exerciceModele: { nom: "Étirement capsule postérieure" },
          series: 3,
          repetitions: 8,
          pause: 20,
          consigne: "Maintenir 30 secondes chaque étirement"
        }
      ]
    }];

    // Test du chat
    if (message) {
      const chatResponse = await generateChatResponse(
        mockPatientData, 
        mockProgrammes, 
        message,
        [] // Pas d'historique pour le test
      );

      res.json({
        success: true,
        type: 'chat',
        userMessage: message,
        aiResponse: chatResponse,
        patientData: {
          anonymized: true,
          id: mockPatientData.id,
          age: new Date().getFullYear() - new Date(mockPatientData.birthDate).getFullYear()
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis"
      });
    }

  } catch (error) {
    logger.error('Erreur test chat:', error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur",
      details: error.message
    });
  }
});

// Route de test pour le message d'accueil (avec patientId optionnel)
router.get('/test-welcome', async (req, res) => {
  try {
    const patientId = 123; // ID par défaut

    // Mêmes données de test
    const mockPatientData = {
      id: parseInt(patientId),
      firstName: "Test",
      lastName: "Patient",
      birthDate: "1990-05-15",
      email: "test@example.com",
      phone: "+33123456789"
    };

    const mockProgrammes = [{
      id: 1,
      titre: "Rééducation épaule droite", 
      description: "Programme de renforcement et mobilité pour l'épaule après blessure",
      duree: 14,
      exercices: [
        {
          exerciceModele: { nom: "Élévation latérale bras" },
          series: 3,
          repetitions: 12,
          pause: 30,
          consigne: "Mouvement lent et contrôlé, arrêter si douleur"
        },
        {
          exerciceModele: { nom: "Rotation externe avec élastique" },
          series: 2,
          repetitions: 15,
          pause: 45,
          consigne: "Garder le coude collé au corps"
        }
      ]
    }];

    const welcomeResponse = await generateWelcomeMessage(mockPatientData, mockProgrammes);

    res.json({
      success: true,
      type: 'welcome',
      welcomeMessage: welcomeResponse,
      patientData: {
        anonymized: true,
        id: mockPatientData.id,
        age: new Date().getFullYear() - new Date(mockPatientData.birthDate).getFullYear()
      },
      programmeCount: mockProgrammes.length
    });

  } catch (error) {
    logger.error('Erreur test welcome:', error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur", 
      details: error.message
    });
  }
});

// Route de test pour le message d'accueil avec patientId spécifique
router.get('/test-welcome/:patientId', async (req, res) => {
  try {
    const patientId = req.params.patientId || 123;

    // Mêmes données de test
    const mockPatientData = {
      id: parseInt(patientId),
      firstName: "Test",
      lastName: "Patient",
      birthDate: "1990-05-15",
      email: "test@example.com",
      phone: "+33123456789"
    };

    const mockProgrammes = [{
      id: 1,
      titre: "Rééducation épaule droite", 
      description: "Programme de renforcement et mobilité pour l'épaule après blessure",
      duree: 14,
      exercices: [
        {
          exerciceModele: { nom: "Élévation latérale bras" },
          series: 3,
          repetitions: 12,
          pause: 30,
          consigne: "Mouvement lent et contrôlé, arrêter si douleur"
        },
        {
          exerciceModele: { nom: "Rotation externe avec élastique" },
          series: 2,
          repetitions: 15,
          pause: 45,
          consigne: "Garder le coude collé au corps"
        }
      ]
    }];

    const welcomeResponse = await generateWelcomeMessage(mockPatientData, mockProgrammes);

    res.json({
      success: true,
      type: 'welcome',
      welcomeMessage: welcomeResponse,
      patientData: {
        anonymized: true,
        id: mockPatientData.id,
        age: new Date().getFullYear() - new Date(mockPatientData.birthDate).getFullYear()
      },
      programmeCount: mockProgrammes.length
    });

  } catch (error) {
    logger.error('Erreur test welcome:', error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur", 
      details: error.message
    });
  }
});

// Route de debug pour vérifier la config
router.get('/test-jwt-config', (req, res) => {
  res.json({
    hasSecret: !!process.env.JWT_SECRET_PATIENT,
    secretLength: process.env.JWT_SECRET_PATIENT ? process.env.JWT_SECRET_PATIENT.length : 0,
    nodeEnv: process.env.NODE_ENV
  });
});

// Route pour tester la configuration OpenAI
router.get('/test-config', (req, res) => {
  res.json({
    success: true,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    apiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;