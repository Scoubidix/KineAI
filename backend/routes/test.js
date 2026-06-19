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

module.exports = router;
