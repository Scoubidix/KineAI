// services/tokenUsageService.js
// Compteur quotidien de tokens du chat unifié. Une ligne par (kineId, jour Europe/Paris) :
// le "reset à minuit" est implicite — la ligne d'hier cesse simplement d'être consultée.
const prismaService = require('./prismaService');
const logger = require('../utils/logger');

/**
 * Date calendaire du jour en Europe/Paris (gère l'heure d'été automatiquement).
 * Format 'YYYY-MM-DD' via fr-CA, converti en Date UTC minuit pour la colonne @db.Date.
 */
const getParisDate = () => {
  const dateString = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  return new Date(dateString);
};

/**
 * Tokens consommés aujourd'hui (0 si aucune ligne — le kiné n'a rien consommé).
 */
const getDailyUsage = async (kineId) => {
  const prisma = prismaService.getInstance();
  const usage = await prisma.dailyTokenUsage.findUnique({
    where: { kineId_date: { kineId, date: getParisDate() } }
  });
  return usage?.tokensUsed ?? 0;
};

/**
 * Incrémente le compteur du jour (upsert atomique sur [kineId, date]).
 * L'incrément se fait APRÈS la génération : un message en cours n'est jamais coupé,
 * un léger dépassement sur le dernier message est accepté (spec §7).
 */
const incrementDailyUsage = async (kineId, tokens) => {
  if (!tokens || tokens <= 0) return;

  const prisma = prismaService.getInstance();
  const date = getParisDate();

  await prisma.dailyTokenUsage.upsert({
    where: { kineId_date: { kineId, date } },
    update: { tokensUsed: { increment: tokens } },
    create: { kineId, date, tokensUsed: tokens }
  });

  logger.debug(`🧮 Usage tokens kiné ${kineId} : +${tokens} (jour ${date.toISOString().substring(0, 10)})`);
};

// ========== STATS ADMIN (dashboard) ==========

const PLANS = ['FREE', 'DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];

/**
 * Agrégats de consommation pour le dashboard admin : aujourd'hui (en cours),
 * hier (complet), moyenne des 10 jours révolus, détail par plan, coûts estimés
 * (tarif blended configurable — le compteur stocke input+output confondus).
 */
const getAdminUsageStats = async () => {
  const { BLENDED_COST_EUR_PER_MILLION } = require('../config/tokenQuotas');
  const prisma = prismaService.getInstance();

  const today = getParisDate();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - 10);

  // Une seule requête : J-10 → aujourd'hui, avec le plan du kiné (volume faible, agrégation en JS)
  const rows = await prisma.dailyTokenUsage.findMany({
    where: { date: { gte: windowStart } },
    include: { kine: { select: { planType: true } } }
  });

  const dayKey = (d) => new Date(d).toISOString().substring(0, 10);
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(yesterday);

  const emptyBucket = () => ({
    todayTokens: 0, activeKinesToday: 0,
    yesterdayTokens: 0, activeKinesYesterday: 0,
    tokens10d: 0
  });
  const byPlan = Object.fromEntries(PLANS.map((plan) => [plan, emptyBucket()]));
  const dailyTotals = {};

  rows.forEach((row) => {
    const plan = byPlan[row.kine?.planType] ? row.kine.planType : 'FREE';
    const key = dayKey(row.date);
    const bucket = byPlan[plan];

    if (key === todayKey) {
      bucket.todayTokens += row.tokensUsed;
      bucket.activeKinesToday += 1;
    } else {
      bucket.tokens10d += row.tokensUsed;
      dailyTotals[key] = (dailyTotals[key] || 0) + row.tokensUsed;
      if (key === yesterdayKey) {
        bucket.yesterdayTokens += row.tokensUsed;
        bucket.activeKinesYesterday += 1;
      }
    }
  });

  // 10 jours révolus (jours sans consommation = 0), du plus récent au plus ancien
  const daily = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(yesterday);
    d.setUTCDate(d.getUTCDate() - i);
    const key = dayKey(d);
    return { date: key, totalTokens: dailyTotals[key] || 0 };
  });

  const toCostEur = (tokens) => Math.round((tokens / 1_000_000) * BLENDED_COST_EUR_PER_MILLION * 100) / 100;

  const plans = PLANS.map((planType) => {
    const bucket = byPlan[planType];
    const avgDailyTokens10d = Math.round(bucket.tokens10d / 10);
    return {
      planType,
      todayTokens: bucket.todayTokens,
      activeKinesToday: bucket.activeKinesToday,
      yesterdayTokens: bucket.yesterdayTokens,
      activeKinesYesterday: bucket.activeKinesYesterday,
      avgDailyTokens10d,
      projectedMonthlyTokens: avgDailyTokens10d * 30,
      projectedMonthlyCostEur: toCostEur(avgDailyTokens10d * 30)
    };
  });

  const sum = (selector) => plans.reduce((acc, plan) => acc + selector(plan), 0);
  const totalAvgDaily = sum((p) => p.avgDailyTokens10d);

  return {
    today: {
      date: todayKey,
      totalTokens: sum((p) => p.todayTokens),
      activeKines: sum((p) => p.activeKinesToday),
      estimatedCostEur: toCostEur(sum((p) => p.todayTokens))
    },
    yesterday: {
      date: yesterdayKey,
      totalTokens: sum((p) => p.yesterdayTokens),
      activeKines: sum((p) => p.activeKinesYesterday),
      estimatedCostEur: toCostEur(sum((p) => p.yesterdayTokens))
    },
    avgDailyTokens10d: totalAvgDaily,
    projectedMonthlyTokens: totalAvgDaily * 30,
    projectedMonthlyCostEur: toCostEur(totalAvgDaily * 30),
    costAssumption: {
      blendedEurPerMillionTokens: BLENDED_COST_EUR_PER_MILLION,
      note: 'Tarif blended estimé Mistral Medium 3.5 (1,5 $/M input + 7,5 $/M output, ratio ~85% input)'
    },
    byPlan: plans,
    daily
  };
};

module.exports = { getParisDate, getDailyUsage, incrementDailyUsage, getAdminUsageStats };
