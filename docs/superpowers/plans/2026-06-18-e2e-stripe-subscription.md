# Tests e2e Playwright — Flow abonnement Stripe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place une suite Playwright dont le test central couvre le flow d'abonnement Stripe complet (paywall → Checkout hébergé → carte test → webhook → plan actif), navigateur visible, rejouable à l'infini.

**Architecture:** Playwright dans `frontend/e2e/`. Auth Firebase capturée une fois via un *setup project* → `storageState` (avec IndexedDB). Isolation par un endpoint backend test-only `POST /api/test/set-plan` (dev uniquement) appelé en `beforeAll`/`afterAll`. Tests contre l'environnement **local** (front `:3001`, backend `:3000`, DB Docker, Stripe `sk_test_` + `stripe listen`).

**Tech Stack:** `@playwright/test`, `dotenv`, backend Express/Prisma/Jest existant.

## Global Constraints

- **Aucune env existante modifiée** : backend `NODE_ENV=development` et `FRONTEND_URL=http://localhost:3001` sont déjà corrects, ne pas y toucher. Seul ajout : `frontend/.env.e2e` (gitignored).
- **Secrets jamais commités** : `.env.e2e` et `e2e/.auth/` sont gitignored. Un `.env.e2e.example` (sans secrets) est commité.
- **Endpoint test-only** : `POST /api/test/set-plan` renvoie 404 si `NODE_ENV === 'production'`. Jamais accessible en prod.
- **Playwright >= 1.51** requis : `storageState({ indexedDB: true })` (Firebase Auth stocke la session en IndexedDB). Installer la dernière 1.x.
- **Plan testé** : `PRATIQUE` (29€). Restauration finale du compte de test en `EXPERT`.
- **Commits** : messages en français (`feat:`, `test:`, `chore:`), conformes aux conventions du repo.
- **Le local ne touche jamais la DB staging/prod.** Le webhook dashboard (→ staging) reste un no-op inoffensif ; les events locaux passent par `stripe listen`.

---

### Task 1: Scaffold Playwright (config, scripts, secrets, gitignore)

**Files:**
- Modify: `frontend/package.json` (devDependencies + scripts)
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/paths.ts`
- Create: `frontend/.env.e2e.example`
- Modify: `frontend/.gitignore`

**Interfaces:**
- Produces: `STORAGE_STATE` (chemin absolu du storageState) exporté depuis `frontend/e2e/paths.ts` ; constantes d'env `E2E_BASE_URL`, `E2E_API_URL`, `E2E_KINE_EMAIL`, `E2E_KINE_PASSWORD`, `E2E_TEST_SECRET` chargées depuis `.env.e2e`.

- [ ] **Step 1 : Installer les dépendances**

Run (PowerShell, dans `frontend/`) :
```powershell
cd C:\Users\val50\Documents\KineAI-1\frontend
npm install -D "@playwright/test@^1.51.0" dotenv
npx playwright install chromium
```
Expected : installation OK, navigateur Chromium téléchargé.

- [ ] **Step 2 : Créer `frontend/e2e/paths.ts`**

```ts
import path from 'path';

// Chemin du storageState (auth Firebase capturée par le setup project).
export const STORAGE_STATE = path.resolve(__dirname, '.auth', 'kine.json');
```

- [ ] **Step 3 : Créer `frontend/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';
import { STORAGE_STATE } from './e2e/paths';

// Charge les variables e2e (gitignored). Ne touche pas aux .env app.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    headless: !!process.env.CI,          // visible en local, headless en CI
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: { slowMo: process.env.CI ? 0 : 300 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      testMatch: /tests[\\/].*\.spec\.ts/,
    },
  ],
});
```

- [ ] **Step 4 : Créer `frontend/.env.e2e.example`**

```bash
# Copie ce fichier en .env.e2e et remplis les valeurs. NE PAS committer .env.e2e.
E2E_BASE_URL=http://localhost:3001
E2E_API_URL=http://localhost:3000
E2E_KINE_EMAIL=ton-compte-test@example.com
E2E_KINE_PASSWORD=ton-mot-de-passe
# Optionnel : défense en profondeur sur la route test-only (laisser vide si non utilisé)
E2E_TEST_SECRET=
```

- [ ] **Step 5 : Créer le `.env.e2e` réel (local, non commité)**

Copier `.env.e2e.example` → `.env.e2e` et renseigner email/mot de passe du compte kiné de test.
Run :
```powershell
Copy-Item .env.e2e.example .env.e2e
```
Puis éditer `.env.e2e` avec les vraies valeurs.

- [ ] **Step 6 : Mettre à jour `frontend/.gitignore`**

Ajouter à la fin :
```gitignore

# Playwright e2e
/e2e/.auth/
/.env.e2e
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 7 : Ajouter les scripts dans `frontend/package.json`**

Dans `"scripts"`, ajouter :
```json
    "e2e": "playwright test",
    "e2e:headed": "playwright test --headed",
    "e2e:ui": "playwright test --ui"
```

- [ ] **Step 8 : Vérifier que la config se charge**

Run :
```powershell
npx playwright test --list
```
Expected : la commande s'exécute sans erreur de config (0 test listé pour l'instant, ou aucun fichier trouvé — pas d'erreur TypeScript).

- [ ] **Step 9 : Commit**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e/paths.ts frontend/.env.e2e.example frontend/.gitignore
git commit -m "chore(e2e): scaffold Playwright (config, scripts, env, gitignore)`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Endpoint backend test-only `POST /api/test/set-plan`

**Files:**
- Create: `backend/routes/test.js`
- Modify: `backend/index.js` (montage dans le bloc `if (NODE_ENV !== 'production')`)
- Test: `backend/tests/test-route.test.js`

**Interfaces:**
- Produces: `POST /api/test/set-plan`, body `{ email: string, planType: 'DECLIC'|'PRATIQUE'|'PIONNIER'|'EXPERT'|null, cancelStripeSub?: boolean }`, header optionnel `x-e2e-secret`. Réponses : `200 { success: true, planType }`, `400` (email manquant / planType invalide), `404` (kiné inexistant ou prod), `403` (secret invalide). Consommé par `frontend/e2e/fixtures/reset.ts` (Task 4).

- [ ] **Step 1 : Écrire le test qui échoue — `backend/tests/test-route.test.js`**

```js
jest.mock('../utils/logger', () => require('./setup').logger);
jest.mock('../utils/logSanitizer', () => require('./setup').logSanitizer);
jest.mock('../firebase/firebase', () => require('./setup').firebase);
jest.mock('../services/prismaService', () => require('./setup').prismaService());
jest.mock('../services/StripeService', () => require('./setup').stripeService);

const request = require('supertest');
const { createApp, MOCK_KINE } = require('./helpers');
const prismaService = require('../services/prismaService');
const StripeService = require('../services/StripeService');
const mockPrisma = prismaService.__mockClient;

let app;
const OLD_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'development';
  delete process.env.E2E_TEST_SECRET;
  app = createApp();
  app.use('/api/test', require('../routes/test'));
});

afterAll(() => { process.env.NODE_ENV = OLD_ENV; });

describe('POST /api/test/set-plan (dev only)', () => {
  test('met le plan à PRATIQUE pour le kiné ciblé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({ ...MOCK_KINE, subscriptionId: null });
    mockPrisma.kine.update.mockResolvedValue({ ...MOCK_KINE, planType: 'PRATIQUE' });

    const res = await request(app)
      .post('/api/test/set-plan')
      .send({ email: 'test@kine.fr', planType: 'PRATIQUE' });

    expect(res.status).toBe(200);
    expect(res.body.planType).toBe('PRATIQUE');
    expect(mockPrisma.kine.update).toHaveBeenCalledWith({
      where: { email: 'test@kine.fr' },
      data: { planType: 'PRATIQUE' },
    });
  });

  test('planType null réinitialise l\'abonnement et annule Stripe', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({ ...MOCK_KINE, subscriptionId: 'sub_123' });
    mockPrisma.kine.update.mockResolvedValue({ ...MOCK_KINE, planType: null });

    const res = await request(app)
      .post('/api/test/set-plan')
      .send({ email: 'test@kine.fr', planType: null, cancelStripeSub: true });

    expect(res.status).toBe(200);
    expect(StripeService.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
    expect(mockPrisma.kine.update).toHaveBeenCalledWith({
      where: { email: 'test@kine.fr' },
      data: { planType: null, subscriptionId: null, subscriptionStatus: null },
    });
  });

  test('404 si kiné inexistant', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/test/set-plan')
      .send({ email: 'ghost@kine.fr', planType: 'PRATIQUE' });
    expect(res.status).toBe(404);
  });

  test('400 si planType invalide', async () => {
    const res = await request(app)
      .post('/api/test/set-plan')
      .send({ email: 'test@kine.fr', planType: 'GOLD' });
    expect(res.status).toBe(400);
  });

  test('404 en production (route désactivée)', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(app)
      .post('/api/test/set-plan')
      .send({ email: 'test@kine.fr', planType: 'PRATIQUE' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run :
```powershell
cd C:\Users\val50\Documents\KineAI-1\backend
npx jest tests/test-route.test.js
```
Expected : FAIL — `Cannot find module '../routes/test'`.

- [ ] **Step 3 : Implémenter `backend/routes/test.js`**

```js
// routes/test.js — Outils e2e, DISPONIBLES UNIQUEMENT HORS PRODUCTION.
const express = require('express');
const router = express.Router();
const prismaService = require('../services/prismaService');
const StripeService = require('../services/StripeService');
const logger = require('../utils/logger');

const prisma = prismaService.getInstance();
const VALID_PLANS = ['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];

// Garde : 404 en prod, 403 si un secret est configuré et ne correspond pas.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: 'Not found', code: 'NOT_FOUND' });
  }
  if (process.env.E2E_TEST_SECRET && req.get('x-e2e-secret') !== process.env.E2E_TEST_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
  }
  next();
});

// POST /api/test/set-plan — force le plan d'un kiné de test (lookup par email).
router.post('/set-plan', async (req, res) => {
  const { email, planType, cancelStripeSub = false } = req.body || {};

  if (!email) {
    return res.status(400).json({ success: false, error: 'email requis', code: 'BAD_REQUEST' });
  }
  if (planType !== null && !VALID_PLANS.includes(planType)) {
    return res.status(400).json({ success: false, error: 'planType invalide', code: 'BAD_REQUEST' });
  }

  const kine = await prisma.kine.findUnique({ where: { email } });
  if (!kine) {
    return res.status(404).json({ success: false, error: 'Kiné non trouvé', code: 'NOT_FOUND' });
  }

  if (cancelStripeSub && kine.subscriptionId) {
    try {
      await StripeService.stripe.subscriptions.cancel(kine.subscriptionId);
    } catch (err) {
      logger.warn('[test/set-plan] annulation Stripe ignorée:', err.message);
    }
  }

  const data = planType === null
    ? { planType: null, subscriptionId: null, subscriptionStatus: null }
    : { planType };

  const updated = await prisma.kine.update({ where: { email }, data });
  return res.json({ success: true, planType: updated.planType });
});

module.exports = router;
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run :
```powershell
npx jest tests/test-route.test.js
```
Expected : PASS (5 tests verts).

- [ ] **Step 5 : Monter la route dans `backend/index.js`**

Dans le bloc `if (process.env.NODE_ENV !== 'production') {` (commence ligne ~185, finit ligne ~538 `} // fin if (NODE_ENV !== 'production')`), juste après la ligne `app.get('/api/test-cors', ...)` (ligne ~385), ajouter :
```js
  // Outils e2e (set-plan) — montés uniquement hors production
  app.use('/api/test', require('./routes/test'));
```

- [ ] **Step 6 : Vérifier la non-régression de la suite backend**

Run :
```powershell
npx jest
```
Expected : tous les tests passent (81 + 5 nouveaux).

- [ ] **Step 7 : Vérifier manuellement avec le backend lancé**

Dans un terminal : `cd backend && node index.js`. Dans un autre :
```powershell
curl -Method POST "http://localhost:3000/api/test/set-plan" -Body (@{ email = $env:E2E_KINE_EMAIL; planType = "EXPERT"; cancelStripeSub = $true } | ConvertTo-Json) -ContentType "application/json"
```
(Remplacer l'email par celui du compte de test.) Expected : `{ "success": true, "planType": "EXPERT" }`.

- [ ] **Step 8 : Commit**

```powershell
git add backend/routes/test.js backend/index.js backend/tests/test-route.test.js
git commit -m "feat(e2e): endpoint test-only POST /api/test/set-plan (dev uniquement)`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Auth setup → storageState (avec IndexedDB)

**Files:**
- Create: `frontend/e2e/auth.setup.ts`

**Interfaces:**
- Consumes: `STORAGE_STATE` depuis `e2e/paths.ts` ; `E2E_KINE_EMAIL`/`E2E_KINE_PASSWORD` depuis `.env.e2e`. Sélecteurs login (vérifiés dans `app/(auth)/login/page.tsx`) : `#email`, `#password`, bouton `Se connecter` ; redirection vers `**/dashboard/kine/**`.
- Produces: fichier `e2e/.auth/kine.json` (storageState incluant IndexedDB) consommé par le projet `chromium`.

- [ ] **Step 1 : Créer `frontend/e2e/auth.setup.ts`**

```ts
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
```

- [ ] **Step 2 : Lancer le setup en mode visible (front + backend doivent tourner)**

Prérequis : `docker compose up -d`, `cd backend && node index.js`, `cd frontend && npm run dev`.
Run (dans `frontend/`) :
```powershell
npx playwright test --project=setup --headed
```
Expected : le navigateur s'ouvre, se logue, atterrit sur le dashboard ; test « authenticate » vert.

- [ ] **Step 3 : Vérifier que le storageState contient IndexedDB**

Run :
```powershell
Get-Content e2e\.auth\kine.json | Select-String "indexedDB"
```
Expected : au moins une occurrence de `indexedDB` (la session Firebase est bien capturée).

- [ ] **Step 4 : Vérifier que l'auth est réutilisable**

Créer temporairement `frontend/e2e/tests/auth-smoke.spec.ts` :
```ts
import { test, expect } from '@playwright/test';

test('auth réutilisée : accès direct au dashboard', async ({ page }) => {
  await page.goto('/dashboard/kine/home');
  await expect(page).toHaveURL(/\/dashboard\/kine\/home/);
});
```
Run :
```powershell
npx playwright test tests/auth-smoke.spec.ts --headed
```
Expected : PASS sans repasser par le login (pas de redirection vers `/login`).

- [ ] **Step 5 : Supprimer le smoke temporaire**

```powershell
Remove-Item e2e\tests\auth-smoke.spec.ts
```

- [ ] **Step 6 : Commit**

```powershell
git add frontend/e2e/auth.setup.ts
git commit -m "test(e2e): setup auth Firebase via storageState (IndexedDB)`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Fixtures (reset, carte) + Page Objects

**Files:**
- Create: `frontend/e2e/fixtures/reset.ts`
- Create: `frontend/e2e/fixtures/cards.ts`
- Create: `frontend/e2e/pages/PaywallModal.ts`
- Create: `frontend/e2e/pages/StripeCheckoutPage.ts`
- Create: `frontend/e2e/pages/SuccessPage.ts`
- Create (temporaire, supprimé en fin de tâche) : `frontend/e2e/tests/reset-smoke.spec.ts`

**Interfaces:**
- Consumes: `POST /api/test/set-plan` (Task 2) ; `E2E_API_URL`, `E2E_KINE_EMAIL`, `E2E_TEST_SECRET` depuis `.env.e2e`.
- Produces:
  - `setPlan(planType: PlanType, cancelStripeSub?: boolean): Promise<{ success: boolean; planType: string | null }>` et type `PlanType` (`fixtures/reset.ts`)
  - `TEST_CARD` (`fixtures/cards.ts`)
  - classes `PaywallModal` (méthodes `openFromHeader()`, `choosePlan(planName)`), `StripeCheckoutPage` (`waitForLoaded()`, `fillAndPay()`), `SuccessPage` (`waitForLanding()`, `expectPlanActive(planName)`).

- [ ] **Step 1 : Créer `frontend/e2e/fixtures/reset.ts`**

```ts
import { request } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_KINE_EMAIL || '';
const SECRET = process.env.E2E_TEST_SECRET || '';

export type PlanType = 'DECLIC' | 'PRATIQUE' | 'PIONNIER' | 'EXPERT' | null;

// Force le plan du kiné de test via la route backend dev-only.
export async function setPlan(planType: PlanType, cancelStripeSub = true) {
  if (!EMAIL) throw new Error('E2E_KINE_EMAIL manquant dans frontend/.env.e2e');

  const ctx = await request.newContext();
  const res = await ctx.post(`${API_URL}/api/test/set-plan`, {
    headers: SECRET ? { 'x-e2e-secret': SECRET } : {},
    data: { email: EMAIL, planType, cancelStripeSub },
  });
  const ok = res.ok();
  const bodyText = await res.text();
  await ctx.dispose();

  if (!ok) {
    throw new Error(`set-plan a échoué (${res.status()}): ${bodyText}`);
  }
  return JSON.parse(bodyText) as { success: boolean; planType: string | null };
}
```

- [ ] **Step 2 : Créer `frontend/e2e/fixtures/cards.ts`**

```ts
// Carte de test Stripe (mode test uniquement). Ne déclenche pas de 3DS.
export const TEST_CARD = {
  number: '4242 4242 4242 4242',
  expiry: '12 / 34',
  cvc: '123',
  name: 'Test Kine E2E',
  postalCode: '75001',
};
```

- [ ] **Step 3 : Créer `frontend/e2e/pages/PaywallModal.ts`**

```ts
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
```

- [ ] **Step 4 : Créer `frontend/e2e/pages/StripeCheckoutPage.ts`**

```ts
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
```

- [ ] **Step 5 : Créer `frontend/e2e/pages/SuccessPage.ts`**

```ts
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
```

- [ ] **Step 6 : Vérifier le câblage du reset (backend lancé)**

Créer `frontend/e2e/tests/reset-smoke.spec.ts` :
```ts
import { test, expect } from '@playwright/test';
import { setPlan } from '../fixtures/reset';

test('setPlan EXPERT répond success', async () => {
  const res = await setPlan('EXPERT', true);
  expect(res.success).toBe(true);
  expect(res.planType).toBe('EXPERT');
});
```
Run :
```powershell
npx playwright test tests/reset-smoke.spec.ts
```
Expected : PASS, le compte de test repasse en EXPERT.

- [ ] **Step 7 : Supprimer le smoke temporaire**

```powershell
Remove-Item e2e\tests\reset-smoke.spec.ts
```

- [ ] **Step 8 : Vérifier la compilation TypeScript des fichiers e2e**

Run :
```powershell
npx tsc --noEmit -p tsconfig.json
```
Expected : pas d'erreur sur les fichiers `e2e/`. (Si `tsconfig.json` exclut `e2e`, vérifier au minimum via `npx playwright test --list` sans erreur.)

- [ ] **Step 9 : Commit**

```powershell
git add frontend/e2e/fixtures frontend/e2e/pages
git commit -m "test(e2e): fixtures reset/carte + Page Objects (paywall, checkout, success)`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Test central — flow abonnement complet

**Files:**
- Create: `frontend/e2e/tests/subscription.spec.ts`

**Interfaces:**
- Consumes: `setPlan` (`fixtures/reset.ts`), `PaywallModal`, `StripeCheckoutPage`, `SuccessPage` (Task 4) ; storageState (Task 3).

- [ ] **Step 1 : S'assurer que l'environnement runtime tourne**

4 terminaux :
```powershell
docker compose up -d
cd backend; node index.js
cd frontend; npm run dev
stripe listen --forward-to localhost:3000/webhook/stripe
```
Vérifier que le `whsec_...` affiché par `stripe listen` correspond au `STRIPE_ENDPOINT_SECRET` du `.env` backend local.

- [ ] **Step 2 : Écrire `frontend/e2e/tests/subscription.spec.ts`**

```ts
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
```

- [ ] **Step 3 : Lancer le test en mode visible**

Run :
```powershell
npm run e2e:headed
```
Expected : le navigateur déroule login (déjà en cache) → paywall → Checkout Stripe → carte 4242 → page success → « Plan Pratique » + « Actif ». Test vert.

- [ ] **Step 4 : Si le remplissage Stripe échoue, ajuster les sélecteurs**

Observer le navigateur (slowMo actif) à l'étape Checkout. Si un champ n'est pas trouvé, inspecter la page Stripe et corriger les sélecteurs dans `StripeCheckoutPage.ts` (alternatives : `getByPlaceholder`, `getByLabel`). Relancer `npm run e2e:headed` jusqu'au vert. Surveiller le terminal `stripe listen` : un event `checkout.session.completed` / `customer.subscription.*` doit être forwarder vers localhost.

- [ ] **Step 5 : Vérifier la répétabilité (2 runs consécutifs)**

Run deux fois de suite :
```powershell
npm run e2e:headed
npm run e2e:headed
```
Expected : vert les deux fois (le `beforeAll` remet l'état propre à chaque run). Après la suite, le compte de test est en EXPERT.

- [ ] **Step 6 : Commit**

```powershell
git add frontend/e2e/tests/subscription.spec.ts
git commit -m "test(e2e): flow abonnement Stripe complet (paywall → checkout → webhook)`n`nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes d'exécution

- **Raffinement vs spec** : l'endpoint test-only est gardé par `NODE_ENV !== 'production'` + lookup par **email** (et secret optionnel), au lieu de `authenticate` sur le kiné connecté. Raison : permettre au setup/teardown Playwright d'appeler le reset sans jongler avec un token Firebase. Comportement fonctionnel identique côté flow.
- **Sélecteurs Stripe** = la seule partie réellement fragile (page hébergée tierce). Tout le reste est ancré sur des sélecteurs vérifiés dans le code du repo.
- **Caveat assumé** : après la suite, le compte est `EXPERT` en DB sans abonnement Stripe réel (test mode). `useSubscription` lit le plan en DB → l'expérience dev reste EXPERT.

## Suite (hors de ce plan)

Une fois la suite verte : maintenance du versioning Stripe (montée de version d'API Stripe), en s'appuyant sur cette e2e comme garde-fou de non-régression.
