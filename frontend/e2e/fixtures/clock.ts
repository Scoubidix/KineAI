import { request } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3000';
const SECRET = process.env.E2E_TEST_SECRET || '';

function headers(): Record<string, string> | undefined {
  return SECRET ? { 'x-e2e-secret': SECRET } : undefined;
}

async function post(path: string, data: unknown) {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API_URL}${path}`, { headers: headers(), data });
  const ok = res.ok();
  const body = await res.text();
  await ctx.dispose();
  if (!ok) throw new Error(`${path} a échoué (${res.status()}): ${body}`);
  return body ? JSON.parse(body) : {};
}

export async function createClockSubscription(email: string) {
  return post('/api/test/clock/create-subscription', { email }) as Promise<{
    clockId: string;
    subscriptionId: string;
    periodEnd: number;
  }>;
}

export async function advanceClock(clockId: string, toTimestamp: number): Promise<void> {
  await post('/api/test/clock/advance', { clockId, toTimestamp });
}

export async function deleteClock(clockId: string, email: string): Promise<void> {
  await post('/api/test/clock/delete', { clockId, email });
}

export async function getKineSubscription(email: string) {
  const ctx = await request.newContext();
  const res = await ctx.get(`${API_URL}/api/test/kine-subscription`, {
    headers: headers(),
    params: { email },
  });
  const ok = res.ok();
  const body = await res.text();
  await ctx.dispose();
  if (!ok) throw new Error(`kine-subscription a échoué (${res.status()}): ${body}`);
  return JSON.parse(body) as {
    planType: string | null;
    subscriptionStatus: string | null;
    subscriptionEndDate: string | null;
  };
}

export async function pollUntil<T>(
  fetchFn: () => Promise<T>,
  predicate: (v: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fetchFn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
  throw new Error(`pollUntil: condition non atteinte après ${timeoutMs}ms (dernier: ${JSON.stringify(last!)})`);
}
