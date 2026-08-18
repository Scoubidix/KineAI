// services/planService.js
// Résolveur de plan effectif : source de vérité UNIQUE du plan appliqué à un kiné.
// Ordre de priorité : abonnement payé actif > FREE.
// Pur (aucune I/O) → utilisé par les middlewares, le quota et l'endpoint subscription.
// L'essai gratuit est désormais géré par Stripe (subscriptionStatus TRIALING + planType du plan
// choisi) : plus d'essai « no-CB » à résoudre ici.

const TRIAL_DURATION_DAYS = 14;
const PAID_PLANS = ['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];

/** Plan effectif : abo payé (ou essai Stripe, où planType = plan choisi) > FREE.
 * On se base sur planType seul : planType ∈ PAID_PLANS signifie un vrai plan payé,
 * un essai Stripe en cours, ou un plan accordé manuellement. */
function getEffectivePlan(kine) {
  if (!kine) return 'FREE';
  if (PAID_PLANS.includes(kine.planType)) {
    return kine.planType;
  }
  return 'FREE';
}

/** Infos essai pour le frontend. L'essai étant géré par Stripe, seul canStartTrial
 * (= !hasHadTrial) pilote encore les affichages (badge « 14 J », bandeau paywall). */
function getTrialInfo(kine) {
  return {
    isTrialing: false,
    trialEndDate: null,
    daysLeft: 0,
    canStartTrial: kine ? !kine.hasHadTrial : false,
  };
}

module.exports = {
  getEffectivePlan,
  getTrialInfo,
  TRIAL_DURATION_DAYS,
  PAID_PLANS,
};
