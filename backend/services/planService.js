// services/planService.js
// Résolveur de plan effectif : source de vérité UNIQUE du plan appliqué à un kiné.
// Ordre de priorité : abonnement payé actif > essai gratuit actif > FREE.
// Pur (aucune I/O) → utilisé par les middlewares, le quota et l'endpoint subscription.

const TRIAL_PLAN = 'EXPERT';
const TRIAL_DURATION_DAYS = 14;
const PAID_PLANS = ['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** L'essai est actif si une date de fin existe et n'est pas dépassée. */
function isTrialActive(kine, now = new Date()) {
  if (!kine || !kine.trialEndDate) return false;
  return new Date(kine.trialEndDate).getTime() > now.getTime();
}

/** Plan effectif : abo payé > essai actif (EXPERT) > FREE.
 * On se base sur planType seul (pas de subscriptionId) : pendant l'essai
 * planType reste FREE, donc planType ∈ PAID_PLANS signifie un vrai plan payé
 * ou accordé manuellement — cohérent avec le gating historique. */
function getEffectivePlan(kine, now = new Date()) {
  if (!kine) return 'FREE';
  if (PAID_PLANS.includes(kine.planType)) {
    return kine.planType;
  }
  if (isTrialActive(kine, now)) return TRIAL_PLAN;
  return 'FREE';
}

/** Éligible à démarrer un essai : jamais d'essai ET jamais passé par un checkout Stripe. */
function isTrialEligible(kine) {
  if (!kine) return false;
  return kine.trialEndDate == null && kine.stripeCustomerId == null;
}

/** Infos essai pour le frontend (bandeau, badge, opt-in). */
function getTrialInfo(kine, now = new Date()) {
  const active = isTrialActive(kine, now);
  let daysLeft = 0;
  if (active) {
    const diffMs = new Date(kine.trialEndDate).getTime() - now.getTime();
    daysLeft = Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
  }
  return {
    isTrialing: active,
    trialEndDate: kine && kine.trialEndDate ? kine.trialEndDate : null,
    daysLeft,
    trialEligible: isTrialEligible(kine),
  };
}

module.exports = {
  getEffectivePlan,
  isTrialActive,
  isTrialEligible,
  getTrialInfo,
  TRIAL_PLAN,
  TRIAL_DURATION_DAYS,
  PAID_PLANS,
};
