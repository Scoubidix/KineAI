import { test } from '@playwright/test';
import { setPlan } from '../fixtures/reset';
import { PaywallModal } from '../pages/PaywallModal';
import { StripeCheckoutPage } from '../pages/StripeCheckoutPage';
import { SuccessPage } from '../pages/SuccessPage';

test.describe('Flow abonnement Stripe', () => {
  // État propre : aucun abonnement actif → force le vrai Checkout hébergé.
  test.beforeAll(async () => {
    await setPlan(null, true);
  });

  // Restaure le compte de test en EXPERT à la fin.
  test.afterAll(async () => {
    await setPlan('EXPERT', true);
  });

  test('souscription PRATIQUE de bout en bout', async ({ page }) => {
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
  });
});
