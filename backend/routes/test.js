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

  // Quand on annule l'abonnement, on détache subscriptionId/subscriptionStatus EN BASE
  // AVANT l'annulation Stripe. Sinon le webhook customer.subscription.deleted qui suit
  // retrouve le kiné par subscriptionId (handleSubscriptionDeleted) et écrase planType
  // vers FREE — ce qui annulerait le restore EXPERT du afterAll. En détachant d'abord,
  // le webhook ne matche plus aucun kiné et le planType cible (EXPERT/FREE) tient.
  const subToCancel = cancelStripeSub ? kine.subscriptionId : null;

  const data = cancelStripeSub
    ? { planType, subscriptionId: null, subscriptionStatus: null }
    : { planType };

  const updated = await prisma.kine.update({ where: { email }, data });

  if (subToCancel) {
    try {
      await StripeService.stripe.subscriptions.cancel(subToCancel);
    } catch (err) {
      logger.warn('[test/set-plan] annulation Stripe ignorée:', err.message);
    }
  }

  return res.json({ success: true, planType: updated.planType });
});

// POST /api/test/clock/create-subscription — crée un abo sur un Test Clock et le lie au kiné.
router.post('/clock/create-subscription', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ success: false, error: 'email requis', code: 'BAD_REQUEST' });
  }

  const kine = await prisma.kine.findUnique({ where: { email } });
  if (!kine) {
    return res.status(404).json({ success: false, error: 'Kiné non trouvé', code: 'NOT_FOUND' });
  }

  const stripe = StripeService.stripe;
  const now = Math.floor(Date.now() / 1000);

  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now });
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    email,
    metadata: { kineId: String(kine.id) },
  });
  const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: process.env.STRIPE_PRICE_PRATIQUE }],
    default_payment_method: paymentMethod.id,
  });

  await prisma.kine.update({
    where: { email },
    data: { subscriptionId: subscription.id, subscriptionStatus: 'ACTIVE' },
  });

  const periodEnd = subscription.items.data[0].current_period_end;
  return res.json({ clockId: clock.id, subscriptionId: subscription.id, periodEnd });
});

// POST /api/test/clock/advance — avance le Test Clock et attend qu'il repasse 'ready'.
router.post('/clock/advance', async (req, res) => {
  const { clockId, toTimestamp } = req.body || {};
  if (!clockId || !toTimestamp) {
    return res.status(400).json({ success: false, error: 'clockId et toTimestamp requis', code: 'BAD_REQUEST' });
  }
  const stripe = StripeService.stripe;
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: toTimestamp });
  const deadline = Date.now() + 30000;
  let clock = null;
  while (Date.now() < deadline) {
    clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === 'ready') {
      return res.json({ status: 'ready' });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return res.status(504).json({ success: false, error: 'Test clock pas prêt avant timeout', code: 'CLOCK_TIMEOUT' });
});

// GET /api/test/kine-subscription — lit l'état d'abonnement d'un kiné (cible de polling e2e).
router.get('/kine-subscription', async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).json({ success: false, error: 'email requis', code: 'BAD_REQUEST' });
  }
  const kine = await prisma.kine.findUnique({ where: { email } });
  if (!kine) {
    return res.status(404).json({ success: false, error: 'Kiné non trouvé', code: 'NOT_FOUND' });
  }
  return res.json({
    planType: kine.planType,
    subscriptionStatus: kine.subscriptionStatus,
    subscriptionEndDate: kine.subscriptionEndDate,
  });
});

// POST /api/test/clock/delete — détache l'abo en base puis supprime le Test Clock (cascade).
router.post('/clock/delete', async (req, res) => {
  const { clockId, email } = req.body || {};
  if (!clockId) {
    return res.status(400).json({ success: false, error: 'clockId requis', code: 'BAD_REQUEST' });
  }
  if (!email) {
    return res.status(400).json({ success: false, error: 'email requis', code: 'BAD_REQUEST' });
  }
  // Détacher EN BASE avant la suppression : la suppression du clock supprime l'abo et émet
  // customer.subscription.deleted ; en détachant d'abord, le webhook ne matche plus le kiné
  // et ne rabaisse pas son plan (même garde que set-plan).
  try {
    await prisma.kine.update({ where: { email }, data: { subscriptionId: null, subscriptionStatus: null } });
  } catch (err) {
    logger.warn('[test/clock/delete] détachement base ignoré:', err.message);
  }
  try {
    await StripeService.stripe.testHelpers.testClocks.del(clockId);
  } catch (err) {
    logger.warn('[test/clock/delete] suppression clock ignorée:', err.message);
  }
  return res.json({ success: true });
});

module.exports = router;
