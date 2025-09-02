// routes/webhook/stripe.js
// Route pour traiter les webhooks Stripe avec gestion d'erreurs améliorée

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const stripeService = require('../../services/StripeService');
const logger = require('../../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// IPs autorisées de Stripe (liste officielle)
const STRIPE_IPS = [
  '3.18.12.63', '3.130.192.231', '13.235.14.237', '13.235.122.149',
  '18.211.135.69', '35.154.171.200', '52.15.183.38', '54.88.130.119',
  '54.88.130.237', '54.187.174.169', '54.187.205.235', '54.187.216.72'
];

/**
 * Middleware de vérification IP pour les webhooks Stripe
 */
const verifyStripeIP = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  
  // En développement, on skip la vérification IP
  if (process.env.NODE_ENV === 'development') {
    logger.warn(`🔓 Dev mode - Skipping IP verification for ${clientIP}`);
    return next();
  }
  
  // Vérifier si l'IP est dans la liste Stripe
  const isValidIP = STRIPE_IPS.some(stripeIP => clientIP.includes(stripeIP));
  
  if (!isValidIP) {
    logger.error(`🚫 Webhook rejété - IP non autorisée: ${clientIP}`);
    return res.status(403).json({ error: 'IP non autorisée' });
  }
  
  logger.warn(`✅ Webhook autorisé - IP validée: ${clientIP}`);
  next();
};

// Middleware pour récupérer le raw body (nécessaire pour Stripe)
router.use('/stripe', express.raw({ type: 'application/json' }));

// Route webhook Stripe avec sécurité renforcée
router.post('/stripe', verifyStripeIP, async (req, res) => {
  const signature = req.get('stripe-signature');
  const eventId = req.headers['stripe-event-id'] || 'unknown';
  
  logger.warn(`🎯 Webhook Stripe reçu - ID: ${eventId} - IP: ${req.ip}`);
  
  try {
    // Valider le webhook avec Stripe
    const event = stripeService.validateWebhook(req.body, signature);
    
    logger.warn(`✅ Webhook validé - Type: ${event.type} - ID: ${event.id}`);
    
    // Traiter l'événement selon son type avec gestion d'erreurs individuelle
    let handlerResult = { success: false, message: 'Handler non exécuté' };
    
    try {
      switch (event.type) {
        // ⭐ PLUS IMPORTANT : Première création d'abonnement
        case 'checkout.session.completed':
          handlerResult = await handleCheckoutCompleted(event.data.object, event.id);
          break;
          
        case 'customer.subscription.created':
          handlerResult = await handleSubscriptionCreated(event.data.object, event.id);
          break;
          
        case 'customer.subscription.updated':
          handlerResult = await handleSubscriptionUpdated(event.data.object, event.id);
          break;
          
        case 'customer.subscription.deleted':
          handlerResult = await handleSubscriptionDeleted(event.data.object, event.id);
          break;
          
        case 'invoice.payment_succeeded':
          handlerResult = await handlePaymentSucceeded(event.data.object, event.id);
          break;
          
        case 'invoice.payment_failed':
          handlerResult = await handlePaymentFailed(event.data.object, event.id);
          break;
          
        default:
          logger.info(`⚠️ Type d'événement non géré: ${event.type}`);
          handlerResult = { success: true, message: 'Événement ignoré' };
      }
      
      // Log du résultat
      if (handlerResult.success) {
        logger.warn(`✅ Handler réussi - ${event.type}: ${handlerResult.message}`);
      } else {
        logger.error(`❌ Handler échoué - ${event.type}: ${handlerResult.message}`);
      }
      
    } catch (handlerError) {
      logger.error(`💥 Erreur dans handler ${event.type}:`, handlerError.message);
      
      // On répond quand même success à Stripe pour éviter les retry infinis
      // sauf si c'est une erreur critique
      const isCriticalError = handlerError.message.includes('CRITICAL') || 
                             handlerError.message.includes('DATABASE_DOWN');
      
      if (isCriticalError) {
        return res.status(500).json({ 
          error: 'Handler failed critically', 
          eventType: event.type,
          eventId: event.id
        });
      }
    }
    
    // Répondre à Stripe que tout s'est bien passé
    res.json({ 
      received: true, 
      eventType: event.type,
      eventId: event.id,
      handlerResult: handlerResult.success
    });
    
  } catch (validationError) {
    logger.error(`🚨 Erreur validation webhook Stripe:`, validationError.message);
    
    res.status(400).json({ 
      error: 'Webhook validation failed',
      details: validationError.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== HANDLERS POUR CHAQUE TYPE D'ÉVÉNEMENT ==========

/**
 * 🎯 PLUS IMPORTANT : Gestion checkout session completed
 * C'est ici que tout commence après un paiement réussi !
 */
async function handleCheckoutCompleted(session, eventId) {
  const startTime = Date.now();
  
  try {
    logger.info(`✅ [${eventId}] Traitement checkout completed: ${session.id}`);
    
    // Validation des métadonnées critiques
    const kineId = parseInt(session.metadata?.kineId);
    const planType = session.metadata?.planType;
    
    if (!kineId || isNaN(kineId)) {
      const error = `Métadonnées invalides - kineId: ${session.metadata?.kineId}`;
      logger.error(`❌ [${eventId}] ${error}`, { metadata: session.metadata });
      return { success: false, message: error };
    }
    
    if (!planType || !['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'].includes(planType)) {
      const error = `Plan invalide: ${planType}`;
      logger.error(`❌ [${eventId}] ${error}`, { metadata: session.metadata });
      return { success: false, message: error };
    }

    // Récupérer le kiné avec retry
    let kine = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !kine) {
      try {
        kine = await prisma.kine.findUnique({
          where: { id: kineId },
          select: { id: true, email: true, firstName: true, lastName: true, planType: true }
        });
        
        if (!kine) {
          attempts++;
          if (attempts < maxAttempts) {
            logger.warn(`⚠️ [${eventId}] Kiné ${kineId} non trouvé - Tentative ${attempts}/${maxAttempts}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1s
          }
        }
      } catch (dbError) {
        attempts++;
        logger.error(`💥 [${eventId}] Erreur DB lors de la recherche kiné - Tentative ${attempts}/${maxAttempts}:`, dbError.message);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2s
        }
      }
    }

    if (!kine) {
      const error = `Kiné ${kineId} introuvable après ${maxAttempts} tentatives`;
      logger.error(`❌ [${eventId}] ${error}`);
      return { success: false, message: error };
    }

    // Vérifier le mode abonnement
    if (session.mode !== 'subscription' || !session.subscription) {
      const error = `Session non-subscription: mode=${session.mode}, subscription=${session.subscription}`;
      logger.error(`❌ [${eventId}] ${error}`);
      return { success: false, message: error };
    }

    // Mise à jour avec retry et logging détaillé
    try {
      const updateData = {
        stripeCustomerId: session.customer,
        subscriptionId: session.subscription,
        planType: planType,
        subscriptionStatus: 'ACTIVE',
        subscriptionStartDate: new Date(),
      };
      
      logger.debug(`📝 [${eventId}] Mise à jour kiné ${kineId}:`, updateData);
      
      await prisma.kine.update({
        where: { id: kineId },
        data: updateData
      });
      
      const duration = Date.now() - startTime;
      const successMessage = `Kiné ${kineId} (${kine.email}) mis à jour: ${planType} - Customer: ${session.customer} - Subscription: ${session.subscription} (${duration}ms)`;
      
      logger.info(`🎉 [${eventId}] ${successMessage}`);
      return { success: true, message: successMessage };
      
    } catch (updateError) {
      const error = `Échec mise à jour kiné ${kineId}: ${updateError.message}`;
      logger.error(`💥 [${eventId}] ${error}`, updateError);
      return { success: false, message: error };
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = `Erreur générale handleCheckoutCompleted: ${error.message} (${duration}ms)`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, {
      stack: error.stack,
      sessionId: session.id,
      customerId: session.customer
    });
    return { success: false, message: errorMessage };
  }
}

/**
 * Gestion création d'abonnement (complète les infos du checkout)
 */
async function handleSubscriptionCreated(subscription, eventId) {
  try {
    logger.info(`📝 [${eventId}] Création abonnement: ${subscription.id}`);
    
    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id }
    });
    
    if (!kine) {
      const error = `Kiné non trouvé pour subscription: ${subscription.id}`;
      logger.error(`❌ [${eventId}] ${error}`);
      return { success: false, message: error };
    }
    
    const planType = stripeService.getPlanTypeFromPriceId(subscription.items.data[0].price.id);
    if (!planType) {
      const error = `Plan non identifié pour price: ${subscription.items.data[0].price.id}`;
      logger.error(`❌ [${eventId}] ${error}`);
      return { success: false, message: error };
    }
    
    // Gestion sécurisée des timestamps Stripe (peuvent être undefined lors de la création)
    const updateData = {
      planType: planType,
      subscriptionStatus: stripeService.mapSubscriptionStatus(subscription.status),
      trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    };
    
    // Ajouter les dates seulement si elles sont valides
    if (subscription.current_period_start && !isNaN(subscription.current_period_start)) {
      updateData.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
    }
    
    if (subscription.current_period_end && !isNaN(subscription.current_period_end)) {
      updateData.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
    }
    
    await prisma.kine.update({
      where: { id: kine.id },
      data: updateData
    });
    
    // Message adaptatif selon la disponibilité des dates
    let message = `Abonnement ${planType} créé pour kiné ${kine.id}`;
    if (subscription.current_period_start && subscription.current_period_end) {
      const startDate = new Date(subscription.current_period_start * 1000).toLocaleDateString();
      const endDate = new Date(subscription.current_period_end * 1000).toLocaleDateString();
      message += ` - Période: ${startDate} au ${endDate}`;
    } else {
      message += ' - Dates de période seront mises à jour via subscription.updated';
    }
    
    logger.info(`📅 [${eventId}] ${message}`);
    return { success: true, message };
    
  } catch (error) {
    const errorMessage = `Erreur handleSubscriptionCreated: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { subscriptionId: subscription.id, stack: error.stack });
    return { success: false, message: errorMessage };
  }
}

/**
 * Gestion mise à jour d'abonnement
 */
async function handleSubscriptionUpdated(subscription, eventId) {
  try {
    logger.info(`🔄 [${eventId}] Mise à jour abonnement: ${subscription.id}`);
    
    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id }
    });
    
    if (!kine) {
      const error = `Kiné non trouvé pour subscription: ${subscription.id}`;
      logger.error(`❌ [${eventId}] ${error}`);
      return { success: false, message: error };
    }
    
    const planType = stripeService.getPlanTypeFromPriceId(subscription.items.data[0].price.id);
    const newStatus = stripeService.mapSubscriptionStatus(subscription.status);
    
    logger.debug(`🔍 [${eventId}] Debug dates (webhook):`, {
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end
    });
    
    // Récupérer l'abonnement complet depuis Stripe car le webhook peut être partiel
    let fullSubscription = subscription; // fallback
    try {
      fullSubscription = await stripeService.getSubscription(subscription.id);
      logger.debug(`🔍 [${eventId}] Dates trouvées dans items[0]:`, {
        current_period_start: fullSubscription.items?.data?.[0]?.current_period_start,
        current_period_end: fullSubscription.items?.data?.[0]?.current_period_end,
        cancel_at: fullSubscription.cancel_at,
        cancel_at_period_end: fullSubscription.cancel_at_period_end
      });
    } catch (apiError) {
      logger.error(`❌ [${eventId}] Erreur récupération abonnement complet:`, apiError.message);
    }
    
    await prisma.kine.update({
      where: { id: kine.id },
      data: {
        planType: planType,
        subscriptionStatus: newStatus,
        subscriptionStartDate: fullSubscription.items?.data?.[0]?.current_period_start ? 
          new Date(fullSubscription.items.data[0].current_period_start * 1000) : null,
        subscriptionEndDate: fullSubscription.items?.data?.[0]?.current_period_end ? 
          new Date(fullSubscription.items.data[0].current_period_end * 1000) : null,
        trialEndDate: fullSubscription.trial_end ? new Date(fullSubscription.trial_end * 1000) : null,
      }
    });
    
    const message = `Abonnement mis à jour pour kiné ${kine.id}: ${planType} (${subscription.status} -> ${newStatus})`;
    logger.info(`🔄 [${eventId}] ${message}`);
    return { success: true, message };
    
  } catch (error) {
    const errorMessage = `Erreur handleSubscriptionUpdated: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { subscriptionId: subscription.id });
    return { success: false, message: errorMessage };
  }
}

/**
 * Gestion suppression d'abonnement
 */
async function handleSubscriptionDeleted(subscription, eventId) {
  try {
    logger.info(`🗑️ [${eventId}] Suppression abonnement: ${subscription.id}`);
    
    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id }
    });
    
    if (!kine) {
      const error = `Kiné non trouvé pour subscription: ${subscription.id}`;
      logger.error(`❌ [${eventId}] ${error}`);
      return { success: false, message: error };
    }
    
    // Reset vers plan gratuit à l'expiration de l'abonnement
    await prisma.kine.update({
      where: { id: kine.id },
      data: {
        subscriptionId: null,
        subscriptionStatus: 'CANCELED',
        subscriptionEndDate: subscription.ended_at ? new Date(subscription.ended_at * 1000) : new Date(),
        planType: 'FREE', // Reset vers plan gratuit
      }
    });
    
    const message = `Abonnement supprimé pour kiné ${kine.id} - retour vers plan FREE`;
    logger.info(`🗑️ [${eventId}] ${message}`);
    return { success: true, message };
    
  } catch (error) {
    const errorMessage = `Erreur handleSubscriptionDeleted: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { subscriptionId: subscription.id });
    return { success: false, message: errorMessage };
  }
}

/**
 * Gestion paiement réussi
 */
async function handlePaymentSucceeded(invoice, eventId) {
  try {
    logger.info(`💰 [${eventId}] Paiement réussi pour invoice: ${invoice.id}`);
    
    if (invoice.subscription) {
      const kine = await prisma.kine.findFirst({
        where: { subscriptionId: invoice.subscription }
      });
      
      if (kine) {
        await prisma.kine.update({
          where: { id: kine.id },
          data: { subscriptionStatus: 'ACTIVE' }
        });
        
        const message = `Statut mis à jour vers ACTIVE pour kiné ${kine.id}`;
        logger.info(`✅ [${eventId}] ${message}`);
        return { success: true, message };
      } else {
        const message = `Kiné non trouvé pour subscription: ${invoice.subscription}`;
        logger.warn(`⚠️ [${eventId}] ${message}`);
        return { success: true, message }; // Pas critique
      }
    }
    
    return { success: true, message: 'Invoice sans subscription, ignorée' };
    
  } catch (error) {
    const errorMessage = `Erreur handlePaymentSucceeded: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { invoiceId: invoice.id });
    return { success: false, message: errorMessage };
  }
}

/**
 * Gestion échec de paiement
 */
async function handlePaymentFailed(invoice, eventId) {
  try {
    logger.info(`❌ [${eventId}] Échec de paiement pour invoice: ${invoice.id}`);
    
    if (invoice.subscription) {
      const kine = await prisma.kine.findFirst({
        where: { subscriptionId: invoice.subscription }
      });
      
      if (kine) {
        await prisma.kine.update({
          where: { id: kine.id },
          data: { subscriptionStatus: 'PAST_DUE' }
        });
        
        const message = `Statut mis à jour vers PAST_DUE pour kiné ${kine.id} - Invoice: ${invoice.id}`;
        logger.info(`⚠️ [${eventId}] ${message}`);
        logger.debug(`📧 [${eventId}] TODO: Notification à envoyer au kiné ${kine.id}`);
        
        return { success: true, message };
      } else {
        const message = `Kiné non trouvé pour subscription: ${invoice.subscription}`;
        logger.warn(`⚠️ [${eventId}] ${message}`);
        return { success: true, message };
      }
    }
    
    return { success: true, message: 'Invoice sans subscription, ignorée' };
    
  } catch (error) {
    const errorMessage = `Erreur handlePaymentFailed: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { invoiceId: invoice.id });
    return { success: false, message: errorMessage };
  }
}

module.exports = router;