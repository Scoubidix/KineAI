// middleware/authorization.js
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/logSanitizer');
const prismaService = require('../services/prismaService');
// Middleware pour vérifier les autorisations selon le plan d'abonnement

// Matrice des features IA gatées par plan — source unique pour requireAssistant
// et requireAssistantOrPreview. Le chat unifié n'y figure pas : il est ouvert à
// tous les plans et régulé par le quota quotidien de tokens (checkTokenQuota).
const ASSISTANTS_BY_PLAN = {
  'FREE': [],
  'DECLIC': [],
  'PRATIQUE': ['ADMINISTRATIF'],
  'PIONNIER': ['ADMINISTRATIF', 'TEMPLATES_ADMIN'],
  'EXPERT': ['ADMINISTRATIF', 'TEMPLATES_ADMIN']
};

// Plan recommandé à afficher quand l'accès est refusé
const RECOMMENDED_PLAN_BY_ASSISTANT = {
  'ADMINISTRATIF': 'PRATIQUE',
  'TEMPLATES_ADMIN': 'PIONNIER'
};

/**
 * Middleware pour vérifier si le kiné peut créer un nouveau programme
 */
const canCreateProgramme = async (req, res, next) => {
  try {
    const prisma = prismaService.getInstance();
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
      'PRATIQUE': 5,
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
      const prisma = prismaService.getInstance();
      const kine = await prisma.kine.findUnique({
        where: { uid: req.uid },
        select: { id: true, planType: true }
      });

      if (!kine) {
        return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
      }

      const planType = kine.planType || 'FREE';

      const availableAssistants = ASSISTANTS_BY_PLAN[planType] || [];

      if (!availableAssistants.includes(assistantType)) {
        const recommendedPlan = RECOMMENDED_PLAN_BY_ASSISTANT[assistantType] || 'PRATIQUE';

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
 * Middleware preview : même logique que requireAssistant mais au lieu de 403,
 * laisse passer en mode preview (req.isPreview = true).
 * Le controller tronquera la réponse mid-stream.
 * @param {string} assistantType - Type d'assistant requis
 */
const requireAssistantOrPreview = (assistantType) => {
  return async (req, res, next) => {
    try {
      const prisma = prismaService.getInstance();
      const kine = await prisma.kine.findUnique({
        where: { uid: req.uid },
        select: { id: true, planType: true }
      });

      if (!kine) {
        return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
      }

      const planType = kine.planType || 'FREE';

      const availableAssistants = ASSISTANTS_BY_PLAN[planType] || [];
      const hasAccess = availableAssistants.includes(assistantType);

      req.kineId = kine.id;
      req.planType = planType;
      req.assistantType = assistantType;
      req.isPreview = !hasAccess;
      next();

    } catch (error) {
      logger.error('Erreur vérification assistant IA (preview):', error);
      res.status(500).json({ error: 'Erreur interne du serveur' });
    }
  };
};

/**
 * Helper pour récupérer les informations du plan actuel
 */
const getPlanInfo = async (req, res, next) => {
  try {
    const prisma = prismaService.getInstance();
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
    const prisma = prismaService.getInstance();
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

    // Liste des emails administrateurs (depuis variables d'environnement)
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    // Vérifier si l'email est dans la liste admin (case-insensitive)
    if (!adminEmails.includes(kine.email.toLowerCase())) {
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
  requireAssistantOrPreview,
  getPlanInfo,
  requireAdmin
};