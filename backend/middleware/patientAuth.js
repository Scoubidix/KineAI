const { validatePatientToken } = require('../services/patientTokenService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Middleware pour valider l'authentification des patients via JWT
 * Utilise le token depuis l'URL ou le header Authorization
 */
const authenticatePatient = async (req, res, next) => {
  try {
    let token = null;

    // 1. Récupérer le token depuis différentes sources
    if (req.params.token) {
      // Token dans l'URL : /api/patient/chat/eyJ0eXAi...
      token = req.params.token;
    } else if (req.headers.authorization) {
      // Token dans le header : Authorization: Bearer eyJ0eXAi...
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    } else if (req.body.token) {
      // Token dans le body (fallback)
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token d\'authentification requis',
        code: 'TOKEN_MISSING'
      });
    }

    // 2. Valider le token JWT
    const tokenValidation = validatePatientToken(token);
    
    if (!tokenValidation.success) {
      return res.status(401).json({
        success: false,
        error: tokenValidation.error,
        code: tokenValidation.code || 'TOKEN_INVALID'
      });
    }

    // 3. Vérifier que le patient existe en base
    const patient = await prisma.patient.findUnique({
      where: { id: tokenValidation.patientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        email: true,
        phone: true
      }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient non trouvé',
        code: 'PATIENT_NOT_FOUND'
      });
    }

    // 4. Récupérer le programme associé au token
    const programme = await prisma.programme.findUnique({
      where: { id: tokenValidation.programmeId },
      include: {
        exercices: {
          include: { exerciceModele: true }
        }
      }
    });

    if (!programme) {
      return res.status(404).json({
        success: false,
        error: 'Programme non trouvé',
        code: 'PROGRAMME_NOT_FOUND'
      });
    }

    // 5. Vérifier que le programme appartient bien au patient
    if (programme.patientId !== patient.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce programme',
        code: 'PROGRAMME_ACCESS_DENIED'
      });
    }

    // 6. Vérifier que le programme n'est pas archivé
    if (programme.isArchived) {
      return res.status(410).json({
        success: false,
        error: 'Programme archivé, chat non disponible',
        code: 'PROGRAMME_ARCHIVED'
      });
    }

    // 7. Ajouter les données au request pour les routes suivantes
    req.patient = patient;
    req.programme = programme;
    req.tokenData = tokenValidation;
    req.originalToken = token;

    // 8. Logger l'accès (optionnel)
    console.log(`Patient authentifié: ${patient.firstName} ${patient.lastName} (ID: ${patient.id}) - Programme: ${programme.titre}`);

    // 9. Continuer vers la route suivante
    next();

  } catch (error) {
    console.error('Erreur middleware patient auth:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'authentification',
      code: 'AUTH_SERVER_ERROR',
      details: error.message
    });
  }
};

/**
 * Middleware optionnel pour vérifier l'expiration proche du token
 * Ajoute un warning si le token expire dans moins de 24h
 */
const checkTokenExpiry = (hoursBeforeWarning = 24) => {
  return (req, res, next) => {
    try {
      if (!req.tokenData || !req.tokenData.expiresAt) {
        return next();
      }

      const now = new Date();
      const expiresAt = req.tokenData.expiresAt;
      const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

      if (hoursUntilExpiry <= hoursBeforeWarning && hoursUntilExpiry > 0) {
        // Ajouter un warning dans la réponse
        req.expiryWarning = {
          message: `Votre accès au chat expire dans ${Math.round(hoursUntilExpiry)} heures`,
          expiresAt: expiresAt.toISOString(),
          hoursRemaining: Math.round(hoursUntilExpiry)
        };
      }

      next();
    } catch (error) {
      console.error('Erreur vérification expiration:', error);
      next(); // Continuer même en cas d'erreur
    }
  };
};

/**
 * Middleware pour logger les accès des patients (optionnel)
 */
const logPatientAccess = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  console.log(`[${timestamp}] Patient Access - ID: ${req.patient?.id}, IP: ${ip}, Programme: ${req.programme?.id}, UserAgent: ${userAgent}`);
  
  next();
};

module.exports = {
  authenticatePatient,
  checkTokenExpiry,
  logPatientAccess
};