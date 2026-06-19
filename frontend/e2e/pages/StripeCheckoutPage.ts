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

    // Cocher la case "Conditions d'utilisation" si Stripe l'affiche (apparaît sur les comptes
    // ayant déjà eu un abonnement, donc dès le 2e run e2e).
    const tos = page.locator('#termsOfServiceConsentCheckbox');
    if (await tos.isVisible().catch(() => false)) await tos.check();

    await page.locator('.SubmitButton, button[type="submit"]').first().click();

    // Stripe peut afficher la ToS après le 1er clic (validation côté client).
    // Si le bouton reste en état "incomplete" et la ToS apparaît, on la coche et on re-clique.
    const submitBtn = page.locator('.SubmitButton, button[type="submit"]').first();
    const tosAfterClick = page.locator('#termsOfServiceConsentCheckbox');
    if (await submitBtn.isVisible().catch(() => false)) {
      const btnClass = await submitBtn.getAttribute('class').catch(() => '');
      if (btnClass?.includes('incomplete')) {
        if (await tosAfterClick.isVisible().catch(() => false)) {
          await tosAfterClick.check();
        }
        await submitBtn.click();
      }
    }
  }
}
