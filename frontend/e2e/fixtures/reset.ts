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
