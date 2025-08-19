// middleware/authorization.js
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
    console.error('Erreur vérification création programme:', error);
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
        'PRATIQUE': ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE'],
        'PIONNIER': ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF'],
        'EXPERT': ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF']
      };

      const availableAssistants = assistantsByPlan[planType] || [];

      if (!availableAssistants.includes(assistantType)) {
        // Déterminer le plan recommandé
        let recommendedPlan = 'DECLIC';
        if (['BIBLIOTHEQUE', 'CLINIQUE'].includes(assistantType)) {
          recommendedPlan = 'PRATIQUE';
        } else if (assistantType === 'ADMINISTRATIF') {
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
      console.error('Erreur vérification assistant IA:', error);
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

        default:
          return res.status(400).json({ 
            error: 'Fonctionnalité inconnue',
            feature 
          });
      }

    } catch (error) {
      console.error('Erreur vérification fonctionnalité:', error);
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
    console.error('Erreur récupération info plan:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

module.exports = {
  canCreateProgramme,
  requireAssistant,
  requireFeature,
  getPlanInfo
};