const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const prismaService = require('../services/prismaService');
const { authenticate } = require('../middleware/authenticate');

const prisma = prismaService.getInstance();

// GET /kine/subscription - Récupérer les infos d'abonnement du kiné
router.get('/subscription', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase avec les VRAIS champs de votre schéma
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        stripeCustomerId: true,
        subscriptionId: true,
        planType: true,
        subscriptionStatus: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        createdAt: true
      }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    // Si pas d'abonnement Stripe, retourner plan FREE
    if (!kine.subscriptionId) {
      return res.json({
        subscription: {
          planType: kine.planType || 'FREE',  // NULL = FREE
          status: 'active',
          currentPeriodEnd: null,
          createdAt: kine.createdAt
        },
        kine: {
          id: kine.id,
          email: kine.email,
          firstName: kine.firstName,
          lastName: kine.lastName
        }
      });
    }

    // Retourner les infos d'abonnement
    const subscription = {
      planType: kine.planType,
      status: kine.subscriptionStatus,
      currentPeriodEnd: kine.subscriptionEndDate,
      createdAt: kine.subscriptionStartDate || kine.createdAt
    };

    res.json({
      subscription,
      kine: {
        id: kine.id,
        email: kine.email,
        firstName: kine.firstName,
        lastName: kine.lastName
      }
    });

  } catch (error) {
    logger.error('Erreur récupération abonnement:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /kine/usage - Récupérer l'usage actuel du kiné
router.get('/usage', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;

    // Compter les programmes actifs (programmes non archivés avec date de fin > aujourd'hui)
    const today = new Date();
    const activeProgrammes = await prisma.programme.count({
      where: {
        patient: {
          kineId: kineId
        },
        isArchived: false,
        dateFin: {
          gt: today
        }
      }
    });

    // Compter le total de programmes (programmes non archivés)
    const totalProgrammes = await prisma.programme.count({
      where: {
        patient: {
          kineId: kineId
        },
        isArchived: false
      }
    });

    // Compter les messages du mois en cours
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const monthlyMessages = await prisma.chatSession.count({
      where: {
        patient: {
          kineId: kineId
        },
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    // Statistiques supplémentaires
    const totalPatients = await prisma.patient.count({
      where: {
        kineId: kineId
      }
    });

    res.json({
      activeProgrammes,
      totalProgrammes,
      monthlyMessages,
      totalPatients,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur récupération usage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /kine/limits - Vérifier les limites selon le plan
router.get('/limits', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase avec le planType
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, planType: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;
    const planType = kine.planType || 'FREE';  // NULL = FREE

    // Définir les limites selon le plan
    const limits = {
      'FREE': {
        programmes: 0,  // Aucun programme avec IA autorisé
        assistants: []  // Aucun assistant IA
      },
      'DECLIC': {
        programmes: 1,
        assistants: ['CONVERSATIONNEL']
      },
      'PRATIQUE': {
        programmes: 3,
        assistants: ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE']
      },
      'PIONNIER': {
        programmes: -1, // illimité
        assistants: ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF']
      },
      'EXPERT': {
        programmes: -1, // illimité
        assistants: ['CONVERSATIONNEL', 'BIBLIOTHEQUE', 'CLINIQUE', 'ADMINISTRATIF']
      }
    };

    // Récupérer l'usage actuel
    const today = new Date();
    const activeProgrammes = await prisma.programme.count({
      where: {
        patient: {
          kineId: kineId
        },
        isArchived: false,
        dateFin: {
          gt: today
        }
      }
    });

    const currentLimits = limits[planType];
    const canCreateProgramme = currentLimits.programmes === -1 || activeProgrammes < currentLimits.programmes;

    res.json({
      planType,
      limits: currentLimits,
      usage: {
        activeProgrammes
      },
      permissions: {
        canCreateProgramme,
        availableAssistants: currentLimits.assistants
      }
    });

  } catch (error) {
    logger.error('Erreur récupération limites:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /kine/usage/refresh - Forcer le recalcul de l'usage
router.post('/usage/refresh', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;

    // Archiver automatiquement les programmes expirés
    const today = new Date();
    await prisma.programme.updateMany({
      where: {
        patient: {
          kineId: kineId
        },
        isArchived: false,
        dateFin: {
          lt: today
        }
      },
      data: {
        isArchived: true,
        archivedAt: today
      }
    });

    // Recalculer l'usage
    const activeProgrammes = await prisma.programme.count({
      where: {
        patient: {
          kineId: kineId
        },
        isArchived: false,
        dateFin: {
          gt: today
        }
      }
    });

    const totalProgrammes = await prisma.programme.count({
      where: {
        patient: {
          kineId: kineId
        },
        isArchived: false
      }
    });

    res.json({
      activeProgrammes,
      totalProgrammes,
      archivedExpiredProgrammes: true,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur refresh usage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;