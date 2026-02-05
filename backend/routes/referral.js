// routes/referral.js
// Routes API pour le système de parrainage

const express = require('express');
const router = express.Router();
const prismaService = require('../services/prismaService');
const stripeService = require('../services/StripeService');
const { authenticate } = require('../middleware/authenticate');
const logger = require('../utils/logger');
const crypto = require('crypto');

// ========== CONSTANTES ==========
const MAX_REFERRALS_PER_MONTH = 5;  // Max parrainages validés par mois

// ========== HELPERS ==========

/**
 * Génère un code de parrainage unique (6 caractères alphanumériques)
 */
function generateReferralCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // Ex: "A1B2C3"
}

/**
 * Vérifie si le code est unique dans la base
 */
async function isCodeUnique(prisma, code) {
  const existing = await prisma.kine.findFirst({
    where: { referralCode: code }
  });
  return !existing;
}

// ========== ROUTES ==========

/**
 * POST /api/referral/generate-code
 * Génère ou récupère le code de parrainage du kiné connecté
 */
router.post('/generate-code', authenticate, async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, referralCode: true, planType: true, subscriptionStatus: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    // Vérifier que le kiné a un abonnement actif pour parrainer
    const canRefer = kine.planType &&
      kine.planType !== 'FREE' &&
      ['ACTIVE', 'TRIALING'].includes(kine.subscriptionStatus);

    if (!canRefer) {
      return res.status(403).json({
        error: 'Un abonnement actif est requis pour parrainer',
        currentPlan: kine.planType,
        status: kine.subscriptionStatus
      });
    }

    // Si le kiné a déjà un code, le retourner
    if (kine.referralCode) {
      return res.json({
        code: kine.referralCode,
        link: `${process.env.FRONTEND_URL}/signup?ref=${kine.referralCode}`,
        isNew: false
      });
    }

    // Générer un nouveau code unique
    let code;
    let attempts = 0;
    do {
      code = generateReferralCode();
      attempts++;
    } while (!(await isCodeUnique(prisma, code)) && attempts < 10);

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Impossible de générer un code unique' });
    }

    // Sauvegarder le code
    await prisma.kine.update({
      where: { id: kine.id },
      data: { referralCode: code }
    });

    logger.info(`Code parrainage généré pour kiné ${kine.id}: ${code}`);

    res.json({
      code: code,
      link: `${process.env.FRONTEND_URL}/signup?ref=${code}`,
      isNew: true
    });

  } catch (error) {
    logger.error('Erreur génération code parrainage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * GET /api/referral/my-code
 * Récupère le code de parrainage existant (sans en créer)
 */
router.get('/my-code', authenticate, async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { referralCode: true, planType: true, subscriptionStatus: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    if (!kine.referralCode) {
      return res.json({ code: null, link: null });
    }

    res.json({
      code: kine.referralCode,
      link: `${process.env.FRONTEND_URL}/signup?ref=${kine.referralCode}`
    });

  } catch (error) {
    logger.error('Erreur récupération code parrainage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * GET /api/referral/stats
 * Statistiques de parrainage du kiné connecté
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, referralCode: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    // Compter les parrainages par statut
    const referrals = await prisma.referral.findMany({
      where: { referrerId: kine.id },
      select: {
        id: true,
        status: true,
        planSubscribed: true,
        creditAmount: true,
        createdAt: true,
        creditedAt: true,
        referee: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Stats agrégées
    const stats = {
      total: referrals.length,
      pending: referrals.filter(r => r.status === 'PENDING').length,
      completed: referrals.filter(r => r.status === 'COMPLETED').length,
      canceled: referrals.filter(r => r.status === 'CANCELED').length,
      totalCreditsEarned: referrals
        .filter(r => r.status === 'COMPLETED')
        .reduce((sum, r) => sum + r.creditAmount, 0)
    };

    // Parrainages du mois en cours (pour vérifier la limite)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const referralsThisMonth = referrals.filter(r =>
      r.status === 'COMPLETED' && new Date(r.creditedAt) >= startOfMonth
    ).length;

    res.json({
      code: kine.referralCode,
      link: kine.referralCode ? `${process.env.FRONTEND_URL}/signup?ref=${kine.referralCode}` : null,
      stats,
      limits: {
        monthlyUsed: referralsThisMonth,
        monthlyMax: MAX_REFERRALS_PER_MONTH
      },
      referrals: referrals.map(r => ({
        id: r.id,
        refereeName: `${r.referee.firstName} ${r.referee.lastName.charAt(0)}.`, // Anonymiser
        plan: r.planSubscribed,
        credit: r.creditAmount,
        status: r.status,
        date: r.createdAt,
        creditedAt: r.creditedAt
      }))
    });

  } catch (error) {
    logger.error('Erreur stats parrainage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * GET /api/referral/validate/:code
 * Valide un code de parrainage (utilisé par le filleul avant checkout)
 * Route publique (pas d'authentification requise)
 */
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const prisma = prismaService.getInstance();

    if (!code || code.length < 4) {
      return res.status(400).json({ valid: false, error: 'Code invalide' });
    }

    // Chercher le parrain avec ce code
    const referrer = await prisma.kine.findFirst({
      where: { referralCode: code.toUpperCase() },
      select: {
        id: true,
        firstName: true,
        planType: true,
        subscriptionStatus: true
      }
    });

    if (!referrer) {
      return res.json({ valid: false, error: 'Code non trouvé' });
    }

    // Vérifier que le parrain a un abonnement actif
    const isReferrerActive = referrer.planType &&
      referrer.planType !== 'FREE' &&
      ['ACTIVE', 'TRIALING'].includes(referrer.subscriptionStatus);

    if (!isReferrerActive) {
      return res.json({ valid: false, error: 'Code expiré' });
    }

    res.json({
      valid: true,
      referrerFirstName: referrer.firstName,
      message: `Code de ${referrer.firstName} validé ! Vous recevrez tous les deux 1 mois offert après votre premier renouvellement.`
    });

  } catch (error) {
    logger.error('Erreur validation code parrainage:', error);
    res.status(500).json({ valid: false, error: 'Erreur de validation' });
  }
});

/**
 * GET /api/referral/my-referral
 * Vérifie si le kiné connecté a été parrainé (filleul)
 */
router.get('/my-referral', authenticate, async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const referral = await prisma.referral.findUnique({
      where: { refereeId: kine.id },
      select: {
        status: true,
        creditAmount: true,
        refereeCredited: true,
        createdAt: true,
        creditedAt: true,
        referrer: {
          select: { firstName: true }
        }
      }
    });

    if (!referral) {
      return res.json({ wasReferred: false });
    }

    res.json({
      wasReferred: true,
      referrerName: referral.referrer.firstName,
      creditAmount: referral.creditAmount,
      status: referral.status,
      credited: referral.refereeCredited,
      creditedAt: referral.creditedAt
    });

  } catch (error) {
    logger.error('Erreur récupération parrainage:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
