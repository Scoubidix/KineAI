import { Page, expect } from '@playwright/test';

// Page de retour après paiement (app/dashboard/kine/upgrade/success/page.tsx).
export class SuccessPage {
  constructor(private page: Page) {}

  async waitForLanding() {
    await this.page.waitForURL(/\/dashboard\/kine\/upgrade\/success/, { timeout: 60_000 });

    // Désenregistre les service workers sur localhost pour éviter qu'un SW stale
    // (mis en cache lors d'une session précédente) serve des JS avec des erreurs de parse
    // et empêche React de s'hydrater. Reload minimal pour repartir sur des JS frais.
    const hasStaleSwIssue = await this.page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
        return regs.length > 0;
      }
      return false;
    });
    if (hasStaleSwIssue) {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
    }

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
      // Cible le titre exact "Plan <Nom> Actif" (le badge "Actif" fait partie du heading).
      // Évite le strict mode violation : getByText('Plan Pratique') matcherait aussi le paragraphe descriptif.
      await expect(
        this.page.getByRole('heading', { name: `Plan ${planName} Actif` })
      ).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 45_000, intervals: [2000, 3000, 5000] });
  }
}
