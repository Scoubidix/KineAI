import { request } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_KINE_EMAIL || '';
const SECRET = process.env.E2E_TEST_SECRET || '';

export type PlanType = 'DECLIC' | 'PRATIQUE' | 'PIONNIER' | 'EXPERT' | null;

// Force le plan du kiné de test via la route backend dev-only.
// hasHadTrial (optionnel) : false → simule un nouveau kiné éligible à l'essai ;
// true → simule un ré-abonné (checkout sans essai, prélèvement immédiat).
export async function setPlan(planType: PlanType, cancelStripeSub = true, hasHadTrial?: boolean) {
  if (!EMAIL) throw new Error('E2E_KINE_EMAIL manquant dans frontend/.env.e2e');

  const ctx = await request.newContext();
  const res = await ctx.post(`${API_URL}/api/test/set-plan`, {
    headers: SECRET ? { 'x-e2e-secret': SECRET } : {},
    data: { email: EMAIL, planType, cancelStripeSub, ...(typeof hasHadTrial === 'boolean' ? { hasHadTrial } : {}) },
  });
  const ok = res.ok();
  const bodyText = await res.text();
  await ctx.dispose();

  if (!ok) {
    throw new Error(`set-plan a échoué (${res.status()}): ${bodyText}`);
  }
  return JSON.parse(bodyText) as { success: boolean; planType: string | null };
}

// Lit l'état d'abonnement du kiné de test (plan, statut, hasHadTrial) via la route dev-only.
export async function getKineState() {
  if (!EMAIL) throw new Error('E2E_KINE_EMAIL manquant dans frontend/.env.e2e');

  const ctx = await request.newContext();
  const res = await ctx.get(`${API_URL}/api/test/kine-subscription`, {
    headers: SECRET ? { 'x-e2e-secret': SECRET } : {},
    params: { email: EMAIL },
  });
  const ok = res.ok();
  const bodyText = await res.text();
  await ctx.dispose();

  if (!ok) {
    throw new Error(`kine-subscription a échoué (${res.status()}): ${bodyText}`);
  }
  return JSON.parse(bodyText) as {
    planType: string | null;
    subscriptionStatus: string | null;
    subscriptionEndDate: string | null;
    hasHadTrial: boolean;
  };
}
