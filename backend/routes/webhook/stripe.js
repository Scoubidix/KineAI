// routes/webhook/stripe.js
// Route pour traiter les webhooks Stripe avec gestion d'erreurs améliorée

const express = require('express');
const prismaService = require('../../services/prismaService');
const stripeService = require('../../services/StripeService');
const logger = require('../../utils/logger');
const { sanitizeUID, sanitizeEmail, sanitizeId, sanitizeName } = require('../../utils/logSanitizer');
const { notifyNewSubscription } = require('../../services/telegramService');

const router = express.Router();
const prisma = prismaService.getInstance();

// IPs autorisées de Stripe (depuis env ou liste officielle par défaut - https://docs.stripe.com/ips)
const DEFAULT_STRIPE_IPS = [
  '3.18.12.63', '3.130.192.231', '13.235.14.237', '13.235.122.149',
  '18.211.135.69', '35.154.171.200', '52.15.183.38', '54.88.130.119',
  '54.88.130.237', '54.187.174.169', '54.187.205.235', '54.187.216.72',
  '35.157.207.129', '3.69.109.8', '3.120.168.93'
];
const STRIPE_IPS = [
  ...(process.env.STRIPE_WEBHOOK_IPS
    ? process.env.STRIPE_WEBHOOK_IPS.split(',').map(ip => ip.trim()).filter(Boolean)
    : DEFAULT_STRIPE_IPS),
  ...(process.env.NODE_ENV === 'development' ? ['127.0.0.1', '::1'] : [])
];

/**
 * Validation IP intelligente avec fallback sur plusieurs headers
 * @param {Object} req - Request Express
 * @returns {Object} - {valid: boolean, ip: string, source: string, headers: Object}
 */
const validateIPWithFallback = (req) => {
  // Récupérer tous les headers IP possibles
  const headers = {
    'x-forwarded-for': req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
    'x-real-ip': req.headers['x-real-ip'],
    'cf-connecting-ip': req.headers['cf-connecting-ip'], // Cloudflare
    'x-forwarded-proto': req.headers['x-forwarded-proto'], // Info protocole
    'direct-ip': req.ip,
    'connection-ip': req.connection?.remoteAddress,
    'socket-ip': req.socket?.remoteAddress
  };

  logger.debug('🔍 Headers IP debug complet:', {
    headers,
    userAgent: req.headers['user-agent'],
    host: req.headers.host
  });

  // Fonction de normalisation et validation d'une IP
  const normalizeAndValidateIP = (ip) => {
    if (!ip) return { normalized: null, valid: false };
    
    // Normaliser les IPs IPv6 locales vers IPv4
    let normalizedIP = ip;
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
      normalizedIP = '127.0.0.1';
      logger.debug(`🔄 IP normalisée: ${ip} → ${normalizedIP}`);
    }
    
    // Nettoyer les préfixes IPv6-mapped IPv4
    if (ip.startsWith('::ffff:')) {
      normalizedIP = ip.replace('::ffff:', '');
      logger.debug(`🔄 IP nettoyée IPv6-mapped: ${ip} → ${normalizedIP}`);
    }
    
    // Validation Stripe
    const isValidStripe = STRIPE_IPS.some(stripeIP => 
      normalizedIP === stripeIP || normalizedIP.includes(stripeIP)
    );
    
    return { normalized: normalizedIP, valid: isValidStripe, original: ip };
  };

  // Test chaque header dans l'ordre de priorité
  const headerPriority = [
    'x-forwarded-for',    // Le plus courant pour les proxies
    'x-real-ip',          // Nginx
    'cf-connecting-ip',   // Cloudflare
    'direct-ip',          // Express req.ip
    'connection-ip',      // Connection directe
    'socket-ip'           // Socket niveau bas
  ];

  logger.debug('Début validation IP Stripe...');
  
  for (const headerName of headerPriority) {
    const ip = headers[headerName];
    if (ip) {
      const validation = normalizeAndValidateIP(ip);
      logger.debug(`🔍 Test ${headerName}: ${ip} → ${validation.normalized} (Stripe: ${validation.valid})`);
      
      if (validation.valid) {
        logger.debug(`IP Stripe validée: ${validation.normalized} (source: ${headerName})`);
        return { valid: true, ip: validation.normalized, originalIP: ip, source: headerName, headers };
      }
    }
  }

  // Aucune IP valide trouvée
  logger.error('🚫 Aucune IP Stripe valide trouvée dans les headers');
  logger.error('📋 Headers analysés:', headers);
  return { valid: false, headers };
};

/**
 * Middleware de vérification IP pour les webhooks Stripe avec fallback intelligent
 */
const verifyStripeIP = (req, res, next) => {
  const validation = validateIPWithFallback(req);
  
  if (!validation.valid) {
    logger.error(`🚫 Webhook rejété - IP non autorisée`);
    logger.error('🔍 Headers reçus:', validation.headers);
    logger.error('📝 IPs Stripe autorisées:', STRIPE_IPS.slice(0, 3), '...');
    return res.status(403).json({ 
      error: 'IP non autorisée',
      headers: Object.keys(validation.headers),
      timestamp: new Date().toISOString()
    });
  }
  
  logger.debug(`Webhook autorisé - IP: ${validation.ip} (${validation.source})`);
  
  // Ajouter les infos de validation à la request pour logging ultérieur
  req.stripeValidation = validation;
  
  next();
};

// Middleware pour récupérer le raw body (nécessaire pour Stripe)
router.use('/stripe', express.raw({ type: 'application/json' }));

// Route webhook Stripe avec sécurité renforcée
router.post('/stripe', verifyStripeIP, async (req, res) => {
  const signature = req.get('stripe-signature');
  const eventId = req.headers['stripe-event-id'] || 'unknown';
  const validation = req.stripeValidation || { ip: 'unknown', source: 'unknown' };
  
  logger.debug(`Webhook Stripe reçu - ID: ${eventId} - Type attendu`);
  logger.debug('🔍 Validation détaillée:', validation);
  
  try {
    // Valider le webhook avec Stripe
    const event = stripeService.validateWebhook(req.body, signature);
    
    logger.debug(`Webhook validé - Type: ${event.type} - ID: ${event.id}`);
    
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
      
      // Log uniquement en cas d'échec (les handlers loggent eux-mêmes le succès)
      if (!handlerResult.success) {
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
    logger.debug(`[${eventId}] Traitement checkout completed: ${session.id}`);
    
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

    // 🔒 Log acceptation CGV (conformité légale)
    try {
      logger.info(`🔒 CGV acceptées lors du checkout`, {
        kineId: sanitizeId(kineId),
        planType: planType,
        sessionId: sanitizeId(session.id),
        customerId: sanitizeId(session.customer),
        timestamp: new Date().toISOString(),
        eventId: sanitizeId(eventId),
        consentCollected: session.consent_collection?.terms_of_service || 'unavailable'
      });
    } catch (logError) {
      logger.error(`⚠️ [${eventId}] Erreur log CGV (non bloquante):`, logError.message);
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
      const successMessage = `Abonnement ${planType} créé pour kiné ${kineId}`;

      logger.info(`📋 ${successMessage}`);
      logger.debug(`[${eventId}] Détails: ${sanitizeEmail(kine.email)}, Customer: ${session.customer}, Subscription: ${session.subscription} (${duration}ms)`);

      // ========== NOTIFICATION TELEGRAM ==========
      try {
        await notifyNewSubscription(planType);
      } catch (telegramError) {
        logger.error(`⚠️ [${eventId}] Erreur Telegram (non bloquante):`, telegramError.message);
      }
      // ============================================

      // ========== TRAITEMENT PARRAINAGE ==========
      const referralCode = session.metadata?.referralCode;
      if (referralCode) {
        try {
          await handleReferralAtCheckout(kineId, kine.email, referralCode, planType, eventId);
        } catch (refError) {
          // Ne pas bloquer le checkout si le parrainage échoue
          logger.error(`⚠️ [${eventId}] Erreur parrainage (non bloquante):`, refError.message);
        }
      }
      // ============================================

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
 * Traitement du parrainage lors du checkout
 * Crée un Referral en status PENDING (crédits appliqués au 1er renouvellement)
 */
async function handleReferralAtCheckout(refereeKineId, refereeEmail, referralCode, planType, eventId) {
  logger.info(`🎁 [${eventId}] Traitement parrainage: code=${referralCode}, filleul=${refereeKineId}`);

  // Vérifier si le filleul n'a pas déjà été parrainé
  const existingReferral = await prisma.referral.findUnique({
    where: { refereeId: refereeKineId }
  });

  if (existingReferral) {
    logger.warn(`⚠️ [${eventId}] Kiné ${refereeKineId} déjà parrainé (referral #${existingReferral.id})`);
    return;
  }

  // Trouver le parrain
  const referrer = await prisma.kine.findFirst({
    where: { referralCode: referralCode },
    select: { id: true, email: true, stripeCustomerId: true }
  });

  if (!referrer) {
    logger.warn(`⚠️ [${eventId}] Parrain non trouvé pour code: ${referralCode}`);
    return;
  }

  // Vérification anti-fraude : emails suspects
  if (stripeService.areEmailsSuspicious(referrer.email, refereeEmail)) {
    logger.error(`🚨 [${eventId}] Auto-parrainage détecté ! Parrain: ${sanitizeEmail(referrer.email)}, Filleul: ${sanitizeEmail(refereeEmail)}`);

    // Créer un referral marqué comme fraude
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: refereeKineId,
        planSubscribed: planType,
        creditAmount: stripeService.getPlanPriceInCents(planType) / 100,
        status: 'FRAUD',
        refereeEmail: refereeEmail
      }
    });
    return;
  }

  // Calculer le montant du crédit (prix du plan du filleul)
  const creditAmountCents = stripeService.getPlanPriceInCents(planType);
  const creditAmountEuros = creditAmountCents / 100;

  // Créer le referral en status PENDING
  const referral = await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId: refereeKineId,
      planSubscribed: planType,
      creditAmount: creditAmountEuros,
      status: 'PENDING',
      refereeEmail: refereeEmail
    }
  });

  logger.info(`✅ [${eventId}] Referral #${referral.id} créé: parrain=${referrer.id}, filleul=${refereeKineId}, crédit=${creditAmountEuros}€, status=PENDING`);
  logger.info(`📅 [${eventId}] Crédits seront appliqués au 1er renouvellement du filleul`);
}

/**
 * Gestion création d'abonnement (complète les infos du checkout)
 */
async function handleSubscriptionCreated(subscription, eventId) {
  try {
    logger.debug(`[${eventId}] subscription.created reçu: ${subscription.id}`);
    
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
    
    logger.debug(`[${eventId}] ${message}`);
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
    logger.debug(`[${eventId}] subscription.updated reçu: ${subscription.id}`);

    const kine = await prisma.kine.findFirst({
      where: { subscriptionId: subscription.id },
      select: { id: true, planType: true }
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
    
    // Log business : distinguer changement de plan vs mise à jour technique
    const oldPlan = kine.planType;
    let message;
    if (planType && oldPlan && planType !== oldPlan) {
      message = `Changement d'abonnement pour kiné ${kine.id} : ${oldPlan} → ${planType}`;
      logger.info(`🔄 ${message}`);
    } else {
      message = `Abonnement mis à jour pour kiné ${kine.id}: ${planType || oldPlan} (${newStatus})`;
      logger.debug(`[${eventId}] ${message}`);
    }
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
    logger.debug(`[${eventId}] subscription.deleted reçu: ${subscription.id}`);
    
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

    // ========== ANNULER PARRAINAGE PENDING SI FILLEUL ==========
    // Si ce kiné était un filleul avec un parrainage PENDING, le marquer comme CANCELED
    try {
      const pendingReferral = await prisma.referral.findFirst({
        where: {
          refereeId: kine.id,
          status: 'PENDING'
        }
      });

      if (pendingReferral) {
        await prisma.referral.update({
          where: { id: pendingReferral.id },
          data: { status: 'CANCELED' }
        });
        logger.info(`🚫 [${eventId}] Parrainage #${pendingReferral.id} annulé (filleul a résilié avant renouvellement)`);
      }
    } catch (refError) {
      logger.error(`⚠️ [${eventId}] Erreur annulation parrainage (non bloquante):`, refError.message);
    }
    // ===========================================================

    const message = `Abonnement résilié pour kiné ${kine.id} - retour FREE`;
    logger.info(`🚫 ${message}`);
    return { success: true, message };
    
  } catch (error) {
    const errorMessage = `Erreur handleSubscriptionDeleted: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { subscriptionId: subscription.id });
    return { success: false, message: errorMessage };
  }
}

/**
 * Gestion paiement réussi
 * Inclut le traitement des crédits de parrainage au 1er renouvellement
 */
async function handlePaymentSucceeded(invoice, eventId) {
  try {
    // Support ancien et nouveau format API Stripe
    const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;

    logger.debug(`[${eventId}] invoice.payment_succeeded: ${invoice.id} - billing_reason: ${invoice.billing_reason}`);

    if (subscriptionId) {
      const kine = await prisma.kine.findFirst({
        where: { subscriptionId: subscriptionId },
        select: { id: true, stripeCustomerId: true, email: true, planType: true }
      });

      if (kine) {
        await prisma.kine.update({
          where: { id: kine.id },
          data: { subscriptionStatus: 'ACTIVE' }
        });

        // Log business : renouvellement vs premier paiement
        if (invoice.billing_reason === 'subscription_cycle') {
          logger.info(`🔄 Abonnement ${kine.planType} renouvelé pour kiné ${kine.id}`);
        } else {
          logger.debug(`[${eventId}] Paiement initial traité pour kiné ${kine.id}`);
        }

        // ========== TRAITEMENT CRÉDIT PARRAINAGE AU RENOUVELLEMENT ==========
        // billing_reason: 'subscription_create' = 1er paiement
        // billing_reason: 'subscription_cycle' = renouvellement (2ème paiement+)
        if (invoice.billing_reason === 'subscription_cycle') {
          try {
            await handleReferralCreditOnRenewal(kine.id, kine.stripeCustomerId, eventId);
          } catch (refError) {
            logger.error(`⚠️ [${eventId}] Erreur crédit parrainage (non bloquante):`, refError.message);
          }
        }
        // ====================================================================

        const message = `Paiement traité pour kiné ${kine.id}`;
        return { success: true, message };
      } else {
        const message = `Kiné non trouvé pour subscription: ${subscriptionId}`;
        logger.warn(`⚠️ [${eventId}] ${message}`);
        return { success: true, message }; // Pas critique
      }
    }

    return { success: true, message: 'Invoice sans subscription (one-time payment), ignorée' };

  } catch (error) {
    const errorMessage = `Erreur handlePaymentSucceeded: ${error.message}`;
    logger.error(`💥 [${eventId}] ${errorMessage}`, { invoiceId: invoice.id });
    return { success: false, message: errorMessage };
  }
}

/**
 * Applique les crédits de parrainage au 1er renouvellement du filleul
 */
async function handleReferralCreditOnRenewal(refereeKineId, refereeStripeCustomerId, eventId) {
  // Chercher un referral PENDING pour ce filleul
  const referral = await prisma.referral.findFirst({
    where: {
      refereeId: refereeKineId,
      status: 'PENDING'
    },
    include: {
      referrer: {
        select: { id: true, stripeCustomerId: true, firstName: true, email: true }
      }
    }
  });

  if (!referral) {
    logger.debug(`[${eventId}] Pas de parrainage PENDING pour kiné ${refereeKineId}`);
    return;
  }

  logger.info(`🎁 [${eventId}] Traitement crédit parrainage: referral #${referral.id}`);

  const creditAmountCents = Math.round(referral.creditAmount * 100);

  // Vérifier les limites mensuelles du parrain
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const referralsThisMonth = await prisma.referral.count({
    where: {
      referrerId: referral.referrerId,
      status: 'COMPLETED',
      creditedAt: { gte: startOfMonth }
    }
  });

  if (referralsThisMonth >= 5) { // MAX_REFERRALS_PER_MONTH
    logger.warn(`⚠️ [${eventId}] Parrain ${referral.referrerId} a atteint la limite mensuelle`);
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: 'EXPIRED' }
    });
    return;
  }

  let referrerCredited = false;
  let refereeCredited = false;

  // 1. Créditer le PARRAIN
  if (referral.referrer.stripeCustomerId) {
    try {
      await stripeService.applyReferralCredit(
        referral.referrer.stripeCustomerId,
        creditAmountCents,
        `Crédit parrainage - Filleul abonné (${referral.planSubscribed})`
      );
      referrerCredited = true;
      logger.info(`💰 [${eventId}] Crédit ${referral.creditAmount}€ appliqué au parrain ${referral.referrer.id}`);
    } catch (error) {
      logger.error(`❌ [${eventId}] Erreur crédit parrain:`, error.message);
    }
  } else {
    logger.warn(`⚠️ [${eventId}] Parrain ${referral.referrer.id} sans stripeCustomerId`);
  }

  // 2. Créditer le FILLEUL
  if (refereeStripeCustomerId) {
    try {
      await stripeService.applyReferralCredit(
        refereeStripeCustomerId,
        creditAmountCents,
        `Crédit parrainage - Bienvenue chez Mon Assistant Kiné !`
      );
      refereeCredited = true;
      logger.info(`💰 [${eventId}] Crédit ${referral.creditAmount}€ appliqué au filleul ${refereeKineId}`);
    } catch (error) {
      logger.error(`❌ [${eventId}] Erreur crédit filleul:`, error.message);
    }
  } else {
    logger.warn(`⚠️ [${eventId}] Filleul ${refereeKineId} sans stripeCustomerId`);
  }

  // Mettre à jour le referral
  const newStatus = (referrerCredited || refereeCredited) ? 'COMPLETED' : 'PENDING';

  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: newStatus,
      referrerCredited,
      refereeCredited,
      creditedAt: newStatus === 'COMPLETED' ? new Date() : null
    }
  });

  logger.info(`✅ [${eventId}] Referral #${referral.id} mis à jour: status=${newStatus}, parrain=${referrerCredited}, filleul=${refereeCredited}`);
}

/**
 * Gestion échec de paiement
 */
async function handlePaymentFailed(invoice, eventId) {
  try {
    logger.debug(`[${eventId}] invoice.payment_failed: ${invoice.id}`);
    
    if (invoice.subscription) {
      const kine = await prisma.kine.findFirst({
        where: { subscriptionId: invoice.subscription }
      });
      
      if (kine) {
        await prisma.kine.update({
          where: { id: kine.id },
          data: { subscriptionStatus: 'PAST_DUE' }
        });
        
        const message = `Échec paiement pour kiné ${kine.id} - statut PAST_DUE`;
        logger.info(`❌ ${message}`);
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