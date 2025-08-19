// services/StripeService.js
// Service pour gérer les interactions avec l'API Stripe

const Stripe = require('stripe');

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
   * @returns {Promise<Object>} - Session de checkout
   */
  async createCheckoutSession(kineId, planType, successUrl, cancelUrl) {
    try {
      // Récupérer le kiné pour créer/récupérer le customer
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
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
            kineId: kineId.toString(),
            uid: kine.uid,
            rpps: kine.rpps
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
        metadata: {
          kineId: kineId.toString(),
          planType: planType,
          source: 'kineai_paywall'
        },
        subscription_data: {
          metadata: {
            kineId: kineId.toString(),
            planType: planType,
            source: 'kineai_paywall'
          }
        },
        allow_promotion_codes: true,
        automatic_tax: { enabled: true }  // Taxes automatiques activées avec adresse auto
      });

      await prisma.$disconnect();
      return session;

    } catch (error) {
      console.error('Erreur création session checkout:', error);
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
      'PRATIQUE': 'price_1Rtpv9EHFuBHSJxk20JM0SqR',  // 19€ Pratique
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
      'price_1Rtpv9EHFuBHSJxk20JM0SqR': 'PRATIQUE',  // 19€ Pratique  
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

      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      // Compter TOUS les kinés qui ont/ont eu le plan Pionnier
      const totalPionnierUsers = await prisma.kine.count({
        where: { planType: 'PIONNIER' }
      });
      
      await prisma.$disconnect();
      
      const maxSlots = 100; // Limite absolue
      const remaining = Math.max(0, maxSlots - totalPionnierUsers);
      
      return {
        available: remaining > 0,
        remaining,
        total: maxSlots,
        taken: totalPionnierUsers
      };
      
    } catch (error) {
      console.error('Erreur vérification disponibilité plan:', error);
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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
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

      await prisma.$disconnect();
      return session;

    } catch (error) {
      console.error('Erreur création portail client:', error);
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
      console.error('Erreur validation webhook:', error);
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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
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
      
      // Modifier l'abonnement
      const updatedSubscription = await this.stripe.subscriptions.update(kine.subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
      });
      
      await prisma.$disconnect();
      return updatedSubscription;

    } catch (error) {
      console.error('Erreur changement de plan:', error);
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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
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
      
      await prisma.$disconnect();
      return subscription;

    } catch (error) {
      console.error('Erreur annulation abonnement:', error);
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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
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
      
      await prisma.$disconnect();
      return subscription;

    } catch (error) {
      console.error('Erreur réactivation abonnement:', error);
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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
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
      
      await prisma.$disconnect();
      return invoices;

    } catch (error) {
      console.error('Erreur récupération factures:', error);
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
      console.error('Erreur récupération abonnement:', error);
      throw new Error('Impossible de récupérer l\'abonnement');
    }
  }
}

// Export singleton
const stripeService = new StripeService();
module.exports = stripeService;