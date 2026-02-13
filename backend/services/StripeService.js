// services/StripeService.js
// Service pour gérer les interactions avec l'API Stripe

const Stripe = require('stripe');
const logger = require('../utils/logger');
const prismaService = require('./prismaService');

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    this.endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;
  }

  /**
   * Créer une session de checkout Stripe SIMPLIFIÉ pour votre workflow
   * @param {number} kineId - ID du kiné
   * @param {string} planType - Type de plan (DECLIC, PRATIQUE, etc.)
   * @param {string} successUrl - URL de succès
   * @param {string} cancelUrl - URL d'annulation
   * @param {string} referralCode - Code de parrainage (optionnel)
   * @returns {Promise<Object>} - Session de checkout
   */
  async createCheckoutSession(kineId, planType, successUrl, cancelUrl, referralCode = null) {
    try {
      // Récupérer le kiné pour créer/récupérer le customer
      const prisma = prismaService.getInstance();

      const kine = await prisma.kine.findUnique({
        where: { id: kineId }
      });

      if (!kine) {
        throw new Error('Kinésithérapeute non trouvé');
      }

      // Créer ou récupérer le customer Stripe
      let customerId = kine.stripeCustomerId;
      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: kine.email,
          name: `${kine.firstName} ${kine.lastName}`,
          metadata: {
            kineId: kineId.toString()
          }
        });
        customerId = customer.id;

        // Sauvegarder le customer ID
        await prisma.kine.update({
          where: { id: kineId },
          data: { stripeCustomerId: customerId }
        });
      }

      // Obtenir le Price ID selon le plan
      const priceId = this.getPriceIdFromPlanType(planType);
      if (!priceId) {
        throw new Error(`Plan ${planType} non trouvé`);
      }

      // Vérifier disponibilité pour plan limité
      if (planType === 'PIONNIER') {
        const availability = await this.checkPlanAvailability(planType);
        if (!availability.available) {
          throw new Error(`Plan Pionnier complet ! Plus que ${availability.remaining} places sur ${availability.total}.`);
        }
      }

      // Créer la session Stripe AVEC correction pour les taxes
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        // ✅ CORRECTION : Permettre à Stripe de récupérer l'adresse automatiquement
        customer_update: {
          address: 'auto',  // Stripe récupère l'adresse du client automatiquement
          shipping: 'auto'  // Pour le calcul des taxes de livraison si nécessaire
        },
        // ✅ CGV NATIVES STRIPE - Case à cocher obligatoire
        consent_collection: {
          terms_of_service: 'required'
        },
        custom_text: {
          terms_of_service_acceptance: {
            message: `J'accepte les [Conditions Générales de Vente](${process.env.FRONTEND_URL}/legal/cgv.html) de Mon Assistant Kiné.`
          }
        },
        metadata: {
          kineId: kineId.toString(),
          planType: planType,
          source: 'kineai_paywall',
          ...(referralCode && { referralCode: referralCode }) // Code parrainage si présent
        },
        subscription_data: {
          metadata: {
            kineId: kineId.toString(),
            planType: planType,
            source: 'kineai_paywall',
            ...(referralCode && { referralCode: referralCode })
          }
        },
        allow_promotion_codes: true,
        automatic_tax: { enabled: true }  // Taxes automatiques activées avec adresse auto
      });

      return session;

    } catch (error) {
      logger.error('Erreur création session checkout:', error.message);
      throw error;
    }
  }

  /**
   * Obtenir le Price ID Stripe selon le type de plan
   * @param {string} planType - Type de plan
   * @returns {string} - Price ID Stripe
   */
  getPriceIdFromPlanType(planType) {
    const priceMap = {
      'DECLIC': 'price_1RtoheEHFuBHSJxklQe0tUMh',    // 9€ Déclic
      'PRATIQUE': 'price_1Rtpv9EHFuBHSJxk20JM0SqR',  // 29€ Pratique
      'PIONNIER': 'price_1RuXvBEHFuBHSJxkyXom9QGe',  // 20€ Pionnier (limité)
      'EXPERT': 'price_1RuXvmEHFuBHSJxknXv8U4GQ'     // 59€ Expert
    };
    
    return priceMap[planType] || null;
  }

  /**
   * Extraire le type de plan depuis un price ID Stripe
   * @param {string} priceId - ID du prix Stripe
   * @returns {string} - Type de plan (DECLIC, PRATIQUE, PIONNIER, EXPERT)
   */
  getPlanTypeFromPriceId(priceId) {
    const priceMap = {
      'price_1RtoheEHFuBHSJxklQe0tUMh': 'DECLIC',    // 9€ Déclic
      'price_1Rtpv9EHFuBHSJxk20JM0SqR': 'PRATIQUE',  // 29€ Pratique  
      'price_1RuXvBEHFuBHSJxkyXom9QGe': 'PIONNIER',  // 20€ Pionnier (limité)
      'price_1RuXvmEHFuBHSJxknXv8U4GQ': 'EXPERT'     // 59€ Expert
    };
    
    return priceMap[priceId] || null;
  }

  /**
   * Vérifier la disponibilité d'un plan limité (Plan Pionnier)
   * @param {string} planType - Type de plan à vérifier
   * @returns {Promise<Object>} - {available: boolean, remaining: number}
   */
  async checkPlanAvailability(planType) {
    try {
      if (planType !== 'PIONNIER') {
        return { available: true, remaining: null };
      }

      const prisma = prismaService.getInstance();

      // Compter TOUS les kinés qui ont/ont eu le plan Pionnier
      const totalPionnierUsers = await prisma.kine.count({
        where: { planType: 'PIONNIER' }
      });
      
      const maxSlots = 100; // Limite absolue
      const remaining = Math.max(0, maxSlots - totalPionnierUsers);
      
      return {
        available: remaining > 0,
        remaining,
        total: maxSlots,
        taken: totalPionnierUsers
      };
      
    } catch (error) {
      logger.error('Erreur vérification disponibilité plan:', error.message);
      return { available: false, remaining: 0, error: error.message };
    }
  }

  /**
   * Créer un portail client pour gérer l'abonnement
   * @param {number} kineId - ID du kiné
   * @param {string} returnUrl - URL de retour
   * @returns {Promise<Object>} - Session du portail client
   */
  async createPortalSession(kineId, returnUrl) {
    try {
      const prisma = prismaService.getInstance();

      const kine = await prisma.kine.findUnique({
        where: { id: kineId },
        select: { stripeCustomerId: true }
      });

      if (!kine?.stripeCustomerId) {
        throw new Error('Aucun customer Stripe trouvé');
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: kine.stripeCustomerId,
        return_url: returnUrl || `${process.env.FRONTEND_URL}/dashboard/kine`,
      });

      return session;

    } catch (error) {
      logger.error('Erreur création portail client:', error.message);
      throw new Error('Impossible de créer le portail client');
    }
  }

  /**
   * Valider un webhook Stripe
   * @param {string} payload - Payload du webhook
   * @param {string} signature - Signature du webhook
   * @returns {Object} - Event Stripe validé
   */
  validateWebhook(payload, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.endpointSecret
      );
      return event;
    } catch (error) {
      logger.error('Erreur validation webhook:', error.message);
      throw new Error('Webhook invalide');
    }
  }

  /**
   * Mapper le statut Stripe vers notre enum
   * @param {string} stripeStatus - Statut Stripe
   * @returns {string} - Statut mappé pour notre DB
   */
  mapSubscriptionStatus(stripeStatus) {
    const statusMap = {
      'active': 'ACTIVE',
      'canceled': 'CANCELED',
      'past_due': 'PAST_DUE',
      'unpaid': 'UNPAID',
      'incomplete': 'INCOMPLETE',
      'incomplete_expired': 'INCOMPLETE_EXPIRED',
      'trialing': 'TRIALING',
      'paused': 'PAUSED'
    };
    
    return statusMap[stripeStatus] || 'UNPAID';
  }

  /**
   * Changer le plan d'un abonnement
   * @param {number} kineId - ID du kiné
   * @param {string} newPlanType - Nouveau type de plan
   * @returns {Promise<Object>} - Abonnement modifié
   */
  async changePlan(kineId, newPlanType) {
    try {
      const prisma = prismaService.getInstance();

      const kine = await prisma.kine.findUnique({
        where: { id: kineId },
        select: { subscriptionId: true }
      });

      if (!kine?.subscriptionId) {
        throw new Error('Aucun abonnement trouvé');
      }

      // Vérifier disponibilité pour plan limité
      if (newPlanType === 'PIONNIER') {
        const availability = await this.checkPlanAvailability(newPlanType);
        if (!availability.available) {
          throw new Error(`Plan Pionnier complet !`);
        }
      }

      const newPriceId = this.getPriceIdFromPlanType(newPlanType);
      if (!newPriceId) {
        throw new Error(`Plan ${newPlanType} non trouvé`);
      }

      // Récupérer l'abonnement actuel
      const subscription = await this.stripe.subscriptions.retrieve(kine.subscriptionId);

      // Préparer les données de mise à jour
      const updateData = {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
      };

      // 🔧 SÉCURISÉ : Réactiver seulement si résiliation programmée
      if (subscription.cancel_at_period_end === true) {
        updateData.cancel_at_period_end = false;
        logger.info(`🔄 Réactivation de l'abonnement ${kine.subscriptionId} lors du changement de plan`);
      }

      // Modifier l'abonnement
      const updatedSubscription = await this.stripe.subscriptions.update(kine.subscriptionId, updateData);

      return updatedSubscription;

    } catch (error) {
      logger.error('Erreur changement de plan:', error.message);
      throw error;
    }
  }

  /**
   * Annuler un abonnement
   * @param {number} kineId - ID du kiné
   * @param {boolean} cancelAtPeriodEnd - Annuler à la fin de période
   * @returns {Promise<Object>} - Abonnement annulé
   */
  async cancelSubscription(kineId, cancelAtPeriodEnd = true) {
    try {
      const prisma = prismaService.getInstance();

      const kine = await prisma.kine.findUnique({
        where: { id: kineId },
        select: { subscriptionId: true }
      });

      if (!kine?.subscriptionId) {
        throw new Error('Aucun abonnement trouvé');
      }

      let subscription;
      if (cancelAtPeriodEnd) {
        subscription = await this.stripe.subscriptions.update(kine.subscriptionId, {
          cancel_at_period_end: true
        });
      } else {
        subscription = await this.stripe.subscriptions.cancel(kine.subscriptionId);
      }

      return subscription;

    } catch (error) {
      logger.error('Erreur annulation abonnement:', error.message);
      throw error;
    }
  }

  /**
   * Réactiver un abonnement
   * @param {number} kineId - ID du kiné
   * @returns {Promise<Object>} - Abonnement réactivé
   */
  async reactivateSubscription(kineId) {
    try {
      const prisma = prismaService.getInstance();

      const kine = await prisma.kine.findUnique({
        where: { id: kineId },
        select: { subscriptionId: true }
      });

      if (!kine?.subscriptionId) {
        throw new Error('Aucun abonnement trouvé');
      }

      const subscription = await this.stripe.subscriptions.update(kine.subscriptionId, {
        cancel_at_period_end: false
      });

      return subscription;

    } catch (error) {
      logger.error('Erreur réactivation abonnement:', error.message);
      throw error;
    }
  }

  /**
   * Récupérer les factures d'un client
   * @param {number} kineId - ID du kiné
   * @param {number} limit - Nombre de factures à récupérer
   * @returns {Promise<Object>} - Liste des factures
   */
  async getCustomerInvoices(kineId, limit = 10) {
    try {
      const prisma = prismaService.getInstance();

      const kine = await prisma.kine.findUnique({
        where: { id: kineId },
        select: { stripeCustomerId: true }
      });

      if (!kine?.stripeCustomerId) {
        throw new Error('Aucun customer Stripe trouvé');
      }

      const invoices = await this.stripe.invoices.list({
        customer: kine.stripeCustomerId,
        limit
      });

      return invoices;

    } catch (error) {
      logger.error('Erreur récupération factures:', error.message);
      throw error;
    }
  }

  /**
   * Récupérer un abonnement
   * @param {string} subscriptionId - ID de l'abonnement
   * @returns {Promise<Object>} - Abonnement
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      logger.error('Erreur récupération abonnement:', error.message);
      throw new Error('Impossible de récupérer l\'abonnement');
    }
  }

  // ========== MÉTHODES PARRAINAGE ==========

  /**
   * Obtenir le prix d'un plan en centimes
   * @param {string} planType - Type de plan
   * @returns {number} - Prix en centimes (ex: 999 pour 9.99€)
   */
  getPlanPriceInCents(planType) {
    const priceMap = {
      'DECLIC': 900,      // 9€
      'PRATIQUE': 2900,   // 29€
      'PIONNIER': 2000,   // 20€
      'EXPERT': 5900      // 59€
    };
    return priceMap[planType] || 0;
  }

  /**
   * Appliquer un crédit de parrainage sur le compte client Stripe
   * Le crédit sera automatiquement déduit de la prochaine facture
   * @param {string} customerId - ID client Stripe
   * @param {number} amountInCents - Montant en centimes (négatif = crédit)
   * @param {string} description - Description du crédit
   * @returns {Promise<Object>} - Transaction de balance
   */
  async applyReferralCredit(customerId, amountInCents, description) {
    try {
      if (!customerId) {
        throw new Error('Customer ID requis');
      }

      if (amountInCents <= 0) {
        throw new Error('Le montant doit être positif');
      }

      // Créer une transaction de crédit (montant négatif = crédit pour le client)
      const balanceTransaction = await this.stripe.customers.createBalanceTransaction(
        customerId,
        {
          amount: -amountInCents, // Négatif pour créditer le client
          currency: 'eur',
          description: description
        }
      );

      logger.info(`💰 Crédit parrainage appliqué: ${amountInCents / 100}€ pour customer ${customerId}`);
      return balanceTransaction;

    } catch (error) {
      logger.error('Erreur application crédit parrainage:', error.message);
      throw error;
    }
  }

  /**
   * Récupérer le solde créditeur d'un client
   * @param {string} customerId - ID client Stripe
   * @returns {Promise<number>} - Solde en centimes (négatif = crédit disponible)
   */
  async getCustomerBalance(customerId) {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      return customer.balance; // Négatif = crédit disponible
    } catch (error) {
      logger.error('Erreur récupération balance client:', error.message);
      return 0;
    }
  }

  /**
   * Vérifier si un email est un email jetable/temporaire
   * @param {string} email - Email à vérifier
   * @returns {boolean} - true si email jetable
   */
  isDisposableEmail(email) {
    const disposableDomains = [
      'tempmail.com', 'guerrillamail.com', 'mailinator.com', 'throwaway.email',
      'temp-mail.org', 'fakeinbox.com', 'getnada.com', 'maildrop.cc',
      'yopmail.com', 'trashmail.com', '10minutemail.com', 'mohmal.com',
      'tempail.com', 'emailondeck.com', 'tempr.email', 'dispostable.com',
      'mailnesia.com', 'spamgourmet.com', 'mytrashmail.com', 'mt2009.com',
      'thankyou2010.com', 'trash2009.com', 'sharklasers.com', 'grr.la',
      'guerrillamailblock.com', 'pokemail.net', 'spam4.me'
    ];

    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  /**
   * Vérifier si deux emails sont potentiellement de la même personne
   * (alias Gmail, même domaine pro, etc.)
   * @param {string} email1 - Premier email
   * @param {string} email2 - Deuxième email
   * @returns {boolean} - true si potentiellement même personne
   */
  areEmailsSuspicious(email1, email2) {
    const e1 = email1.toLowerCase();
    const e2 = email2.toLowerCase();

    // Même email exact
    if (e1 === e2) return true;

    const [local1, domain1] = e1.split('@');
    const [local2, domain2] = e2.split('@');

    // Alias Gmail (jean.dupont+ref@gmail.com === jeandupont@gmail.com)
    const freeProviders = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
    if (freeProviders.includes(domain1) && domain1 === domain2) {
      // Normaliser les locaux Gmail (supprimer les points et les +tag)
      const normalize = (local) => local.split('+')[0].replace(/\./g, '');
      if (normalize(local1) === normalize(local2)) return true;
    }

    // Même domaine professionnel (pas les providers gratuits)
    if (!freeProviders.includes(domain1) && domain1 === domain2) {
      return true; // Même entreprise = suspect
    }

    return false;
  }

  // ==========================================

  /**
   * Valider une IP Stripe avec debug détaillé
   * @param {Object} req - Request Express
   * @returns {Object} - Résultat de validation avec debug info
   */
  validateStripeIP(req) {
    const STRIPE_IPS = [
      '3.18.12.63', '3.130.192.231', '13.235.14.237', '13.235.122.149',
      '18.211.135.69', '35.154.171.200', '52.15.183.38', '54.88.130.119',
      '54.88.130.237', '54.187.174.169', '54.187.205.235', '54.187.216.72'
    ];

    // Récupérer tous les headers IP possibles
    const headers = {
      'x-forwarded-for': req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
      'x-real-ip': req.headers['x-real-ip'],
      'cf-connecting-ip': req.headers['cf-connecting-ip'],
      'x-client-ip': req.headers['x-client-ip'],
      'x-cluster-client-ip': req.headers['x-cluster-client-ip'],
      'forwarded': req.headers['forwarded'],
      'direct-ip': req.ip,
      'connection-ip': req.connection?.remoteAddress,
      'socket-ip': req.socket?.remoteAddress
    };

    logger.debug('🔍 StripeService - Headers IP complets:', headers);

    // En développement, bypass avec logs complets
    if (process.env.NODE_ENV === 'development') {
      logger.warn('🔓 StripeService - Mode dev, validation IP bypassée');
      logger.warn('📋 Headers pour debug production:', headers);
      return {
        valid: true,
        ip: headers['x-forwarded-for'] || headers['direct-ip'] || '127.0.0.1',
        source: 'development-bypass',
        environment: 'development',
        headers,
        stripeIPs: STRIPE_IPS
      };
    }

    // Tester chaque header
    const headerPriority = [
      'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 
      'x-client-ip', 'x-cluster-client-ip', 
      'direct-ip', 'connection-ip', 'socket-ip'
    ];

    for (const headerName of headerPriority) {
      const ip = headers[headerName];
      if (ip && STRIPE_IPS.includes(ip)) {
        logger.warn(`✅ StripeService - IP validée: ${ip} (${headerName})`);
        return {
          valid: true,
          ip,
          source: headerName,
          environment: 'production',
          headers
        };
      }
    }

    logger.error('🚫 StripeService - Aucune IP Stripe valide');
    logger.error('📋 Headers analysés:', headers);
    logger.error('📝 IPs Stripe attendues:', STRIPE_IPS);

    return {
      valid: false,
      environment: 'production',
      headers,
      stripeIPs: STRIPE_IPS,
      reason: 'no_valid_stripe_ip_found'
    };
  }
}

// Export singleton
const stripeService = new StripeService();
module.exports = stripeService;