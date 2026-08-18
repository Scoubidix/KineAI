const {
  getEffectivePlan,
  getTrialInfo,
  TRIAL_DURATION_DAYS,
} = require('../services/planService');

describe('planService.getEffectivePlan', () => {
  test('abonné payé → plan réel', () => {
    const kine = { planType: 'PRATIQUE', subscriptionId: 'sub_123' };
    expect(getEffectivePlan(kine)).toBe('PRATIQUE');
  });

  test('essai Stripe en cours (planType = plan choisi) → plan choisi', () => {
    // Pendant l'essai Stripe, planType porte déjà le plan souscrit.
    const kine = { planType: 'EXPERT', subscriptionId: 'sub_x', subscriptionStatus: 'TRIALING' };
    expect(getEffectivePlan(kine)).toBe('EXPERT');
  });

  test('planType FREE → FREE', () => {
    const kine = { planType: 'FREE', subscriptionId: null };
    expect(getEffectivePlan(kine)).toBe('FREE');
  });

  test('jamais d\'abo (planType null) → FREE', () => {
    const kine = { planType: null, subscriptionId: null };
    expect(getEffectivePlan(kine)).toBe('FREE');
  });

  test('kine null → FREE', () => {
    expect(getEffectivePlan(null)).toBe('FREE');
  });

  test('planType payant SANS subscriptionId → plan réel (plan accordé manuellement)', () => {
    const kine = { planType: 'PRATIQUE', subscriptionId: null };
    expect(getEffectivePlan(kine)).toBe('PRATIQUE');
  });
});

describe('planService.getTrialInfo — canStartTrial', () => {
  test('jamais eu d\'essai → canStartTrial true', () => {
    expect(getTrialInfo({ hasHadTrial: false }).canStartTrial).toBe(true);
  });
  test('a déjà eu un essai → canStartTrial false', () => {
    expect(getTrialInfo({ hasHadTrial: true }).canStartTrial).toBe(false);
  });
  test('kine null → canStartTrial false', () => {
    expect(getTrialInfo(null).canStartTrial).toBe(false);
  });
  test('champs essai neutralisés (essai géré par Stripe)', () => {
    const info = getTrialInfo({ hasHadTrial: false });
    expect(info.isTrialing).toBe(false);
    expect(info.daysLeft).toBe(0);
    expect(info.trialEndDate).toBeNull();
  });
});

describe('planService constantes', () => {
  test('TRIAL_DURATION_DAYS = 14', () => {
    expect(TRIAL_DURATION_DAYS).toBe(14);
  });
});
