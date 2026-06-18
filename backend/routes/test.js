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

  if (cancelStripeSub && kine.subscriptionId) {
    try {
      await StripeService.stripe.subscriptions.cancel(kine.subscriptionId);
    } catch (err) {
      logger.warn('[test/set-plan] annulation Stripe ignorée:', err.message);
    }
  }

  const data = planType === null
    ? { planType: null, subscriptionId: null, subscriptionStatus: null }
    : { planType };

  const updated = await prisma.kine.update({ where: { email }, data });
  return res.json({ success: true, planType: updated.planType });
});

module.exports = router;
