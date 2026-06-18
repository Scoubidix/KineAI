import { Page, expect } from '@playwright/test';

// Modal d'abonnement (components/PaywallModal.jsx).
export class PaywallModal {
  constructor(private page: Page) {}

  // Ouvre le paywall via le bouton "Passer à Premium" du header,
  // visible uniquement quand le plan courant est FREE.
  async openFromHeader() {
    await this.page.getByRole('button', { name: 'Passer à Premium' }).click();
    await expect(
      this.page.getByText("Choisis ton plan d'abonnement professionnel")
    ).toBeVisible();
  }

  // Nouvel abonnement → le bouton de la carte plan est libellé "Choisir <Nom>".
  async choosePlan(planName: string) {
    await this.page.getByRole('button', { name: `Choisir ${planName}` }).click();
  }
}
