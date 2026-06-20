import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from './paths';

const EMAIL = process.env.E2E_KINE_EMAIL;
const PASSWORD = process.env.E2E_KINE_PASSWORD;

setup('authenticate', async ({ page }) => {
  if (!EMAIL || !PASSWORD) {
    throw new Error('E2E_KINE_EMAIL / E2E_KINE_PASSWORD manquants dans frontend/.env.e2e');
  }

  await page.goto('/login');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // Le login redirige vers le dashboard après Firebase + récupération du profil.
  await page.waitForURL('**/dashboard/kine/**', { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard\/kine/);

  // Sauvegarde y compris IndexedDB où Firebase Auth stocke la session (Playwright >= 1.51).
  await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
});
