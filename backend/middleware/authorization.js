// middleware/authorization.js
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/logSanitizer');
// Middleware pour vérifier les autorisations selon le plan d'abonnement

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Middleware pour vérifier si le kiné peut créer un nouveau programme
 */
const canCreateProgramme = async (req, res, next) => {
  try {
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, planType: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const planType = kine.planType || 'FREE';

    // Définir les limites par plan
    const limits = {
      'FREE': 0,
      'DECLIC': 1,
      'PRATIQUE': 3,
      'PIONNIER': -1, // illimité
      'EXPERT': -1    // illimité
    };

    const maxProgrammes = limits[planType];

    // Si illimité, autoriser
    if (maxProgrammes === -1) {
      req.kineId = kine.id;
      req.planType = planType;
      return next();
    }

    // Si limite à 0, bloquer
    if (maxProgrammes === 0) {
      return res.status(403).json({ 
        error: 'Création de programme non autorisée',
        code: 'PLAN_REQUIRED',
        message: 'Un abonnement est requis pour créer un programme patient',
        recommendedPlan: 'DECLIC'
      });
    }

    // Compter les programmes actifs
    const today = new Date();
    const activeProgrammes = await prisma.programme.count({
      where: {
        patient: {
          kineId: kine.id
        },
        isArchived: false,
        dateFin: {
          gt: today
        }
      }
    });

    // Vérifier la limite
    if (activeProgrammes >= maxProgrammes) {
      const recommendedPlan = planType === 'DECLIC' ? 'PRATIQUE' : 'PIONNIER';
      
      return res.status(403).json({ 
        error: 'Limite de programmes atteinte',
        code: 'PROGRAMME_LIMIT_REACHED',
        message: `Vous avez atteint la limite de ${maxProgrammes} programme(s) de votre plan ${planType}`,
        currentUsage: activeProgrammes,
        planLimit: maxProgrammes,
        recommendedPlan
      });
    }

    // Autoriser
    req.kineId = kine.id;
    req.planType = planType;
    next();

  } catch (error) {
    logger.error('Erreur vérification création programme:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

/**
 * Middleware pour vérifier l'accès à un assistant IA
 * @param {string} assistantType - Type d'assistant requis
 */
const requireAssistant = (assistantType) => {
  return async (req, res, next) => {
    try {
      const kine = await prisma.kine.findUnique({
        where: { uid: req.uid },
        select: { id: true, planType: true }
      });

      if (!kine) {
        return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
      }

      const planType = kine.planType || 'FREE';

      // Définir les assistants par plan
      const assistantsByPlan = {
        'FREE': [],
        'DECLIC': ['CONVERSATIONNEL'],
        'PRATIQUE': ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF'],
        'PIONNIER': ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF', 'TEMPLATES_ADMIN'],
        'EXPERT': ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF', 'TEMPLATES_ADMIN']
      };

      const availableAssistants = assistantsByPlan[planType] || [];

      if (!availableAssistants.includes(assistantType)) {
        // Déterminer le plan recommandé
        let recommendedPlan = 'DECLIC';
        if (['BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF'].includes(assistantType)) {
          recommendedPlan = 'PRATIQUE';
        } else if (assistantType === 'TEMPLATES_ADMIN') {
          recommendedPlan = 'PIONNIER';
        }

        return res.status(403).json({ 
          error: 'Assistant IA non autorisé',
          code: 'ASSISTANT_NOT_ALLOWED',
          message: `L'assistant ${assistantType} n'est pas disponible avec votre plan ${planType}`,
          assistantType,
          currentPlan: planType,
          availableAssistants,
          recommendedPlan
        });
      }

      // Autoriser
      req.kineId = kine.id;
      req.planType = planType;
      req.assistantType = assistantType;
      next();

    } catch (error) {
      logger.error('Erreur vérification assistant IA:', error);
      res.status(500).json({ error: 'Erreur interne du serveur' });
    }
  };
};

/**
 * Middleware pour vérifier l'accès à une fonctionnalité générale
 * @param {string} feature - Nom de la fonctionnalité
 */
const requireFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const kine = await prisma.kine.findUnique({
        where: { uid: req.uid },
        select: { id: true, planType: true }
      });

      if (!kine) {
        return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
      }

      const planType = kine.planType || 'FREE';

      // Vérifier selon la fonctionnalité
      switch (feature) {
        case 'CREATE_PROGRAMME':
          // Rediriger vers canCreateProgramme
          return canCreateProgramme(req, res, next);

        case 'AI_CONVERSATIONNEL':
          return requireAssistant('CONVERSATIONNEL')(req, res, next);

        case 'AI_BIBLIOTHEQUE':
          return requireAssistant('BIBLIOTHEQUE')(req, res, next);

        case 'AI_CLINIQUE':
          return requireAssistant('CLINIQUE')(req, res, next);

        case 'AI_ADMINISTRATIF':
          return requireAssistant('ADMINISTRATIF')(req, res, next);

        case 'TEMPLATES_ADMIN':
          return requireAssistant('TEMPLATES_ADMIN')(req, res, next);

        default:
          return res.status(400).json({ 
            error: 'Fonctionnalité inconnue',
            feature 
          });
      }

    } catch (error) {
      logger.error('Erreur vérification fonctionnalité:', error);
      res.status(500).json({ error: 'Erreur interne du serveur' });
    }
  };
};

/**
 * Helper pour récupérer les informations du plan actuel
 */
const getPlanInfo = async (req, res, next) => {
  try {
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, planType: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    req.kineId = kine.id;
    req.planType = kine.planType || 'FREE';
    next();

  } catch (error) {
    logger.error('Erreur récupération info plan:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

/**
 * Middleware pour vérifier l'accès administrateur
 * Basé sur une liste d'emails autorisés
 */
const requireAdmin = async (req, res, next) => {
  try {
    // Récupérer l'utilisateur depuis son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    if (!kine) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Liste des emails administrateurs
    const adminEmails = [
      'val50.jean@hotmail.fr',
      'admin@monassistantkine.com'
    ];

    // Vérifier si l'email est dans la liste admin
    if (!adminEmails.includes(kine.email)) {
      logger.warn(`🚫 Tentative accès admin refusée - User: ${sanitizeEmail(kine.email)} - Route: ${req.path}`);
      return res.status(403).json({ 
        error: 'Accès administrateur requis',
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Cette fonctionnalité est réservée aux administrateurs'
      });
    }

    // Accès accordé
    logger.info(`✅ Accès admin accordé - User: ${sanitizeEmail(kine.email)} - Route: ${req.path}`);
    req.kineId = kine.id;
    req.isAdmin = true;
    req.adminEmail = kine.email;
    req.adminName = `${kine.firstName} ${kine.lastName}`;
    
    next();

  } catch (error) {
    logger.error('Erreur vérification admin:', error);
    res.status(500).json({ 
      error: 'Erreur interne du serveur',
      code: 'ADMIN_CHECK_ERROR'
    });
  }
};

module.exports = {
  canCreateProgramme,
  requireAssistant,
  requireFeature,
  getPlanInfo,
  requireAdmin
};