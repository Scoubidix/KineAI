const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const prismaService = require('../services/prismaService');
const StripeService = require('../services/StripeService');
const { authenticate } = require('../middleware/authenticate');

const prisma = prismaService.getInstance();

// GET /kine/subscription - Récupérer les infos d'abonnement du kiné
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        subscriptionId: true,
        planType: true,
        createdAt: true
      }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineInfo = {
      id: kine.id,
      email: kine.email,
      firstName: kine.firstName,
      lastName: kine.lastName
    };

    // Si pas d'abonnement Stripe, retourner plan FREE
    if (!kine.subscriptionId) {
      return res.json({
        subscription: {
          planType: kine.planType || 'FREE',
          status: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: kine.createdAt
        },
        kine: kineInfo
      });
    }

    // Fetch temps réel depuis Stripe
    try {
      const stripeSub = await StripeService.stripe.subscriptions.retrieve(kine.subscriptionId);

      // Récupérer la date du prochain paiement via upcoming invoice
      let nextPaymentDate = null;
      if (stripeSub.status === 'active' && !stripeSub.cancel_at_period_end) {
        try {
          const upcomingInvoice = await StripeService.stripe.invoices.createPreview({
            subscription: kine.subscriptionId,
          });
          nextPaymentDate = upcomingInvoice.period_end
            ? new Date(upcomingInvoice.period_end * 1000)
            : null;
        } catch (invoiceError) {
          // Pas de prochaine facture (ex: résiliation programmée)
          logger.warn('[subscription] Pas de upcoming invoice:', invoiceError.message);
        }
      }

      res.json({
        subscription: {
          planType: kine.planType,
          status: stripeSub.status,
          currentPeriodEnd: nextPaymentDate,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          createdAt: new Date(stripeSub.start_date * 1000)
        },
        kine: kineInfo
      });
    } catch (stripeError) {
      logger.warn('Stripe injoignable, fallback Prisma:', stripeError.message);
      res.json({
        subscription: {
          planType: kine.planType,
          status: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: kine.createdAt
        },
        kine: kineInfo
      });
    }

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
        programmes: 5,
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