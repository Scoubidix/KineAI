const { validatePatientToken } = require('../services/patientTokenService');
const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');
const { sanitizeId, sanitizeIP } = require('../utils/logSanitizer');

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
    }

    if (!token) {
      const ip = req.ip || req.connection.remoteAddress;
      logger.warn(`🚨 PATIENT_AUTH: Token manquant - IP: ${sanitizeIP(ip)} - Route: ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'Token d\'authentification requis',
        code: 'TOKEN_MISSING'
      });
    }

    // 2. Valider le token JWT
    const tokenValidation = validatePatientToken(token);
    
    if (!tokenValidation.success) {
      const ip = req.ip || req.connection.remoteAddress;
      logger.warn(`🚨 PATIENT_AUTH: Token invalide - IP: ${ip} - Code: ${tokenValidation.code}`);
      return res.status(401).json({
        success: false,
        error: tokenValidation.error,
        code: tokenValidation.code || 'TOKEN_INVALID'
      });
    }

    // 3. Vérifier que le patient existe en base
    const prisma = prismaService.getInstance();
    
    // `findFirst` + `isActive` et non `findUnique` : un patient supprimé (soft
    // delete) ne doit plus pouvoir ouvrir son lien, même si son jeton est encore
    // valide.
    const patient = await prisma.patient.findFirst({
      where: { id: tokenValidation.patientId, isActive: true },
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
      logger.warn(`❌ PATIENT_AUTH: Patient inexistant - ID: ${sanitizeId(tokenValidation.patientId)}`);
      return res.status(404).json({
        success: false,
        error: 'Patient non trouvé',
        code: 'PATIENT_NOT_FOUND'
      });
    }

    // 4. Récupérer le programme associé au token
    // Pas de filtre `isActive` ici : le programme supprimé est bien récupéré,
    // pour que l'étape 6 puisse répondre un 410 « Programme supprimé » explicite
    // plutôt qu'un 404 générique.
    const programme = await prisma.programme.findUnique({
      where: { id: tokenValidation.programmeId },
      include: {
        // Même ordre que celui défini par le kiné dans le builder.
        exercices: {
          orderBy: { ordre: 'asc' },
          include: { exerciceModele: true }
        }
      }
    });

    if (!programme) {
      logger.warn(`❌ PATIENT_AUTH: Programme inexistant - ID: ${tokenValidation.programmeId}`);
      return res.status(404).json({
        success: false,
        error: 'Programme non trouvé',
        code: 'PROGRAMME_NOT_FOUND'
      });
    }

    // 5. Vérifier que le programme appartient bien au patient
    if (programme.patientId !== patient.id) {
      logger.warn(`🚨 PATIENT_AUTH: Tentative accès programme non autorisé - Patient: ${sanitizeId(patient.id)} - Programme: ${sanitizeId(programme.id)}`);
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce programme',
        code: 'PROGRAMME_ACCESS_DENIED'
      });
    }

    // 6. Vérifier que le programme n'est pas supprimé (soft delete)
    if (!programme.isActive) {
      logger.warn(`⚠️ PATIENT_AUTH: Tentative accès programme supprimé - ID: ${programme.id}`);
      return res.status(410).json({
        success: false,
        error: 'Programme supprimé, chat non disponible',
        code: 'PROGRAMME_DELETED'
      });
    }

    // 7. Vérifier que le programme n'est pas archivé
    if (programme.isArchived) {
      logger.warn(`⚠️ PATIENT_AUTH: Tentative accès programme archivé - ID: ${programme.id}`);
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

    // ✅ Log uniquement les NOUVELLES sessions (première connexion du jour)
    // Détection : si c'est la route d'initialisation du chat
    if (req.path.includes('/init') || req.method === 'GET') {
      logger.debug(`💬 PATIENT_CHAT: Session démarrée - Patient: ${sanitizeId(patient.id)} - Programme: ${programme.titre}`);
    }

    // 9. Continuer vers la route suivante
    next();

  } catch (error) {
    logger.warn(`❌ PATIENT_AUTH: Erreur serveur - ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'authentification',
      code: 'AUTH_SERVER_ERROR'
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
        // ✅ Log uniquement les expirations imminentes (< 6h)
        if (hoursUntilExpiry <= 6) {
          logger.warn(`⚠️ PATIENT_EXPIRY: Token expire bientôt - Patient: ${sanitizeId(req.patient?.id)} - ${Math.round(hoursUntilExpiry)}h restantes`);
        }
        
        // Ajouter un warning dans la réponse
        req.expiryWarning = {
          message: `Votre accès au chat expire dans ${Math.round(hoursUntilExpiry)} heures`,
          expiresAt: expiresAt.toISOString(),
          hoursRemaining: Math.round(hoursUntilExpiry)
        };
      }

      next();
    } catch (error) {
      logger.warn(`❌ PATIENT_EXPIRY: Erreur vérification - ${error.message}`);
      next(); // Continuer même en cas d'erreur
    }
  };
};

/**
 * Middleware pour logger les accès des patients (À UTILISER AVEC PARCIMONIE)
 * ⚠️ Recommandé uniquement pour debug ou monitoring spécifique
 */
const logPatientAccess = (req, res, next) => {
  // ✅ Log uniquement en cas de problème ou pour audit sécurité
  const suspicious = req.get('User-Agent')?.includes('bot') || 
                    req.ip?.includes('suspicious_pattern');
  
  if (suspicious || process.env.LOG_PATIENT_ACCESS === 'true') {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    logger.debug(`🔍 PATIENT_ACCESS: ID:${sanitizeId(req.patient?.id)} IP:${sanitizeIP(ip)} Programme:${sanitizeId(req.programme?.id)} UA:${userAgent?.substring(0, 50)}`);
  }
  
  next();
};

module.exports = {
  authenticatePatient,
  checkTokenExpiry,
  logPatientAccess
};