import { test, expect } from '@playwright/test';
import { setPlan, getKineState } from '../fixtures/reset';
import { PaywallModal } from '../pages/PaywallModal';
import { StripeCheckoutPage } from '../pages/StripeCheckoutPage';
import { SuccessPage } from '../pages/SuccessPage';

// Les deux tests partagent le même compte de test → exécution EN SÉRIE, dans l'ordre.
test.describe.serial('Flow abonnement Stripe', () => {
  // Restaure le compte de test en EXPERT à la fin, quel que soit le résultat.
  test.afterAll(async () => {
    await setPlan('EXPERT', true);
  });

  test('Ré-abonné (hasHadTrial=true) → checkout SANS essai → plan actif', async ({ page }) => {
    // Reset : FREE, abo annulé, hasHadTrial=true → le checkout ne propose PAS d'essai
    // (prélèvement immédiat), comme un kiné qui se ré-abonne.
    await setPlan(null, true, true);

    await page.goto('/dashboard/kine/home');

    const paywall = new PaywallModal(page);
    await paywall.openFromHeader();
    await paywall.choosePlan('Pratique');

    const checkout = new StripeCheckoutPage(page);
    await checkout.waitForLoaded();
    await checkout.fillAndPay();

    const success = new SuccessPage(page);
    await success.waitForLanding();
    await success.expectPlanActive('Pratique');

    // Base : prélèvement immédiat → statut ACTIVE.
    await expect
      .poll(async () => (await getKineState()).subscriptionStatus, {
        timeout: 45_000,
        intervals: [2000, 3000, 5000],
      })
      .toBe('ACTIVE');
  });

  test('Nouveau kiné (hasHadTrial=false) → checkout AVEC essai 14 jours', async ({ page }) => {
    // Reset : FREE, abo annulé, hasHadTrial=false → le checkout démarre un essai 14 j
    // (carte captée, 0 € prélevé), comme un tout nouveau kiné.
    await setPlan(null, true, false);

    await page.goto('/dashboard/kine/home');

    const paywall = new PaywallModal(page);
    await paywall.openFromHeader();
    await paywall.choosePlan('Pratique');

    const checkout = new StripeCheckoutPage(page);
    await checkout.waitForLoaded();
    await checkout.fillAndPay();

    const success = new SuccessPage(page);
    await success.waitForLanding();
    await success.expectTrialStarted('Pratique');

    // Base : essai Stripe → statut TRIALING, et hasHadTrial passé à true (garde anti-abus).
    await expect
      .poll(async () => (await getKineState()).subscriptionStatus, {
        timeout: 45_000,
        intervals: [2000, 3000, 5000],
      })
      .toBe('TRIALING');
    expect((await getKineState()).hasHadTrial).toBe(true);
  });
});
