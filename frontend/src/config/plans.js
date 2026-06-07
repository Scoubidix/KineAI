// config/plans.js
// Configuration des plans d'abonnement KineAI

const STRIPE_CONFIG = {
  // Ton ID produit Stripe
  PRODUCT_ID: 'prod_SpTe8FwbXuoix1',
  
  // URLs de retour après checkout - On utilise window.location.origin côté client
  SUCCESS_URL: typeof window !== 'undefined' ? `${window.location.origin}/checkout-success` : '/checkout-success',
  CANCEL_URL: typeof window !== 'undefined' ? `${window.location.origin}/checkout-cancel` : '/checkout-cancel',
};

const PLAN_TYPES = {
  DECLIC: 'DECLIC',
  PRATIQUE: 'PRATIQUE',
  PIONNIER: 'PIONNIER',
  EXPERT: 'EXPERT'
};

const PLANS = {
  [PLAN_TYPES.DECLIC]: {
    id: 'DECLIC',
    type: 'DECLIC',
    name: 'Déclic',
    price: 9,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: 'price_1RtoheEHFuBHSJxklQe0tUMh',
    features: {
      // Limites principales
      maxProgrammes: 1,            // 1 programme patient avec IA maximum
      unlimitedPatients: true,     // Patients illimités (gestion uniquement)

      // Chat IA unifié : quota quotidien relatif (1 = usage standard)
      chatMultiplier: 1,
      iaBilans: false,             // Génération de bilans par IA
      moduleAdmin: false           // Module administratif (courriers, templates)
    },
    limits: {
      programmes: 1
    },
    description: 'Idéal pour débuter avec 1 patient en suivi IA',
    highlights: [
      '1 programme patient avec IA',
      'Patients illimités',
      'Assistant IA inclus',
      'Support par email'
    ]
  },

  [PLAN_TYPES.PRATIQUE]: {
    id: 'PRATIQUE',
    type: 'PRATIQUE',
    name: 'Pratique', 
    price: 29,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: 'price_1Rtpv9EHFuBHSJxk20JM0SqR',
    features: {
      // Limites principales
      maxProgrammes: 5,            // 5 programmes patients avec IA maximum
      unlimitedPatients: true,     // Patients illimités

      // Chat IA unifié : quota quotidien relatif (1 = usage standard)
      chatMultiplier: 3,
      iaBilans: true,              // Génération de bilans par IA
      moduleAdmin: false           // Module administratif (courriers, templates)
    },
    limits: {
      programmes: 5
    },
    description: 'Pour un suivi professionnel de plusieurs patients',
    highlights: [
      '5 programmes patients avec IA',
      'Patients illimités',
      'Assistant IA : 3× le plan Déclic',
      'Génération de bilans',
      'Support prioritaire'
    ]
  },

  [PLAN_TYPES.PIONNIER]: {
    id: 'PIONNIER',
    type: 'PIONNIER',
    name: 'Pionnier', 
    price: 19,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: 'price_1RuXvBEHFuBHSJxkyXom9QGe',
    isLimited: true,                 // Plan limité
    maxSubscriptions: 100,           // Limite à 100 abonnements
    features: {
      // Limites principales
      maxProgrammes: Infinity,     // Programmes illimités
      unlimitedPatients: true,     // Patients illimités

      // Chat IA unifié : quota quotidien relatif (1 = usage standard)
      chatMultiplier: 10,
      iaBilans: true,              // Génération de bilans par IA
      moduleAdmin: true            // Module administratif (courriers, templates)
    },
    limits: {
      programmes: -1 // illimité
    },
    description: 'Plan Expert à prix pionnier - Limité aux 100 premiers !',
    highlights: [
      '🚀 Prix pionnier exceptionnel',
      'Programmes patients illimités',
      'Patients illimités',
      'Assistant IA : 10× le plan Déclic',
      'Génération de bilans',
      'Module administratif (courriers et templates)',
      'Support téléphone prioritaire',
      'Rapports avancés',
      '⚡ Limité à 100 places seulement'
    ],
    badge: '🔥 Offre limitée'
  },

  [PLAN_TYPES.EXPERT]: {
    id: 'EXPERT',
    type: 'EXPERT',
    name: 'Expert',
    price: 49,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: 'price_1TAXd7EHFuBHSJxkiRnFSDfi',
    features: {
      // Limites principales
      maxProgrammes: Infinity,     // Programmes illimités
      unlimitedPatients: true,     // Patients illimités

      // Chat IA unifié : quota quotidien relatif (1 = usage standard)
      chatMultiplier: 10,
      iaBilans: true,              // Génération de bilans par IA
      moduleAdmin: true            // Module administratif (courriers, templates)
    },
    limits: {
      programmes: -1 // illimité
    },
    description: 'Solution complète pour cabinet avec volume important',
    highlights: [
      'Programmes patients illimités',
      'Patients illimités',
      'Assistant IA : 10× le plan Déclic',
      'Génération de bilans',
      'Module administratif (courriers et templates)',
      'Support téléphone prioritaire',
      'Rapports avancés'
    ]
  }
};

// Plan par défaut pour les nouveaux utilisateurs (pas d'abonnement)
const FREE_PLAN = {
  id: null,
  type: null,
  name: 'Aucun abonnement',
  price: 0,
  features: {
    maxProgrammes: 0,            // Aucun programme avec IA autorisé
    unlimitedPatients: true,     // Patients illimités (gestion uniquement)

    // Chat IA unifié : quota quotidien relatif (0 = usage limité)
    chatMultiplier: 0,
    iaBilans: false,             // Génération de bilans par IA
    moduleAdmin: false           // Module administratif (courriers, templates)
  },
  limits: {
    programmes: 0
  },
  description: 'Accès découverte - Abonnement requis pour les programmes avec IA',
  highlights: [
    'Gestion des patients illimitée',
    'Création de programmes de base',
    'Assistant IA : usage découverte',
    'Tableaux de bord de base',
    'Pas d\'accès aux programmes avec IA'
  ]
};

// Helper pour récupérer un plan par son type
const getPlanByType = (planType) => {
  if (!planType) return FREE_PLAN;
  return PLANS[planType] || FREE_PLAN;
};

// Helper pour le libellé du quota chat IA selon le plan
const getChatQuotaLabel = (planType) => {
  const plan = getPlanByType(planType);
  const multiplier = plan.features.chatMultiplier;
  if (!multiplier) return 'usage découverte';
  if (multiplier === 1) return 'usage inclus';
  return `${multiplier}× le plan Déclic`;
};

// Helper pour récupérer la limite de programmes
const getProgrammeLimit = (planType) => {
  const plan = getPlanByType(planType);
  return plan.features.maxProgrammes;
};

// Helper pour vérifier si on peut créer un nouveau programme
const canCreateProgramme = (planType, currentProgrammes) => {
  const limit = getProgrammeLimit(planType);
  if (limit === Infinity || limit === -1) return true;
  return currentProgrammes < limit;
};

// Helper pour vérifier si un plan est encore disponible
const isPlanAvailable = async (planType) => {
  if (!PLANS[planType]?.isLimited) return true;
  
  // Pour les plans limités, vérifier le nombre d'abonnements actuel
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/plans/${planType}/availability`);
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.available;
  } catch (error) {
    console.error('Erreur vérification disponibilité plan:', error);
    return false;
  }
};

// Helper pour récupérer le nombre de places restantes
const getRemainingSlots = async (planType) => {
  if (!PLANS[planType]?.isLimited) return null;
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/plans/${planType}/remaining-slots`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.remaining;
  } catch (error) {
    console.error('Erreur récupération places restantes:', error);
    return null;
  }
};

// EXPORTS CommonJS et ES6
const plans = PLANS;

module.exports = {
  STRIPE_CONFIG,
  PLAN_TYPES,
  PLANS,
  plans,
  FREE_PLAN,
  getPlanByType,
  getChatQuotaLabel,
  getProgrammeLimit,
  canCreateProgramme,
  isPlanAvailable,
  getRemainingSlots
};

// Export ES6 pour compatibilité
if (typeof exports === 'undefined') {
  window.KINE_PLANS = module.exports;
}