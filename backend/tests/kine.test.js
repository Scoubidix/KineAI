jest.mock('../utils/logger', () => require('./setup').logger);
jest.mock('../utils/logSanitizer', () => require('./setup').logSanitizer);
jest.mock('../firebase/firebase', () => require('./setup').firebase);
jest.mock('../services/prismaService', () => require('./setup').prismaService());
jest.mock('../services/StripeService', () => ({
  stripe: { customers: { update: jest.fn().mockResolvedValue({}) } },
}));
jest.mock('../services/trialService', () => ({ startTrial: jest.fn().mockResolvedValue({ trialEndDate: new Date() }) }));

const request = require('supertest');
const { createApp, AUTH_HEADER, MOCK_KINE } = require('./helpers');
const prismaService = require('../services/prismaService');
const LEGAL_VERSIONS = require('../config/legalVersions');
const mockPrisma = prismaService.__mockClient;

let app;

beforeEach(() => {
  jest.clearAllMocks();
  app = createApp();
  app.use('/kine', require('../routes/kines'));
});

describe('Kiné API', () => {
  test('POST /kine → 201, crée un nouveau kiné sans firstName/lastName', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(null);
    mockPrisma.kine.create.mockResolvedValue({ id: 10, uid: 'new-uid', email: 'nouveau@kine.fr', firstName: null, lastName: null });

    const res = await request(app)
      .post('/kine')
      .send({ uid: 'new-uid', email: 'nouveau@kine.fr', acceptedLegalAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    // Vérifie que le contrôleur remplit lui-même les versions depuis LEGAL_VERSIONS
    const createArgs = mockPrisma.kine.create.mock.calls[0][0];
    expect(createArgs.data.firstName).toBeUndefined();
    expect(createArgs.data.lastName).toBeUndefined();
    expect(createArgs.data.cguVersion).toBe(LEGAL_VERSIONS.CGU);
    expect(createArgs.data.politiqueConfidentialiteVersion).toBe(LEGAL_VERSIONS.POLITIQUE_CONFIDENTIALITE);
    expect(createArgs.data.acceptedCguAt).toBeInstanceOf(Date);
  });

  test('POST /kine → 409 si UID déjà existant', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);

    const res = await request(app)
      .post('/kine')
      .send({ uid: MOCK_KINE.uid, email: MOCK_KINE.email, acceptedLegalAt: new Date().toISOString() });
    expect(res.status).toBe(409);
  });

  test('POST /kine → 201 silencieux si honeypot rempli (bot)', async () => {
    const res = await request(app)
      .post('/kine')
      .send({ uid: 'bot', email: 'bot@x.fr', website: 'spam.com' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(0);
  });

  test('GET /kine/profile → 200, retourne le profil', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({
      ...MOCK_KINE,
      patients: [{ id: 1, firstName: 'Marie', lastName: 'Martin' }],
      _count: { patients: 1, exercicesModeles: 5 },
    });

    const res = await request(app).get('/kine/profile').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Jean');
  });

  test('GET /kine/profile → 404 si kiné inexistant', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/kine/profile').set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  test('PUT /kine/profile → 200, met à jour le profil', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    mockPrisma.kine.update.mockResolvedValue({ ...MOCK_KINE, phone: '0699999999' });

    const res = await request(app).put('/kine/profile').set(AUTH_HEADER).send({ phone: '0699999999' });
    expect(res.status).toBe(200);
    expect(res.body.kine.phone).toBe('0699999999');
  });

  test('PUT /kine/profile → 400 si email invalide', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    const res = await request(app).put('/kine/profile').set(AUTH_HEADER).send({ email: 'pas-un-email' });
    expect(res.status).toBe(400);
  });

  test('PUT /kine/profile → 200, normalise firstName (Capitalize) et lastName (UPPERCASE)', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    mockPrisma.kine.update.mockResolvedValue({
      ...MOCK_KINE,
      firstName: 'Valentin',
      lastName: 'DUPONT',
      stripeCustomerId: null,
    });

    const res = await request(app)
      .put('/kine/profile')
      .set(AUTH_HEADER)
      .send({ firstName: 'valentin', lastName: 'dupont' });

    expect(res.status).toBe(200);

    const updateArgs = mockPrisma.kine.update.mock.calls[0][0];
    expect(updateArgs.data.firstName).toBe('Valentin');
    expect(updateArgs.data.lastName).toBe('DUPONT');
  });

  test('PUT /kine/profile → 400 si firstName vide (espaces seuls)', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(MOCK_KINE);
    const res = await request(app)
      .put('/kine/profile')
      .set(AUTH_HEADER)
      .send({ firstName: '   ' });
    // Zod trimmedString trim puis applique min(1) — "   " devient "" et est rejeté.
    expect(res.status).toBe(400);
  });

  test('PUT /kine/profile → 200 même si nom/prénom change et stripeCustomerId présent (sync non-bloquant)', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({ ...MOCK_KINE, stripeCustomerId: 'cus_123' });
    mockPrisma.kine.update.mockResolvedValue({
      ...MOCK_KINE,
      firstName: 'Valentin',
      lastName: 'DUPONT',
      stripeCustomerId: 'cus_123',
    });

    const res = await request(app)
      .put('/kine/profile')
      .set(AUTH_HEADER)
      .send({ firstName: 'valentin', lastName: 'dupont' });

    expect(res.status).toBe(200);
    expect(res.body.kine.firstName).toBe('Valentin');
    expect(res.body.kine.lastName).toBe('DUPONT');
  });

  const trialService = require('../services/trialService');

  test('POST /kine → démarre l\'essai pour le nouveau kiné', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(null); // pas d'existant
    mockPrisma.kine.create.mockResolvedValue({ id: 77, uid: 'new-uid', email: 'new@kine.fr' });

    const res = await request(app).post('/kine').set(AUTH_HEADER).send({
      uid: 'new-uid', email: 'new@kine.fr', acceptedLegalAt: new Date().toISOString(),
    });

    expect(res.status).toBe(201);
    expect(trialService.startTrial).toHaveBeenCalledWith(77);
  });

  test('POST /kine → échec startTrial n\'empêche pas la création (201)', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(null);
    mockPrisma.kine.create.mockResolvedValue({ id: 78, uid: 'u2', email: 'u2@kine.fr' });
    trialService.startTrial.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/kine').set(AUTH_HEADER).send({
      uid: 'u2', email: 'u2@kine.fr', acceptedLegalAt: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
  });
});
