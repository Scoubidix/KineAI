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
