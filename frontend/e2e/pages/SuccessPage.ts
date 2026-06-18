import { Page, expect } from '@playwright/test';

// Page de retour après paiement (app/dashboard/kine/upgrade/success/page.tsx).
export class SuccessPage {
  constructor(private page: Page) {}

  async waitForLanding() {
    await this.page.waitForURL(/\/dashboard\/kine\/upgrade\/success/, { timeout: 60_000 });
    await expect(
      this.page.getByRole('heading', { name: /Paiement réussi/ })
    ).toBeVisible({ timeout: 30_000 });
  }

  // Le webhook peut prendre un instant : on rafraîchit jusqu'à voir le plan actif.
  async expectPlanActive(planName: string) {
    await expect(async () => {
      const refresh = this.page.getByRole('button', { name: /Actualiser/ }).first();
      if (await refresh.isVisible().catch(() => false)) {
        await refresh.click();
      }
      await expect(this.page.getByText(`Plan ${planName}`)).toBeVisible({ timeout: 3000 });
      await expect(this.page.getByText('Actif', { exact: true })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 45_000, intervals: [2000, 3000, 5000] });
  }
}
