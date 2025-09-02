const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Secret spécifique aux patients (différent de Firebase)
const PATIENT_JWT_SECRET = process.env.JWT_SECRET_PATIENT || 'your_patient_secret_here';

/**
 * Génère un token JWT pour un patient avec durée = durée du programme
 * @param {number} patientId - ID du patient
 * @param {number} programmeId - ID du programme
 * @param {Date} dateFin - Date de fin du programme
 * @returns {string} Token JWT
 */
const generatePatientToken = (patientId, programmeId, dateFin) => {
  try {
    const payload = {
      patientId: parseInt(patientId),
      programmeId: parseInt(programmeId),
      type: 'patient_chat',
      iat: Math.floor(Date.now() / 1000), // Issued at
    };

    // Calculer l'expiration basée sur la date de fin du programme
    const expirationDate = new Date(dateFin);
    const exp = Math.floor(expirationDate.getTime() / 1000);

    // Ajouter l'expiration au payload
    payload.exp = exp;

    // Générer le token
    const token = jwt.sign(payload, PATIENT_JWT_SECRET);

    return {
      success: true,
      token,
      expiresAt: expirationDate.toISOString(),
      chatUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/chat/${token}`
    };

  } catch (error) {
    logger.error('Erreur génération token patient:', error.message);
    return {
      success: false,
      error: 'Erreur lors de la génération du token',
      details: error.message
    };
  }
};

/**
 * Valide et décode un token patient
 * @param {string} token - Token JWT à valider
 * @returns {object} Données du token ou erreur
 */
const validatePatientToken = (token) => {
  try {
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, PATIENT_JWT_SECRET);

    // Vérifications supplémentaires
    if (decoded.type !== 'patient_chat') {
      return {
        success: false,
        error: 'Type de token invalide',
        code: 'INVALID_TOKEN_TYPE'
      };
    }

    // Vérifier l'expiration manuellement (au cas où)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return {
        success: false,
        error: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      };
    }

    return {
      success: true,
      patientId: decoded.patientId,
      programmeId: decoded.programmeId,
      issuedAt: new Date(decoded.iat * 1000),
      expiresAt: new Date(decoded.exp * 1000)
    };

  } catch (error) {
    logger.error('Erreur validation token patient:', error.message);

    // Gestion des erreurs JWT spécifiques
    if (error.name === 'TokenExpiredError') {
      return {
        success: false,
        error: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      };
    }

    if (error.name === 'JsonWebTokenError') {
      return {
        success: false,
        error: 'Token invalide',
        code: 'INVALID_TOKEN'
      };
    }

    return {
      success: false,
      error: 'Erreur lors de la validation du token',
      code: 'VALIDATION_ERROR',
      details: error.message
    };
  }
};

/**
 * Vérifie si un token est proche de l'expiration
 * @param {string} token - Token à vérifier
 * @param {number} hoursBeforeExpiry - Nombre d'heures avant expiration pour alerter
 * @returns {object} Information sur l'expiration
 */
const checkTokenExpiry = (token, hoursBeforeExpiry = 24) => {
  try {
    const validation = validatePatientToken(token);
    
    if (!validation.success) {
      return validation;
    }

    const now = new Date();
    const expiresAt = validation.expiresAt;
    const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

    return {
      success: true,
      expiresAt,
      hoursUntilExpiry: Math.round(hoursUntilExpiry),
      isExpiringSoon: hoursUntilExpiry <= hoursBeforeExpiry,
      isExpired: hoursUntilExpiry <= 0
    };

  } catch (error) {
    return {
      success: false,
      error: 'Erreur lors de la vérification d\'expiration',
      details: error.message
    };
  }
};

/**
 * Génère une URL de chat complète pour un patient
 * @param {number} patientId - ID du patient
 * @param {number} programmeId - ID du programme  
 * @param {Date} dateFin - Date de fin du programme
 * @returns {object} URL complète et informations
 */
const generateChatUrl = (patientId, programmeId, dateFin) => {
  const tokenResult = generatePatientToken(patientId, programmeId, dateFin);
  
  if (!tokenResult.success) {
    return tokenResult;
  }

  return {
    success: true,
    chatUrl: tokenResult.chatUrl,
    token: tokenResult.token,
    expiresAt: tokenResult.expiresAt,
    programmeId,
    patientId
  };
};

module.exports = {
  generatePatientToken,
  validatePatientToken,
  checkTokenExpiry,
  generateChatUrl
};