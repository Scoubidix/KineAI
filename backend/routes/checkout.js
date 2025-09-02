const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/authenticate');
const StripeService = require('../services/StripeService');

const prisma = new PrismaClient();

// POST /api/stripe/create-checkout - Créer une session de checkout Stripe
router.post('/create-checkout', authenticate, async (req, res) => {
  try {
    const { planType, successUrl, cancelUrl } = req.body;
    
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;

    // Validation des paramètres
    if (!planType) {
      return res.status(400).json({ error: 'planType requis' });
    }

    if (!['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'].includes(planType)) {
      return res.status(400).json({ error: 'planType invalide' });
    }

    // URLs par défaut si non fournies
    const defaultSuccessUrl = successUrl || `${process.env.FRONTEND_URL}/dashboard/kine/upgrade/success?upgrade=success`;
    const defaultCancelUrl = cancelUrl || `${process.env.FRONTEND_URL}/dashboard/kine?upgrade=cancel`;

    try {
      // Créer la session via le service Stripe
      const session = await StripeService.createCheckoutSession(
        kineId,
        planType,
        defaultSuccessUrl,
        defaultCancelUrl
      );

      res.json({
        url: session.url,
        sessionId: session.id
      });

    } catch (stripeError) {
      console.error('Erreur Stripe checkout:', stripeError);
      
      // Messages d'erreur spécifiques
      if (stripeError.message.includes('Plan Pionnier')) {
        return res.status(400).json({ 
          error: 'Plan Pionnier non disponible',
          details: stripeError.message 
        });
      }

      if (stripeError.message.includes('limite')) {
        return res.status(400).json({ 
          error: 'Limite atteinte',
          details: stripeError.message 
        });
      }

      // Erreur générique
      return res.status(400).json({ 
        error: 'Erreur lors de la création de la session',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur create-checkout:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/stripe/create-portal - Créer une session de portail client Stripe
router.post('/create-portal', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;
    const { returnUrl } = req.body;

    // URL de retour par défaut
    const defaultReturnUrl = returnUrl || `${process.env.FRONTEND_URL}/dashboard/kine`;

    try {
      const session = await StripeService.createPortalSession(kineId, defaultReturnUrl);

      res.json({
        url: session.url
      });

    } catch (stripeError) {
      console.error('Erreur Stripe portal:', stripeError);
      return res.status(400).json({ 
        error: 'Erreur lors de la création du portail',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur create-portal:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/stripe/change-plan - Changer de plan pour un abonnement existant
router.post('/change-plan', authenticate, async (req, res) => {
  try {
    const { newPlanType } = req.body;
    
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;

    // Validation
    if (!newPlanType) {
      return res.status(400).json({ error: 'newPlanType requis' });
    }

    if (!['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'].includes(newPlanType)) {
      return res.status(400).json({ error: 'newPlanType invalide' });
    }

    try {
      const result = await StripeService.changePlan(kineId, newPlanType);

      res.json({
        success: true,
        subscription: result.subscription,
        newPlan: newPlanType,
        effectiveDate: result.effectiveDate
      });

    } catch (stripeError) {
      console.error('Erreur changement plan:', stripeError);
      
      if (stripeError.message.includes('Plan Pionnier')) {
        return res.status(400).json({ 
          error: 'Plan Pionnier non disponible',
          details: stripeError.message 
        });
      }

      return res.status(400).json({ 
        error: 'Erreur lors du changement de plan',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur change-plan:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/stripe/subscription/:subscriptionId - Récupérer les détails d'un abonnement
router.get('/subscription/:subscriptionId', authenticate, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, subscriptionId: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    // Vérifier que l'abonnement appartient au kiné connecté
    if (kine.subscriptionId !== subscriptionId) {
      return res.status(403).json({ error: 'Accès non autorisé à cet abonnement' });
    }

    try {
      const subscription = await StripeService.getSubscription(subscriptionId);

      res.json({
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
          items: subscription.items.data.map(item => ({
            priceId: item.price.id,
            productId: item.price.product,
            quantity: item.quantity
          }))
        }
      });

    } catch (stripeError) {
      console.error('Erreur récupération abonnement:', stripeError);
      return res.status(400).json({ 
        error: 'Erreur lors de la récupération de l\'abonnement',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur get subscription:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/stripe/cancel-subscription - Annuler un abonnement
router.post('/cancel-subscription', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;
    const { cancelAtPeriodEnd = true } = req.body;

    try {
      const result = await StripeService.cancelSubscription(kineId, cancelAtPeriodEnd);

      res.json({
        success: true,
        subscription: result,
        cancelAtPeriodEnd,
        message: cancelAtPeriodEnd 
          ? 'Abonnement sera annulé à la fin de la période de facturation'
          : 'Abonnement annulé immédiatement'
      });

    } catch (stripeError) {
      console.error('Erreur annulation abonnement:', stripeError);
      return res.status(400).json({ 
        error: 'Erreur lors de l\'annulation',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur cancel subscription:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/stripe/reactivate-subscription - Réactiver un abonnement annulé
router.post('/reactivate-subscription', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;

    try {
      const result = await StripeService.reactivateSubscription(kineId);

      res.json({
        success: true,
        subscription: result,
        message: 'Abonnement réactivé avec succès'
      });

    } catch (stripeError) {
      console.error('Erreur réactivation abonnement:', stripeError);
      return res.status(400).json({ 
        error: 'Erreur lors de la réactivation',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur reactivate subscription:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/stripe/invoices - Récupérer les factures du client
router.get('/invoices', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    const kineId = kine.id;
    const { limit = 10 } = req.query;

    try {
      const invoices = await StripeService.getCustomerInvoices(kineId, parseInt(limit));

      const formattedInvoices = invoices.data.map(invoice => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountPaid: invoice.amount_paid / 100, // Convertir en euros
        amountDue: invoice.amount_due / 100,
        currency: invoice.currency,
        created: new Date(invoice.created * 1000),
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url,
        description: invoice.description,
        lines: invoice.lines.data.map(line => ({
          description: line.description,
          amount: line.amount / 100,
          quantity: line.quantity
        }))
      }));

      res.json({
        invoices: formattedInvoices,
        hasMore: invoices.has_more,
        totalCount: invoices.data.length
      });

    } catch (stripeError) {
      console.error('Erreur récupération factures:', stripeError);
      return res.status(400).json({ 
        error: 'Erreur lors de la récupération des factures',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur get invoices:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/stripe/refresh-subscription-dates - Forcer la mise à jour des dates depuis Stripe
router.post('/refresh-subscription-dates', authenticate, async (req, res) => {
  try {
    // Récupérer le kiné via son UID Firebase
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid },
      select: { id: true, subscriptionId: true }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kinésithérapeute non trouvé' });
    }

    if (!kine.subscriptionId) {
      return res.status(400).json({ error: 'Aucun abonnement actif trouvé' });
    }

    try {
      // Récupérer les vraies données depuis Stripe
      const subscription = await StripeService.getSubscription(kine.subscriptionId);
      
      // Mettre à jour en base avec les vraies dates
      const updateData = {};
      
      if (subscription.current_period_start) {
        updateData.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
      }
      
      if (subscription.current_period_end) {
        updateData.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.kine.update({
          where: { id: kine.id },
          data: updateData
        });

        console.log(`✅ Dates d'abonnement mises à jour pour kiné ${kine.id}:`, {
          start: updateData.subscriptionStartDate?.toISOString(),
          end: updateData.subscriptionEndDate?.toISOString()
        });
      }

      res.json({
        success: true,
        message: 'Dates d\'abonnement mises à jour',
        dates: {
          startDate: updateData.subscriptionStartDate,
          endDate: updateData.subscriptionEndDate
        }
      });

    } catch (stripeError) {
      console.error('Erreur récupération abonnement Stripe:', stripeError);
      return res.status(400).json({ 
        error: 'Erreur lors de la récupération des données Stripe',
        details: stripeError.message 
      });
    }

  } catch (error) {
    console.error('Erreur refresh-subscription-dates:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;