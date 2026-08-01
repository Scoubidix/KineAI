const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const prismaService = require('../services/prismaService');
const StripeService = require('../services/StripeService');
const { authenticate } = require('../middleware/authenticate');
const { getEffectivePlan, getTrialInfo } = require('../services/planService');

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
        stripeCustomerId: true,
        planType: true,
        billingCycle: true,
        trialEndDate: true,
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

    // Si pas d'abonnement Stripe : plan effectif (inclut l'essai gratuit) + infos essai
    if (!kine.subscriptionId) {
      const trial = getTrialInfo(kine);
      return res.json({
        subscription: {
          planType: getEffectivePlan(kine),
          billingCycle: kine.billingCycle || 'monthly',
          status: trial.isTrialing ? 'trialing' : 'active',
          currentPeriodEnd: trial.isTrialing ? kine.trialEndDate : null,
          cancelAtPeriodEnd: false,
          createdAt: kine.createdAt,
          isTrialing: trial.isTrialing,
          trialEndDate: trial.trialEndDate,
          daysLeft: trial.daysLeft,
          trialEligible: trial.trialEligible,
          canStartTrial: trial.canStartTrial
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

      // Pendant l'essai Stripe : le 1er prélèvement a lieu à la fin de l'essai (trial_end).
      const isStripeTrialing = stripeSub.status === 'trialing';
      const stripeTrialEnd = isStripeTrialing && stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000)
        : null;
      if (stripeTrialEnd) {
        nextPaymentDate = stripeTrialEnd;
      }

      // Changement d'abonnement programmé (downgrade différé) le cas échéant
      const pendingChange = await StripeService.getScheduledChange(stripeSub);

      res.json({
        subscription: {
          planType: kine.planType,
          billingCycle: kine.billingCycle || 'monthly',
          status: stripeSub.status,
          currentPeriodEnd: nextPaymentDate,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          createdAt: new Date(stripeSub.start_date * 1000),
          isTrialing: isStripeTrialing,
          trialEndDate: stripeTrialEnd,
          daysLeft: 0,
          trialEligible: false,
          canStartTrial: false,
          pendingChange,
        },
        kine: kineInfo
      });
    } catch (stripeError) {
      logger.warn('Stripe injoignable, fallback Prisma:', stripeError.message);
      res.json({
        subscription: {
          planType: kine.planType,
          billingCycle: kine.billingCycle || 'monthly',
          status: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: kine.createdAt,
          isTrialing: false,
          trialEndDate: null,
          daysLeft: 0,
          trialEligible: false,
          canStartTrial: false,
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

// POST /kine/trial/start — DÉSACTIVÉ : l'essai naît désormais au Checkout Stripe (carte requise).
router.post('/trial/start', authenticate, (req, res) => {
  return res.status(410).json({
    success: false,
    error: "L'essai gratuit démarre désormais lors de l'abonnement.",
    code: 'TRIAL_DISCONTINUED',
  });
});

module.exports = router;