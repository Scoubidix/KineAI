// routes/webhook/stripe.js
// Route pour traiter les webhooks Stripe

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const stripeService = require('../../services/StripeService');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware pour récupérer le raw body (nécessaire pour Stripe)
router.use('/stripe', express.raw({ type: 'application/json' }));

// Route webhook Stripe
router.post('/stripe', async (req, res) => {
  const signature = req.get('stripe-signature');
  
  try {
    // Valider le webhook avec Stripe
    const event = stripeService.validateWebhook(req.body, signature);
    
    console.log(`🎯 Webhook Stripe reçu: ${event.type}`);
    
    // Traiter l'événement selon son type
    switch (event.type) {
      // ⭐ PLUS IMPORTANT : Première création d'abonnement
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        console.log(`Type d'événement non géré: ${event.type}`);
    }
    
    // Répondre à Stripe que tout s'est bien passé
    res.json({ received: true });
    
  } catch (error) {
    console.error('❌ Erreur webhook Stripe:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// ========== HANDLERS POUR CHAQUE TYPE D'ÉVÉNEMENT ==========

/**
 * 🎯 PLUS IMPORTANT : Gestion checkout session completed
 * C'est ici que tout commence après un paiement réussi !
 */
async function handleCheckoutCompleted(session) {
  try {
    console.log('✅ Checkout completed:', session.id);
    
    // Récupérer les métadonnées du checkout
    const kineId = parseInt(session.metadata?.kineId);
    const planType = session.metadata?.planType;
    
    if (!kineId || !planType) {
      console.error('❌ Métadonnées manquantes dans checkout:', session.metadata);
      return;
    }

    // Récupérer le kiné
    const kine = await prisma.kine.findUnique({
      where: { id: kineId }
    });

    if (!kine) {
      console.error('❌ Kiné non trouvé:', kineId);
      return;
    }

    // Si c'est un abonnement (mode subscription)
    if (session.mode === 'subscription' && session.subscription) {
      
      // Mettre à jour le kiné avec les infos Stripe
      await prisma.kine.update({
        where: { id: kineId },
        data: {
          stripeCustomerId: session.customer,
          subscriptionId: session.subscription,
          planType: planType,
          subscriptionStatus: 'ACTIVE', // Assumé actif après checkout réussi
          subscriptionStartDate: new Date(),
          // Note: subscriptionEndDate sera mise à jour par subscription.created
        }
      });
      
      console.log(`🎉 Kiné ${kineId} mis à jour: Plan ${planType}, Customer ${session.customer}, Subscription ${session.subscription}`);
    }
    
  } catch (error) {
    console.error('❌ Erreur handleCheckoutCompleted:', error);
  }
}

/**
 * Gestion création d'abonnement (complète les infos du checkout)
 */
async function handleSubscriptionCreated(subscription) {
  try {
    console.log('📝 Création abonnement:', subscription.id);
    
    // Récupérer le kiné via son subscription ID
    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id }
    });
    
    if (!kine) {
      console.error('❌ Kiné non trouvé pour subscription:', subscription.id);
      return;
    }
    
    // Déterminer le type de plan depuis le price ID
    const planType = stripeService.getPlanTypeFromPriceId(subscription.items.data[0].price.id);
    
    // Mettre à jour avec les dates précises de l'abonnement
    await prisma.kine.update({
      where: { id: kine.id },
      data: {
        planType: planType,
        subscriptionStatus: stripeService.mapSubscriptionStatus(subscription.status),
        subscriptionStartDate: new Date(subscription.current_period_start * 1000),
        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
        trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      }
    });
    
    console.log(`📅 Dates abonnement mises à jour pour kiné ${kine.id}: ${planType} du ${new Date(subscription.current_period_start * 1000).toLocaleDateString()} au ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}`);
    
  } catch (error) {
    console.error('❌ Erreur handleSubscriptionCreated:', error);
  }
}

/**
 * Gestion mise à jour d'abonnement
 */
async function handleSubscriptionUpdated(subscription) {
  try {
    console.log('🔄 Mise à jour abonnement:', subscription.id);
    
    // Récupérer le kiné via l'ID d'abonnement
    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id }
    });
    
    if (!kine) {
      console.error('❌ Kiné non trouvé pour subscription:', subscription.id);
      return;
    }
    
    // Déterminer le nouveau type de plan
    const planType = stripeService.getPlanTypeFromPriceId(subscription.items.data[0].price.id);
    
    // Mettre à jour les informations d'abonnement
    await prisma.kine.update({
      where: { id: kine.id },
      data: {
        planType: planType,
        subscriptionStatus: stripeService.mapSubscriptionStatus(subscription.status),
        subscriptionStartDate: new Date(subscription.current_period_start * 1000),
        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
        trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      }
    });
    
    console.log(`🔄 Abonnement mis à jour pour kiné ${kine.id}: ${planType} (${subscription.status})`);
    
  } catch (error) {
    console.error('❌ Erreur handleSubscriptionUpdated:', error);
  }
}

/**
 * Gestion suppression d'abonnement
 */
async function handleSubscriptionDeleted(subscription) {
  try {
    console.log('🗑️ Suppression abonnement:', subscription.id);
    
    // Récupérer le kiné via l'ID d'abonnement
    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id }
    });
    
    if (!kine) {
      console.error('❌ Kiné non trouvé pour subscription:', subscription.id);
      return;
    }
    
    // IMPORTANT: On garde le planType pour l'historique (surtout pour Pionnier)
    await prisma.kine.update({
      where: { id: kine.id },
      data: {
        subscriptionId: null,
        subscriptionStatus: 'CANCELED',
        subscriptionEndDate: new Date(subscription.ended_at * 1000),
        // planType: null, // ❌ NE PAS supprimer pour garder l'historique
      }
    });
    
    console.log(`🗑️ Abonnement supprimé pour kiné ${kine.id} (plan ${kine.planType} conservé en historique)`);
    
  } catch (error) {
    console.error('❌ Erreur handleSubscriptionDeleted:', error);
  }
}

/**
 * Gestion paiement réussi
 */
async function handlePaymentSucceeded(invoice) {
  try {
    console.log('💰 Paiement réussi pour invoice:', invoice.id);
    
    if (invoice.subscription) {
      // Récupérer le kiné via l'ID d'abonnement
      const kine = await prisma.kine.findFirst({
        where: { subscriptionId: invoice.subscription }
      });
      
      if (kine) {
        // S'assurer que le statut est actif après un paiement réussi
        await prisma.kine.update({
          where: { id: kine.id },
          data: {
            subscriptionStatus: 'ACTIVE'
          }
        });
        
        console.log(`✅ Statut mis à jour vers ACTIVE pour kiné ${kine.id}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur handlePaymentSucceeded:', error);
  }
}

/**
 * Gestion échec de paiement
 */
async function handlePaymentFailed(invoice) {
  try {
    console.log('❌ Échec de paiement pour invoice:', invoice.id);
    
    if (invoice.subscription) {
      // Récupérer le kiné via l'ID d'abonnement
      const kine = await prisma.kine.findFirst({
        where: { subscriptionId: invoice.subscription }
      });
      
      if (kine) {
        // Mettre le statut en impayé
        await prisma.kine.update({
          where: { id: kine.id },
          data: {
            subscriptionStatus: 'PAST_DUE'
          }
        });
        
        console.log(`⚠️ Statut mis à jour vers PAST_DUE pour kiné ${kine.id}`);
        
        // TODO: Envoyer une notification au kiné
        // TODO: Possiblement suspendre l'accès après X tentatives
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur handlePaymentFailed:', error);
  }
}

module.exports = router;