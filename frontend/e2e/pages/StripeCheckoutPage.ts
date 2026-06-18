import { Page, expect } from '@playwright/test';
import { TEST_CARD } from '../fixtures/cards';

// Page Checkout hébergée par Stripe (checkout.stripe.com).
// NB : sélecteurs susceptibles d'évoluer côté Stripe — à ajuster en headed si besoin.
export class StripeCheckoutPage {
  constructor(private page: Page) {}

  async waitForLoaded() {
    await this.page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await expect(this.page.locator('#cardNumber')).toBeVisible({ timeout: 30_000 });
  }

  async fillAndPay() {
    const page = this.page;

    const email = page.locator('#email');
    if (await email.isVisible().catch(() => false)) {
      if (!(await email.inputValue())) {
        await email.fill(process.env.E2E_KINE_EMAIL || 'test@example.com');
      }
    }

    await page.locator('#cardNumber').fill(TEST_CARD.number);
    await page.locator('#cardExpiry').fill(TEST_CARD.expiry);
    await page.locator('#cardCvc').fill(TEST_CARD.cvc);

    const name = page.locator('#billingName');
    if (await name.isVisible().catch(() => false)) await name.fill(TEST_CARD.name);

    const postal = page.locator('#billingPostalCode');
    if (await postal.isVisible().catch(() => false)) await postal.fill(TEST_CARD.postalCode);

    await page.locator('.SubmitButton, button[type="submit"]').first().click();
  }
}
