// services/trialService.js
// Point d'entrée UNIQUE pour démarrer un essai gratuit (inscription + opt-in).
// Idempotent via la garde d'éligibilité (un essai par compte).

const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { isTrialEligible, TRIAL_DURATION_DAYS } = require('./planService');
const brevoTrialService = require('./brevoTrialService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Démarre l'essai gratuit pour un kiné éligible.
 * @param {number} kineId
 * @param {Date} [now]
 * @returns {Promise<{ trialEndDate: Date }>}
 * @throws {Error} err.code = 'KINE_NOT_FOUND' | 'TRIAL_NOT_ELIGIBLE'
 */
async function startTrial(kineId, now = new Date()) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({
    where: { id: kineId },
    select: { id: true, email: true, firstName: true, trialEndDate: true, stripeCustomerId: true },
  });

  if (!kine) {
    const err = new Error('Kiné non trouvé');
    err.code = 'KINE_NOT_FOUND';
    throw err;
  }

  if (!isTrialEligible(kine)) {
    const err = new Error('Compte non éligible à l\'essai');
    err.code = 'TRIAL_NOT_ELIGIBLE';
    throw err;
  }

  const trialEndDate = new Date(now.getTime() + TRIAL_DURATION_DAYS * MS_PER_DAY);

  await prisma.kine.update({
    where: { id: kineId },
    data: { trialEndDate, subscriptionStatus: 'TRIALING' },
  });

  // Sync Brevo NON bloquante : un échec ne doit jamais annuler l'essai.
  try {
    await brevoTrialService.upsertTrialContact({
      email: kine.email,
      firstName: kine.firstName,
      trialStartDate: now,
      trialEndDate,
    });
  } catch (err) {
    logger.warn('[trial] Sync Brevo échouée (non bloquant):', err.message);
  }

  return { trialEndDate };
}

module.exports = { startTrial };
