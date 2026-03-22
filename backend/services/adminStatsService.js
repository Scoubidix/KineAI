// services/adminStatsService.js
const prismaService = require('./prismaService');
const stripeService = require('./StripeService');
const logger = require('../utils/logger');

/**
 * Récupère les abonnements actifs depuis Stripe (source de vérité)
 * Utilise auto-pagination pour parcourir tous les résultats
 */
async function getStripeSubscriptionStats() {
  const planCounts = {
    DECLIC: 0,
    PRATIQUE: 0,
    PIONNIER: 0,
    EXPERT: 0,
  };

  // Récupérer tous les abonnements actifs depuis Stripe
  const subscriptions = await stripeService.stripe.subscriptions.list({
    status: 'active',
    limit: 100,
  });

  // Paginer si nécessaire
  let allSubs = subscriptions.data;
  let hasMore = subscriptions.has_more;
  let lastId = allSubs.length > 0 ? allSubs[allSubs.length - 1].id : null;

  while (hasMore) {
    const next = await stripeService.stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: lastId,
    });
    allSubs = allSubs.concat(next.data);
    hasMore = next.has_more;
    lastId = next.data.length > 0 ? next.data[next.data.length - 1].id : null;
  }

  // Aussi récupérer les trialing
  const trialingSubs = await stripeService.stripe.subscriptions.list({
    status: 'trialing',
    limit: 100,
  });
  allSubs = allSubs.concat(trialingSubs.data);

  // Compter par plan et calculer le MRR réel
  let mrr = 0;
  for (const sub of allSubs) {
    const priceId = sub.items.data[0]?.price?.id;
    if (priceId && stripeService.planFromPrice[priceId]) {
      const plan = stripeService.planFromPrice[priceId];
      planCounts[plan]++;
    }
    // MRR = somme des montants récurrents mensuels (en centimes → euros)
    const item = sub.items.data[0];
    if (item?.price?.recurring?.interval === 'month') {
      mrr += (item.price.unit_amount || 0) / 100;
    } else if (item?.price?.recurring?.interval === 'year') {
      mrr += (item.price.unit_amount || 0) / 100 / 12;
    }
  }

  const activeSubscriptions = Object.values(planCounts).reduce((sum, c) => sum + c, 0);

  return { planCounts, activeSubscriptions, mrr };
}

/**
 * Récupère le dernier virement Stripe vers le compte bancaire (payout)
 */
async function getLastPayout() {
  try {
    const payouts = await stripeService.stripe.payouts.list({
      limit: 1,
    });

    if (payouts.data.length === 0) return null;

    const payout = payouts.data[0];
    return {
      amount: payout.amount / 100,
      currency: payout.currency,
      date: new Date(payout.arrival_date * 1000).toISOString(),
      status: payout.status,
    };
  } catch (error) {
    logger.error('Erreur récupération dernier payout Stripe', { error: error.message });
    return null;
  }
}

/**
 * Récupère les résiliations et changements de plan récents depuis Stripe
 */
async function getRecentSubscriptionEvents() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    const createdGte = Math.floor(startOfMonth.getTime() / 1000);

    // Résiliations (subscription.deleted)
    const cancelEvents = await stripeService.stripe.events.list({
      type: 'customer.subscription.deleted',
      created: { gte: createdGte },
      limit: 100,
    });

    const cancelsThisMonth = cancelEvents.data.length;
    const cancelsThisWeek = cancelEvents.data.filter(
      e => e.created >= Math.floor(startOfWeek.getTime() / 1000)
    ).length;

    // Changements de plan (subscription.updated avec changement de price)
    const updateEvents = await stripeService.stripe.events.list({
      type: 'customer.subscription.updated',
      created: { gte: createdGte },
      limit: 100,
    });

    const planChanges = [];
    for (const event of updateEvents.data) {
      const sub = event.data.object;
      const previous = event.data.previous_attributes;

      // Vérifier si le price a changé (= changement de plan)
      if (previous?.items?.data?.[0]?.price?.id) {
        const oldPriceId = previous.items.data[0].price.id;
        const newPriceId = sub.items.data[0]?.price?.id;
        const oldPlan = stripeService.planFromPrice[oldPriceId] || oldPriceId;
        const newPlan = stripeService.planFromPrice[newPriceId] || newPriceId;

        if (oldPlan !== newPlan) {
          planChanges.push({
            from: oldPlan,
            to: newPlan,
            date: new Date(event.created * 1000).toISOString(),
          });
        }
      }
    }

    return {
      cancelsThisWeek,
      cancelsThisMonth,
      planChanges,
    };
  } catch (error) {
    logger.error('Erreur récupération événements Stripe', { error: error.message });
    return { cancelsThisWeek: 0, cancelsThisMonth: 0, planChanges: [] };
  }
}

/**
 * Statistiques globales pour le dashboard admin
 */
async function getDashboardStats() {
  const prisma = prismaService.getInstance();

  // Abonnements depuis Stripe (source de vérité, pas de faux abonnements)
  const { planCounts, activeSubscriptions, mrr } = await getStripeSubscriptionStats();

  // Dernier virement Stripe vers compte bancaire + événements récents
  const [lastPayout, subscriptionEvents] = await Promise.all([
    getLastPayout(),
    getRecentSubscriptionEvents(),
  ]);

  // Total kinés inscrits (depuis Prisma, car Stripe ne gère pas les FREE)
  const totalKines = await prisma.kine.count();

  // Nombre de FREE = total kinés - abonnés payants Stripe
  const freeCount = Math.max(0, totalKines - activeSubscriptions);

  // Total patients
  const totalPatients = await prisma.patient.count({
    where: { isActive: true },
  });

  // Total programmes actifs
  const activeProgrammes = await prisma.programme.count({
    where: { isActive: true, isArchived: false },
  });

  // Nouveaux inscrits cette semaine / ce mois
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Lundi
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [newThisWeek, newThisMonth] = await Promise.all([
    prisma.kine.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.kine.count({ where: { createdAt: { gte: startOfMonth } } }),
  ]);

  return {
    planCounts: { FREE: freeCount, ...planCounts },
    totalKines,
    activeSubscriptions,
    totalPatients,
    activeProgrammes,
    mrr,
    lastPayout,
    newThisWeek,
    newThisMonth,
    cancelsThisWeek: subscriptionEvents.cancelsThisWeek,
    cancelsThisMonth: subscriptionEvents.cancelsThisMonth,
    planChanges: subscriptionEvents.planChanges,
  };
}

module.exports = { getDashboardStats };
