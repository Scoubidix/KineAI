import { test, expect } from '@playwright/test';
import { setPlan } from '../fixtures/reset';
import {
  createClockSubscription,
  advanceClock,
  getKineSubscription,
  deleteClock,
  pollUntil,
} from '../fixtures/clock';

const EMAIL = process.env.E2E_KINE_EMAIL || '';

test.describe('Reconduction abonnement (Test Clock)', () => {
  let clockId: string;

  // État propre avant de créer l'abo sur le clock.
  test.beforeAll(async () => {
    await setPlan(null, true);
  });

  // Supprime le clock (cascade) puis restaure EXPERT, quoi qu'il arrive.
  test.afterAll(async () => {
    // Restaure EXPERT quoi qu'il arrive : un échec de suppression du clock ne doit pas
    // empêcher la restauration du compte de test.
    if (clockId) {
      try {
        await deleteClock(clockId, EMAIL);
      } catch {
        // suppression best-effort ; le test clock s'auto-supprime sous ~30j
      }
    }
    await setPlan('EXPERT', true);
  });

  test('la reconduction met à jour la période en base', async () => {
    // 1. Créer l'abo sur un test clock. periodEnd = fin de la période 1 (secondes).
    const created = await createClockSubscription(EMAIL);
    clockId = created.clockId;
    const endBefore = new Date(created.periodEnd * 1000);

    // 2. Avancer le clock juste après la fin de période 1 → déclenche la reconduction.
    await advanceClock(clockId, created.periodEnd + 3600);

    // 3. Attendre que le webhook customer.subscription.updated ait écrit une période plus tardive.
    const after = await pollUntil(
      () => getKineSubscription(EMAIL),
      (s) => !!s.subscriptionEndDate && new Date(s.subscriptionEndDate) > endBefore,
      { timeoutMs: 60_000, intervalMs: 1_500 }
    );

    // 4. Assertions.
    expect(new Date(after.subscriptionEndDate!).getTime()).toBeGreaterThan(endBefore.getTime());
    expect(after.subscriptionStatus).toBe('active');
    expect(after.planType).toBe('PRATIQUE');
  });
});
