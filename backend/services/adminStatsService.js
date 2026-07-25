// services/adminStatsService.js
const prismaService = require('./prismaService');
const stripeService = require('./StripeService');
const logger = require('../utils/logger');
const { TRIAL_DURATION_DAYS } = require('./planService');

const PARIS_TZ = 'Europe/Paris';

/**
 * Instant UTC correspondant à minuit (heure murale Paris) d'une date calendaire.
 * Calcule l'offset Paris pour cette date précise → gère l'heure d'été.
 */
function parisMidnightUtc(year, month /* 1-12 */, day) {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(naiveUtc)).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value);
    return acc;
  }, {});
  const hour = parts.hour === 24 ? 0 : parts.hour; // certaines plateformes rendent minuit en "24"
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  const offset = wallAsUtc - naiveUtc;
  return new Date(naiveUtc - offset);
}

/** Date calendaire {year, month, day} d'un instant, en heure Paris. */
function parisYmd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value);
    return acc;
  }, {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Jour de la semaine Paris : 1 = lundi ... 7 = dimanche. */
function parisWeekday(date) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: PARIS_TZ, weekday: 'short' }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd];
}

/** Ajoute n jours à une date calendaire {year, month, day}. */
function addDays(ymd, n) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Bornes de période (instants UTC ancrés sur l'heure murale Europe/Paris) :
 * - semaine du lundi 00:00 au dimanche (weekStart), semaine précédente (prevWeekStart)
 * - mois du 1er 00:00 (monthStart), mois précédent (prevMonthStart)
 * Corrige le bug du dimanche de l'ancien calcul et respecte lundi→dimanche / 1er→fin de mois.
 */
function getParisPeriodRanges(now = new Date()) {
  const today = parisYmd(now);
  const weekday = parisWeekday(now); // 1..7
  const mondayYmd = addDays(today, -(weekday - 1));
  const prevMondayYmd = addDays(mondayYmd, -7);

  const nextMonth = today.month === 12
    ? { year: today.year + 1, month: 1 }
    : { year: today.year, month: today.month + 1 };
  const prevMonth = today.month === 1
    ? { year: today.year - 1, month: 12 }
    : { year: today.year, month: today.month - 1 };

  return {
    weekStart: parisMidnightUtc(mondayYmd.year, mondayYmd.month, mondayYmd.day),
    prevWeekStart: parisMidnightUtc(prevMondayYmd.year, prevMondayYmd.month, prevMondayYmd.day),
    monthStart: parisMidnightUtc(today.year, today.month, 1),
    monthEnd: parisMidnightUtc(nextMonth.year, nextMonth.month, 1),
    prevMonthStart: parisMidnightUtc(prevMonth.year, prevMonth.month, 1),
  };
}

/** Variation en % (arrondie à 1 décimale). null si base précédente nulle (pas de division par zéro). */
function computeDeltaPct(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Normalise une métrique : total + comparatifs semaine et mois. */
function buildMetric({ total, weekCurrent, weekPrevious, monthCurrent, monthPrevious }) {
  return {
    total,
    week: { current: weekCurrent, previous: weekPrevious, deltaPct: computeDeltaPct(weekCurrent, weekPrevious) },
    month: { current: monthCurrent, previous: monthPrevious, deltaPct: computeDeltaPct(monthCurrent, monthPrevious) },
  };
}

/**
 * Statistiques d'usage des features (issues de la DB uniquement).
 * Pour chaque entité : total + comptages semaine/mois courants et précédents (comparatif).
 * NB : la semaine/mois "courant" compte l'activité depuis le début de la période (partielle),
 * comparée à la période précédente complète.
 * subscriptions.total est laissé à null (renseigné par Stripe dans getDashboardStats).
 */
async function getActivityStats(now = new Date(), ranges = getParisPeriodRanges(now)) {
  const prisma = prismaService.getInstance();
  const { weekStart, prevWeekStart, monthStart, prevMonthStart } = ranges;

  const inWeek = { gte: weekStart };
  const inPrevWeek = { gte: prevWeekStart, lt: weekStart };
  const inMonth = { gte: monthStart };
  const inPrevMonth = { gte: prevMonthStart, lt: monthStart };

  // Métrique d'une entité datée par createdAt (total peut avoir un filtre différent des périodes).
  const countByCreatedAt = (model, totalWhere = {}, periodBase = {}) =>
    Promise.all([
      model.count({ where: totalWhere }),
      model.count({ where: { ...periodBase, createdAt: inWeek } }),
      model.count({ where: { ...periodBase, createdAt: inPrevWeek } }),
      model.count({ where: { ...periodBase, createdAt: inMonth } }),
      model.count({ where: { ...periodBase, createdAt: inPrevMonth } }),
    ]).then(([total, wc, wp, mc, mp]) =>
      buildMetric({ total, weekCurrent: wc, weekPrevious: wp, monthCurrent: mc, monthPrevious: mp }));

  // Nouveaux abonnements : datés par subscriptionStartDate (total renseigné plus tard via Stripe).
  const countSubscriptions = () =>
    Promise.all([
      prisma.kine.count({ where: { subscriptionStartDate: inWeek } }),
      prisma.kine.count({ where: { subscriptionStartDate: inPrevWeek } }),
      prisma.kine.count({ where: { subscriptionStartDate: inMonth } }),
      prisma.kine.count({ where: { subscriptionStartDate: inPrevMonth } }),
    ]).then(([wc, wp, mc, mp]) =>
      buildMetric({ total: null, weekCurrent: wc, weekPrevious: wp, monthCurrent: mc, monthPrevious: mp }));

  // Essais gratuits : total = actuellement EN COURS (trialEndDate > now, non convertis) ;
  // comparatif semaine/mois = essais DÉMARRÉS sur la période. Un essai démarré dans une
  // période P équivaut à trialEndDate dans P décalée de la durée d'essai (fin = début + N jours).
  const TRIAL_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const shiftFwd = (range) => {
    const r = {};
    if (range.gte) r.gte = new Date(range.gte.getTime() + TRIAL_MS);
    if (range.lt) r.lt = new Date(range.lt.getTime() + TRIAL_MS);
    return r;
  };
  const trialActiveWhere = { trialEndDate: { gt: now }, OR: [{ planType: null }, { planType: 'FREE' }] };
  const countTrials = () =>
    Promise.all([
      prisma.kine.count({ where: trialActiveWhere }),
      prisma.kine.count({ where: { trialEndDate: shiftFwd(inWeek) } }),
      prisma.kine.count({ where: { trialEndDate: shiftFwd(inPrevWeek) } }),
      prisma.kine.count({ where: { trialEndDate: shiftFwd(inMonth) } }),
      prisma.kine.count({ where: { trialEndDate: shiftFwd(inPrevMonth) } }),
    ]).then(([total, wc, wp, mc, mp]) =>
      buildMetric({ total, weekCurrent: wc, weekPrevious: wp, monthCurrent: mc, monthPrevious: mp }));

  // Courriers : groupBy method sur chaque période (EMAIL / WHATSAPP).
  const lettersGroup = (sentAt) =>
    prisma.templateSentHistory.groupBy({ by: ['method'], where: sentAt ? { sentAt } : {}, _count: { _all: true } });

  const [kines, patients, programmes, bilans, contracts, referrals, subscriptions, trials, letterGroups] =
    await Promise.all([
      countByCreatedAt(prisma.kine),
      countByCreatedAt(prisma.patient, { isActive: true }),
      countByCreatedAt(prisma.programme, { isActive: true, isArchived: false }),
      // Bilans = événements « Générer le bilan » (KineActivityEvent), comptés au clic,
      // indépendamment de l'enregistrement sur un patient (cf. chatKineController).
      countByCreatedAt(prisma.kineActivityEvent, { type: 'BILAN_GENERATED' }, { type: 'BILAN_GENERATED' }),
      countByCreatedAt(prisma.contract),
      countByCreatedAt(prisma.referral),
      countSubscriptions(),
      countTrials(),
      Promise.all([
        lettersGroup(null), lettersGroup(inWeek), lettersGroup(inPrevWeek), lettersGroup(inMonth), lettersGroup(inPrevMonth),
      ]),
    ]);

  // Agrégation des courriers (total tous canaux + ventilation par méthode)
  const [ltTotal, ltWeek, ltPrevWeek, ltMonth, ltPrevMonth] = letterGroups;
  const sumAll = (groups) => groups.reduce((s, g) => s + (g._count?._all || 0), 0);
  const byMethod = (groups, method) => groups.find((g) => g.method === method)?._count?._all || 0;
  const lettersMetric = (pick) => buildMetric({
    total: pick(ltTotal),
    weekCurrent: pick(ltWeek), weekPrevious: pick(ltPrevWeek),
    monthCurrent: pick(ltMonth), monthPrevious: pick(ltPrevMonth),
  });

  const letters = lettersMetric(sumAll);
  letters.byMethod = {
    email: lettersMetric((g) => byMethod(g, 'EMAIL')),
    whatsapp: lettersMetric((g) => byMethod(g, 'WHATSAPP')),
  };

  return { kines, subscriptions, trials, patients, programmes, bilans, contracts, referrals, letters };
}

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
  // Répartition mensuel / annuel par plan
  const planCycleCounts = {
    DECLIC: { monthly: 0, yearly: 0 },
    PRATIQUE: { monthly: 0, yearly: 0 },
    PIONNIER: { monthly: 0, yearly: 0 },
    EXPERT: { monthly: 0, yearly: 0 },
  };
  // Total global par cycle
  const cycleCounts = { monthly: 0, yearly: 0 };

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

  // Aussi récupérer les trialing (paginés comme les active pour ne rien tronquer).
  // Ils comptent dans les répartitions (abonnés) mais PAS dans le MRR (ne paient pas encore).
  const trialingSubs = await stripeService.stripe.subscriptions.list({
    status: 'trialing',
    limit: 100,
  });
  allSubs = allSubs.concat(trialingSubs.data);
  let trialHasMore = trialingSubs.has_more;
  let trialLastId = trialingSubs.data.length > 0 ? trialingSubs.data[trialingSubs.data.length - 1].id : null;

  while (trialHasMore) {
    const next = await stripeService.stripe.subscriptions.list({
      status: 'trialing',
      limit: 100,
      starting_after: trialLastId,
    });
    allSubs = allSubs.concat(next.data);
    trialHasMore = next.has_more;
    trialLastId = next.data.length > 0 ? next.data[next.data.length - 1].id : null;
  }

  // Compter par plan (et par cycle) et calculer le MRR réel
  let mrr = 0;
  for (const sub of allSubs) {
    const item = sub.items.data[0];
    const priceId = item?.price?.id;
    const plan = stripeService.getPlanTypeFromPriceId(priceId);
    // Cycle déterminé directement depuis l'intervalle Stripe (robuste, sans dépendre du mapping env)
    const cycle = item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

    if (plan && planCounts[plan] !== undefined) {
      planCounts[plan]++;
      planCycleCounts[plan][cycle]++;
    }
    cycleCounts[cycle]++;

    // MRR = revenu récurrent RÉEL ramené au mois → on EXCLUT les essais (trialing),
    // qui ne paient rien encore. Les comptages ci-dessus, eux, les incluent.
    if (sub.status !== 'trialing') {
      if (item?.price?.recurring?.interval === 'month') {
        mrr += (item.price.unit_amount || 0) / 100;
      } else if (item?.price?.recurring?.interval === 'year') {
        mrr += (item.price.unit_amount || 0) / 100 / 12;
      }
    }
  }

  const activeSubscriptions = Object.values(planCounts).reduce((sum, c) => sum + c, 0);

  return { planCounts, planCycleCounts, cycleCounts, activeSubscriptions, mrr };
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
async function getRecentSubscriptionEvents(ranges = getParisPeriodRanges()) {
  try {
    const startOfMonth = ranges.monthStart;
    const startOfWeek = ranges.weekStart;

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
        const oldPlan = stripeService.getPlanTypeFromPriceId(oldPriceId) || oldPriceId;
        const newPlan = stripeService.getPlanTypeFromPriceId(newPriceId) || newPriceId;

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
  const now = new Date();
  const ranges = getParisPeriodRanges(now);

  // Abonnements depuis Stripe (source de vérité, pas de faux abonnements)
  const { planCounts, planCycleCounts, cycleCounts, activeSubscriptions, mrr } = await getStripeSubscriptionStats();

  // Dernier virement Stripe, événements récents, usage des features (DB) — en parallèle
  const [lastPayout, subscriptionEvents, activity] = await Promise.all([
    getLastPayout(),
    getRecentSubscriptionEvents(ranges),
    getActivityStats(now, ranges),
  ]);

  // Le total abonnements actifs vient de Stripe
  activity.subscriptions.total = activeSubscriptions;

  const totalKines = activity.kines.total;
  const freeCount = Math.max(0, totalKines - activeSubscriptions);

  return {
    planCounts: { FREE: freeCount, ...planCounts },
    planCycleCounts,
    cycleCounts,
    totalKines,
    activeSubscriptions,
    totalPatients: activity.patients.total,
    activeProgrammes: activity.programmes.total,
    mrr,
    lastPayout,
    // Champs "à plat" conservés pour compatibilité de l'existant
    newThisWeek: activity.kines.week.current,
    newThisMonth: activity.kines.month.current,
    cancelsThisWeek: subscriptionEvents.cancelsThisWeek,
    cancelsThisMonth: subscriptionEvents.cancelsThisMonth,
    planChanges: subscriptionEvents.planChanges,
    // Bloc complet avec comparatifs semaine/mois pour chaque entité
    activity,
  };
}

module.exports = {
  getDashboardStats,
  getActivityStats,
  getParisPeriodRanges,
  computeDeltaPct,
  buildMetric,
  getStripeSubscriptionStats, // exposé pour les tests unitaires
};
