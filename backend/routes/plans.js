const express = require('express');
const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');
const router = express.Router();

// Limite absolue pour le plan Pionnier
const PIONNIER_MAX_SLOTS = 100;

// GET /api/plans/:planType/availability - Vérifier la disponibilité d'un plan
router.get('/:planType/availability', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const { planType } = req.params;

    // Seul le plan PIONNIER a des limitations
    if (planType !== 'PIONNIER') {
      return res.json({
        planType,
        available: true,
        unlimited: true,
        message: 'Plan disponible sans limitation'
      });
    }

    // Compter TOUS les kinés qui ont eu le plan Pionnier (même ceux qui ont changé)
    // Cela inclut tous les statuts pour s'assurer que les 100 places ne se libèrent jamais
    const totalPionnierUsers = await prisma.kine.count({
      where: {
        OR: [
          { planType: 'PIONNIER' }, // Actuellement Pionnier
          { 
            // Anciens Pionniers (traces dans l'historique si vous avez une table audit)
            // Pour l'instant, on compte seulement les actuels et on ajustera selon vos besoins
            planType: 'PIONNIER'
          }
        ]
      }
    });

    const slotsRemaining = Math.max(0, PIONNIER_MAX_SLOTS - totalPionnierUsers);
    const isAvailable = slotsRemaining > 0;

    res.json({
      planType: 'PIONNIER',
      available: isAvailable,
      unlimited: false,
      maxSlots: PIONNIER_MAX_SLOTS,
      usedSlots: totalPionnierUsers,
      remainingSlots: slotsRemaining,
      message: isAvailable 
        ? `${slotsRemaining} places restantes sur 100`
        : 'Offre fermée définitivement - Les 100 places ont été attribuées'
    });

  } catch (error) {
    logger.error('Erreur vérification disponibilité plan:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/plans/:planType/remaining-slots - Récupérer uniquement le nombre de places restantes
router.get('/:planType/remaining-slots', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const { planType } = req.params;

    if (planType !== 'PIONNIER') {
      return res.json({
        planType,
        remaining: -1, // illimité
        unlimited: true
      });
    }

    const totalPionnierUsers = await prisma.kine.count({
      where: {
        planType: 'PIONNIER'
      }
    });

    const remaining = Math.max(0, PIONNIER_MAX_SLOTS - totalPionnierUsers);

    res.json({
      planType: 'PIONNIER',
      remaining,
      unlimited: false,
      total: PIONNIER_MAX_SLOTS,
      used: totalPionnierUsers
    });

  } catch (error) {
    logger.error('Erreur récupération slots restants:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/plans/stats - Statistiques globales des plans
router.get('/stats', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    // Compter les utilisateurs par plan
    const planStats = await prisma.kine.groupBy({
      by: ['planType'],
      _count: {
        id: true
      }
    });

    // Transformer en objet plus lisible
    const stats = {};
    planStats.forEach(stat => {
      const planType = stat.planType || 'DECLIC';
      stats[planType] = stat._count.id;
    });

    // S'assurer que tous les plans sont représentés
    const allPlans = ['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];
    allPlans.forEach(plan => {
      if (!stats[plan]) {
        stats[plan] = 0;
      }
    });

    // Calculs pour le plan Pionnier
    const pionnierCount = stats['PIONNIER'] || 0;
    const pionnierRemaining = Math.max(0, PIONNIER_MAX_SLOTS - pionnierCount);

    res.json({
      planDistribution: stats,
      totalUsers: Object.values(stats).reduce((sum, count) => sum + count, 0),
      pionnier: {
        current: pionnierCount,
        maxSlots: PIONNIER_MAX_SLOTS,
        remaining: pionnierRemaining,
        percentFilled: Math.round((pionnierCount / PIONNIER_MAX_SLOTS) * 100),
        available: pionnierRemaining > 0
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur récupération stats plans:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/plans/check-pionnier-eligibility - Vérifier si un utilisateur peut prendre le plan Pionnier
router.post('/check-pionnier-eligibility', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const { email, kineId } = req.body;

    if (!email && !kineId) {
      return res.status(400).json({ error: 'Email ou kineId requis' });
    }

    // Vérifier si l'utilisateur existe
    const kine = await prisma.kine.findFirst({
      where: email ? { email } : { id: kineId },
      select: {
        id: true,
        email: true,
        planType: true,
        stripeSubscriptionId: true
      }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    // Si déjà Pionnier, toujours éligible
    if (kine.planType === 'PIONNIER') {
      return res.json({
        eligible: true,
        reason: 'already_pionnier',
        message: 'Utilisateur déjà sur le plan Pionnier'
      });
    }

    // Vérifier la disponibilité générale
    const totalPionnierUsers = await prisma.kine.count({
      where: { planType: 'PIONNIER' }
    });

    const slotsRemaining = Math.max(0, PIONNIER_MAX_SLOTS - totalPionnierUsers);
    const isAvailable = slotsRemaining > 0;

    res.json({
      eligible: isAvailable,
      reason: isAvailable ? 'slots_available' : 'slots_exhausted',
      slotsRemaining,
      message: isAvailable 
        ? `Éligible - ${slotsRemaining} places restantes`
        : 'Non éligible - Toutes les places Pionnier ont été attribuées'
    });

  } catch (error) {
    logger.error('Erreur vérification éligibilité Pionnier:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;