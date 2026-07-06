jest.mock('../utils/logger', () => require('./setup').logger);

const { upsertTrialContact } = require('../services/brevoTrialService');

describe('brevoTrialService.upsertTrialContact', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, BREVO_API_KEY: 'key_test', BREVO_TRIAL_LIST_ID: '42' };
    global.fetch = jest.fn();
  });
  afterEach(() => { process.env = OLD_ENV; });

  const params = {
    email: 'kine@test.fr',
    firstName: 'Jean',
    trialStartDate: new Date('2026-07-06T10:00:00Z'),
    trialEndDate: new Date('2026-07-20T10:00:00Z'),
  };

  test('POST /v3/contacts avec liste + attributs, succès 201', async () => {
    global.fetch.mockResolvedValue({ status: 201, json: async () => ({ id: 1 }) });
    await expect(upsertTrialContact(params)).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/contacts');
    expect(opts.method).toBe('POST');
    expect(opts.headers['api-key']).toBe('key_test');
    const body = JSON.parse(opts.body);
    expect(body.email).toBe('kine@test.fr');
    expect(body.updateEnabled).toBe(true);
    expect(body.listIds).toEqual([42]);
    expect(body.attributes.PRENOM).toBe('Jean');
    expect(body.attributes.TRIAL_START_DATE).toBe('2026-07-06');
    expect(body.attributes.TRIAL_END_DATE).toBe('2026-07-20');
  });

  test('contact déjà existant mis à jour (204) → succès', async () => {
    global.fetch.mockResolvedValue({ status: 204, json: async () => null });
    await expect(upsertTrialContact(params)).resolves.toBeUndefined();
  });

  test('config manquante → throw BREVO_CONFIG_MISSING', async () => {
    delete process.env.BREVO_TRIAL_LIST_ID;
    await expect(upsertTrialContact(params)).rejects.toMatchObject({ code: 'BREVO_CONFIG_MISSING' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('erreur API 400 → throw BREVO_VALIDATION', async () => {
    global.fetch.mockResolvedValue({ status: 400, json: async () => ({ message: 'bad' }) });
    await expect(upsertTrialContact(params)).rejects.toMatchObject({ code: 'BREVO_VALIDATION' });
  });
});
