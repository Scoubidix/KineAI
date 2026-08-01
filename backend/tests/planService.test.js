const {
  getEffectivePlan,
  isTrialActive,
  isTrialEligible,
  getTrialInfo,
  TRIAL_PLAN,
  TRIAL_DURATION_DAYS,
} = require('../services/planService');

const NOW = new Date('2026-07-06T12:00:00Z');
const inDays = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe('planService.getEffectivePlan', () => {
  test('abonné payé → plan réel', () => {
    const kine = { planType: 'PRATIQUE', subscriptionId: 'sub_123', trialEndDate: null };
    expect(getEffectivePlan(kine, NOW)).toBe('PRATIQUE');
  });

  test('essai actif (pas d\'abo) → EXPERT', () => {
    const kine = { planType: 'FREE', subscriptionId: null, trialEndDate: inDays(5) };
    expect(getEffectivePlan(kine, NOW)).toBe('EXPERT');
  });

  test('essai expiré → FREE', () => {
    const kine = { planType: 'FREE', subscriptionId: null, trialEndDate: inDays(-1) };
    expect(getEffectivePlan(kine, NOW)).toBe('FREE');
  });

  test('jamais d\'essai, pas d\'abo → FREE', () => {
    const kine = { planType: null, subscriptionId: null, trialEndDate: null };
    expect(getEffectivePlan(kine, NOW)).toBe('FREE');
  });

  test('abo payé ET essai encore dans le futur → plan réel prioritaire', () => {
    const kine = { planType: 'DECLIC', subscriptionId: 'sub_1', trialEndDate: inDays(3) };
    expect(getEffectivePlan(kine, NOW)).toBe('DECLIC');
  });

  test('kine null → FREE', () => {
    expect(getEffectivePlan(null, NOW)).toBe('FREE');
  });

  test('planType payant SANS subscriptionId → plan réel (plan accordé manuellement)', () => {
    const kine = { planType: 'PRATIQUE', subscriptionId: null, trialEndDate: null };
    expect(getEffectivePlan(kine, NOW)).toBe('PRATIQUE');
  });
});

describe('planService.isTrialEligible', () => {
  test('jamais d\'essai + jamais de client Stripe → éligible', () => {
    expect(isTrialEligible({ trialEndDate: null, stripeCustomerId: null })).toBe(true);
  });
  test('a déjà eu un essai → non éligible', () => {
    expect(isTrialEligible({ trialEndDate: inDays(-30), stripeCustomerId: null })).toBe(false);
  });
  test('a un client Stripe (abonné ou résilié) → non éligible', () => {
    expect(isTrialEligible({ trialEndDate: null, stripeCustomerId: 'cus_123' })).toBe(false);
  });
});

describe('planService.getTrialInfo', () => {
  test('essai actif → isTrialing + daysLeft arrondi au supérieur', () => {
    const info = getTrialInfo({ trialEndDate: inDays(5), stripeCustomerId: null }, NOW);
    expect(info.isTrialing).toBe(true);
    expect(info.daysLeft).toBe(5);
    expect(info.trialEligible).toBe(false);
  });
  test('pas d\'essai + éligible', () => {
    const info = getTrialInfo({ trialEndDate: null, stripeCustomerId: null }, NOW);
    expect(info.isTrialing).toBe(false);
    expect(info.daysLeft).toBe(0);
    expect(info.trialEligible).toBe(true);
  });

  test('kine null → non trialing, non éligible, trialEndDate null', () => {
    const info = getTrialInfo(null, NOW);
    expect(info.isTrialing).toBe(false);
    expect(info.daysLeft).toBe(0);
    expect(info.trialEligible).toBe(false);
    expect(info.trialEndDate).toBeNull();
  });
});

describe('planService — transition no-CB sécurisée', () => {
  test('essai no-CB actif SANS abo → EXPERT', () => {
    const kine = { planType: 'FREE', subscriptionId: null, trialEndDate: inDays(5) };
    expect(getEffectivePlan(kine, NOW)).toBe('EXPERT');
  });
  test('trialEndDate futur MAIS subscriptionId présent → PAS EXPERT (FREE)', () => {
    // Cas abo Stripe annulé en cours d'essai : planType FREE, trial_end encore futur.
    const kine = { planType: 'FREE', subscriptionId: 'sub_x', trialEndDate: inDays(5) };
    expect(getEffectivePlan(kine, NOW)).toBe('FREE');
  });
});

describe('planService.getTrialInfo — canStartTrial', () => {
  test('jamais eu d\'essai → canStartTrial true', () => {
    expect(getTrialInfo({ trialEndDate: null, stripeCustomerId: null, hasHadTrial: false }, NOW).canStartTrial).toBe(true);
  });
  test('a déjà eu un essai → canStartTrial false', () => {
    expect(getTrialInfo({ trialEndDate: null, stripeCustomerId: null, hasHadTrial: true }, NOW).canStartTrial).toBe(false);
  });
  test('kine null → canStartTrial false', () => {
    expect(getTrialInfo(null, NOW).canStartTrial).toBe(false);
  });
});

describe('planService constantes', () => {
  test('valeurs attendues', () => {
    expect(TRIAL_PLAN).toBe('EXPERT');
    expect(TRIAL_DURATION_DAYS).toBe(14);
  });
});
