jest.mock('../utils/logger', () => require('./setup').logger);
jest.mock('../utils/logSanitizer', () => require('./setup').logSanitizer);
jest.mock('../firebase/firebase', () => require('./setup').firebase);
jest.mock('../services/prismaService', () => require('./setup').prismaService());

const request = require('supertest');
const { createApp, AUTH_HEADER, MOCK_KINE, MOCK_KINE_FREE, MOCK_KINE_DECLIC, MOCK_KINE_PRATIQUE } = require('./helpers');
const prismaService = require('../services/prismaService');
const mockPrisma = prismaService.__mockClient;

let app;

beforeEach(() => {
  jest.clearAllMocks();
  app = createApp();
  const { authenticate } = require('../middleware/authenticate');
  const { requireAssistant, requireAssistantOrPreview, canCreateProgramme, requireAdmin } = require('../middleware/authorization');

  app.get('/test-administratif', authenticate, requireAssistant('ADMINISTRATIF'), (req, res) => res.json({ access: true, plan: req.planType }));
  app.get('/test-templates', authenticate, requireAssistant('TEMPLATES_ADMIN'), (req, res) => res.json({ access: true }));
  app.get('/test-preview', authenticate, requireAssistantOrPreview('ADMINISTRATIF'), (req, res) => res.json({ access: true, isPreview: req.isPreview }));
  app.get('/test-create-programme', authenticate, canCreateProgramme, (req, res) => res.json({ access: true }));
  app.get('/test-admin', authenticate, requireAdmin, (req, res) => res.json({ access: true, isAdmin: req.isAdmin }));
});

describe('Authorization — Paywall par plan', () => {
  test('Plan EXPERT → accès ADMINISTRATIF autorisé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    const res = await request(app).get('/test-administratif').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.access).toBe(true);
  });

  test('Plan PRATIQUE → accès ADMINISTRATIF autorisé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_PRATIQUE);
    const res = await request(app).get('/test-administratif').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.access).toBe(true);
  });

  test('Plan FREE → accès ADMINISTRATIF refusé (403)', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_FREE);
    const res = await request(app).get('/test-administratif').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ASSISTANT_NOT_ALLOWED');
  });

  test('Plan DECLIC → accès ADMINISTRATIF refusé, recommande PRATIQUE', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_DECLIC);
    const res = await request(app).get('/test-administratif').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.recommendedPlan).toBe('PRATIQUE');
  });

  test('Plan PRATIQUE → accès TEMPLATES refusé, recommande PIONNIER', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_PRATIQUE);
    const res = await request(app).get('/test-templates').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.recommendedPlan).toBe('PIONNIER');
  });

  test('Plan DECLIC → accès TEMPLATES refusé, recommande PIONNIER', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_DECLIC);
    const res = await request(app).get('/test-templates').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.recommendedPlan).toBe('PIONNIER');
  });

  test('Preview mode — plan FREE accède en mode preview', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_FREE);
    const res = await request(app).get('/test-preview').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.isPreview).toBe(true);
  });

  test('Preview mode — plan EXPERT accède en mode complet', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    const res = await request(app).get('/test-preview').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.isPreview).toBe(false);
  });
});

describe('Authorization — canCreateProgramme', () => {
  test('Plan FREE → 403, création interdite', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_FREE);
    const res = await request(app).get('/test-create-programme').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_REQUIRED');
  });

  test('Plan DECLIC + 0 programme → autorisé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_DECLIC);
    mockPrisma.programme.count.mockResolvedValue(0);
    const res = await request(app).get('/test-create-programme').set(AUTH_HEADER);
    expect(res.status).toBe(200);
  });

  test('Plan DECLIC + 1 programme → 403, limite atteinte', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE_DECLIC);
    mockPrisma.programme.count.mockResolvedValue(1);
    const res = await request(app).get('/test-create-programme').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROGRAMME_LIMIT_REACHED');
  });

  test('Plan EXPERT → toujours autorisé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    const res = await request(app).get('/test-create-programme').set(AUTH_HEADER);
    expect(res.status).toBe(200);
  });
});

describe('Essai gratuit — plan effectif dans le gating', () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  test('canCreateProgramme : essai actif → traité comme illimité (EXPERT)', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({
      id: 1, planType: 'FREE', subscriptionId: null, trialEndDate: future,
    });
    mockPrisma.programme.count.mockResolvedValue(0);
    const res = await request(app).get('/test-create-programme').set(AUTH_HEADER);
    expect(res.status).toBe(200); // autorisé, pas de blocage FREE
  });

  test('requireAssistant ADMINISTRATIF : essai actif → autorisé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({
      id: 1, planType: 'FREE', subscriptionId: null, trialEndDate: future,
    });
    const res = await request(app).get('/test-administratif').set(AUTH_HEADER);
    expect(res.status).toBe(200);
  });

  test('requireAssistant ADMINISTRATIF : essai expiré → 403', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockPrisma.kine.findUnique.mockResolvedValue({
      id: 1, planType: 'FREE', subscriptionId: null, trialEndDate: past,
    });
    const res = await request(app).get('/test-administratif').set(AUTH_HEADER);
    expect(res.status).toBe(403);
  });
});

describe('Authorization — requireAdmin', () => {
  test('Email admin → accès accordé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({ ...MOCK_KINE, email: 'admin@test.fr' });
    const res = await request(app).get('/test-admin').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  test('Email non-admin → 403', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    const res = await request(app).get('/test-admin').set(AUTH_HEADER);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_ACCESS_REQUIRED');
  });
});
