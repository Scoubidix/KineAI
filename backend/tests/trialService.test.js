jest.mock('../utils/logger', () => require('./setup').logger);
jest.mock('../services/prismaService', () => require('./setup').prismaService());
jest.mock('../services/brevoTrialService', () => ({
  upsertTrialContact: jest.fn().mockResolvedValue(undefined),
}));

const prismaService = require('../services/prismaService');
const mockPrisma = prismaService.__mockClient;
const brevoTrialService = require('../services/brevoTrialService');
const { startTrial } = require('../services/trialService');

const ELIGIBLE = { id: 1, email: 'kine@test.fr', firstName: 'Jean', trialEndDate: null, stripeCustomerId: null };

beforeEach(() => { jest.clearAllMocks(); });

describe('trialService.startTrial', () => {
  test('kiné éligible → pose trialEndDate (+14j) et TRIALING, sync Brevo', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(ELIGIBLE);
    mockPrisma.kine.update.mockResolvedValue({});
    const now = new Date('2026-07-06T00:00:00Z');

    const result = await startTrial(1, now);

    const expectedEnd = new Date('2026-07-20T00:00:00Z');
    expect(result.trialEndDate.getTime()).toBe(expectedEnd.getTime());
    expect(mockPrisma.kine.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { trialEndDate: expectedEnd, subscriptionStatus: 'TRIALING' },
    });
    expect(brevoTrialService.upsertTrialContact).toHaveBeenCalledWith(expect.objectContaining({
      email: 'kine@test.fr', firstName: 'Jean', trialEndDate: expectedEnd,
    }));
  });

  test('kiné introuvable → throw KINE_NOT_FOUND', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(null);
    await expect(startTrial(999)).rejects.toMatchObject({ code: 'KINE_NOT_FOUND' });
    expect(mockPrisma.kine.update).not.toHaveBeenCalled();
  });

  test('déjà eu un essai → throw TRIAL_NOT_ELIGIBLE', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({ ...ELIGIBLE, trialEndDate: new Date('2020-01-01') });
    await expect(startTrial(1)).rejects.toMatchObject({ code: 'TRIAL_NOT_ELIGIBLE' });
    expect(mockPrisma.kine.update).not.toHaveBeenCalled();
  });

  test('a un client Stripe → throw TRIAL_NOT_ELIGIBLE', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue({ ...ELIGIBLE, stripeCustomerId: 'cus_1' });
    await expect(startTrial(1)).rejects.toMatchObject({ code: 'TRIAL_NOT_ELIGIBLE' });
  });

  test('échec Brevo → NON bloquant, l\'essai reste posé', async () => {
    mockPrisma.kine.findUnique.mockResolvedValue(ELIGIBLE);
    mockPrisma.kine.update.mockResolvedValue({});
    brevoTrialService.upsertTrialContact.mockRejectedValue(new Error('brevo down'));

    await expect(startTrial(1, new Date('2026-07-06T00:00:00Z'))).resolves.toMatchObject({
      trialEndDate: new Date('2026-07-20T00:00:00Z'),
    });
    expect(mockPrisma.kine.update).toHaveBeenCalled();
  });
});
