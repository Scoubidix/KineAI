// tests/tokenQuota.test.js
// B2 : tokenUsageService (compteur quotidien Europe/Paris) + middleware checkTokenQuota
jest.mock('../utils/logger', () => require('./setup').logger);
jest.mock('../services/prismaService', () => require('./setup').prismaService());

const { getMockClient } = require('./setup');
const tokenUsageService = require('../services/tokenUsageService');
const { checkTokenQuota } = require('../middleware/tokenQuota');
const { TOKEN_QUOTAS, getQuotaForPlan } = require('../config/tokenQuotas');

const prisma = getMockClient();

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// tokenUsageService
// ============================================================
describe('tokenUsageService', () => {
  test('getParisDate : date calendaire valide (minuit UTC du jour Paris)', () => {
    const date = tokenUsageService.getParisDate();

    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date.getTime())).toBe(false);
    // Format YYYY-MM-DD : minuit UTC pile (clé calendaire stable)
    expect(date.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  test('getDailyUsage : 0 si aucune ligne du jour', async () => {
    prisma.dailyTokenUsage.findUnique.mockResolvedValue(null);

    const usage = await tokenUsageService.getDailyUsage(42);

    expect(usage).toBe(0);
    expect(prisma.dailyTokenUsage.findUnique).toHaveBeenCalledWith({
      where: { kineId_date: { kineId: 42, date: expect.any(Date) } },
    });
  });

  test('getDailyUsage : retourne le compteur existant', async () => {
    prisma.dailyTokenUsage.findUnique.mockResolvedValue({ tokensUsed: 12345 });

    expect(await tokenUsageService.getDailyUsage(42)).toBe(12345);
  });

  test('incrementDailyUsage : upsert atomique avec increment', async () => {
    prisma.dailyTokenUsage.upsert.mockResolvedValue({});

    await tokenUsageService.incrementDailyUsage(42, 1500);

    expect(prisma.dailyTokenUsage.upsert).toHaveBeenCalledWith({
      where: { kineId_date: { kineId: 42, date: expect.any(Date) } },
      update: { tokensUsed: { increment: 1500 } },
      create: { kineId: 42, date: expect.any(Date), tokensUsed: 1500 },
    });
  });

  test('incrementDailyUsage : ignore 0, null et négatif', async () => {
    await tokenUsageService.incrementDailyUsage(42, 0);
    await tokenUsageService.incrementDailyUsage(42, null);
    await tokenUsageService.incrementDailyUsage(42, -5);

    expect(prisma.dailyTokenUsage.upsert).not.toHaveBeenCalled();
  });
});

// ============================================================
// getAdminUsageStats (dashboard admin)
// ============================================================
describe('tokenUsageService.getAdminUsageStats', () => {
  test('agrège aujourd\'hui, hier, moyenne 10 jours et par plan avec coûts estimés', async () => {
    const today = tokenUsageService.getParisDate();
    const daysAgo = (n) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - n);
      return d;
    };

    prisma.dailyTokenUsage.findMany.mockResolvedValue([
      { date: daysAgo(0), tokensUsed: 10000, kine: { planType: 'PRATIQUE' } }, // aujourd'hui
      { date: daysAgo(1), tokensUsed: 50000, kine: { planType: 'PRATIQUE' } }, // hier
      { date: daysAgo(1), tokensUsed: 20000, kine: { planType: null } },       // hier, sans plan → FREE
      { date: daysAgo(5), tokensUsed: 30000, kine: { planType: 'EXPERT' } },   // il y a 5 jours
    ]);

    const stats = await tokenUsageService.getAdminUsageStats();

    // Aujourd'hui (en cours) séparé des 10 jours révolus
    expect(stats.today.totalTokens).toBe(10000);
    expect(stats.today.activeKines).toBe(1);
    expect(stats.yesterday.totalTokens).toBe(70000);
    expect(stats.yesterday.activeKines).toBe(2);

    // Moyenne 10 jours : (50000+20000+30000)/10 réparti par plan
    expect(stats.avgDailyTokens10d).toBe(10000);
    expect(stats.projectedMonthlyTokens).toBe(300000);
    expect(stats.projectedMonthlyCostEur).toBeCloseTo((300000 / 1_000_000) * 2.2, 2);

    // Par plan
    const pratique = stats.byPlan.find((p) => p.planType === 'PRATIQUE');
    expect(pratique.todayTokens).toBe(10000);
    expect(pratique.yesterdayTokens).toBe(50000);
    expect(pratique.avgDailyTokens10d).toBe(5000);
    const free = stats.byPlan.find((p) => p.planType === 'FREE');
    expect(free.yesterdayTokens).toBe(20000);

    // 10 jours révolus, zéros inclus, hier en premier
    expect(stats.daily).toHaveLength(10);
    expect(stats.daily[0].totalTokens).toBe(70000);
    expect(stats.daily[4].totalTokens).toBe(30000);
    expect(stats.daily[9].totalTokens).toBe(0);
  });
});

// ============================================================
// config tokenQuotas
// ============================================================
describe('tokenQuotas config', () => {
  test('tous les plans ont un quota défini', () => {
    ['FREE', 'DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'].forEach((plan) => {
      expect(TOKEN_QUOTAS[plan]).toBeGreaterThan(0);
    });
  });

  test('plan inconnu ou null → quota FREE', () => {
    expect(getQuotaForPlan('INCONNU')).toBe(TOKEN_QUOTAS.FREE);
    expect(getQuotaForPlan(null)).toBe(TOKEN_QUOTAS.FREE);
  });
});

// ============================================================
// middleware checkTokenQuota
// ============================================================
describe('checkTokenQuota middleware', () => {
  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('kiné introuvable → 404', async () => {
    prisma.kine.findUnique.mockResolvedValue(null);
    const res = buildRes();
    const next = jest.fn();

    await checkTokenQuota({ uid: 'uid-x' }, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('sous la limite → next() + req.kine/req.planType posés', async () => {
    prisma.kine.findUnique.mockResolvedValue({ id: 42, planType: 'PRATIQUE', subscriptionId: 'sub_mock' });
    prisma.dailyTokenUsage.findUnique.mockResolvedValue({ tokensUsed: 1000 });
    const req = { uid: 'uid-x' };
    const res = buildRes();
    const next = jest.fn();

    await checkTokenQuota(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.kine).toMatchObject({ id: 42 });
    expect(req.planType).toBe('PRATIQUE');
    expect(res.status).not.toHaveBeenCalled();
  });

  test('limite atteinte → 429 QUOTA_EXCEEDED avec usage', async () => {
    prisma.kine.findUnique.mockResolvedValue({ id: 42, planType: 'DECLIC', subscriptionId: 'sub_mock' });
    prisma.dailyTokenUsage.findUnique.mockResolvedValue({ tokensUsed: TOKEN_QUOTAS.DECLIC });
    const res = buildRes();
    const next = jest.fn();

    await checkTokenQuota({ uid: 'uid-x' }, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'QUOTA_EXCEEDED',
        planType: 'DECLIC',
        usage: { tokensUsed: TOKEN_QUOTAS.DECLIC, limit: TOKEN_QUOTAS.DECLIC, remaining: 0 },
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('planType null → traité comme FREE (10k)', async () => {
    prisma.kine.findUnique.mockResolvedValue({ id: 42, planType: null });
    prisma.dailyTokenUsage.findUnique.mockResolvedValue({ tokensUsed: TOKEN_QUOTAS.FREE });
    const res = buildRes();
    const next = jest.fn();

    await checkTokenQuota({ uid: 'uid-x' }, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ planType: 'FREE' }));
  });

  test('aucune consommation du jour → next()', async () => {
    prisma.kine.findUnique.mockResolvedValue({ id: 42, planType: 'FREE' });
    prisma.dailyTokenUsage.findUnique.mockResolvedValue(null);
    const res = buildRes();
    const next = jest.fn();

    await checkTokenQuota({ uid: 'uid-x' }, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('quota : essai actif → quota EXPERT (500k)', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    prisma.kine.findUnique.mockResolvedValue({
      id: 1, planType: 'FREE', subscriptionId: null, trialEndDate: future,
    });
    // usage bas → passe
    prisma.dailyTokenUsage.findUnique.mockResolvedValue({ tokensUsed: 1000 });
    const req = { uid: 'uid-x' };
    const res = buildRes();
    const next = jest.fn();

    await checkTokenQuota(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.planType).toBe('EXPERT');
  });
});
