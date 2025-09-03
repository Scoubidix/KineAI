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

// Liste des assistants IA disponibles
const AI_ASSISTANTS = {
  CONVERSATIONNEL: 'CONVERSATIONNEL',   // Chat avec les patients
  BIBLIOTHEQUE: 'BIBLIOTHEQUE',         // Recherche bibliographique
  CLINIQUE: 'CLINIQUE',                 // Analyse clinique
  ADMINISTRATIF: 'ADMINISTRATIF'        // Tâches administratives
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
      
      // Assistants IA disponibles
      assistants: [AI_ASSISTANTS.CONVERSATIONNEL]
    },
    limits: {
      programmes: 1
    },
    description: 'Idéal pour débuter avec 1 patient en suivi IA',
    highlights: [
      '1 programme patient avec IA',
      'Patients illimités',
      'Assistant IA conversationnel',
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
      maxProgrammes: 3,            // 3 programmes patients avec IA maximum
      unlimitedPatients: true,     // Patients illimités
      
      // Assistants IA disponibles
      assistants: [
        AI_ASSISTANTS.CONVERSATIONNEL,
        AI_ASSISTANTS.BIBLIOTHEQUE,
        AI_ASSISTANTS.CLINIQUE
      ]
    },
    limits: {
      programmes: 3
    },
    description: 'Pour un suivi professionnel de plusieurs patients',
    highlights: [
      '3 programmes patients avec IA',
      'Patients illimités', 
      'Assistant IA conversationnel',
      'Assistant IA bibliographique',
      'Assistant IA clinique',
      'Support prioritaire'
    ]
  },

  [PLAN_TYPES.PIONNIER]: {
    id: 'PIONNIER',
    type: 'PIONNIER',
    name: 'Pionnier', 
    price: 20,
    currency: 'EUR',
    interval: 'month',
    stripePriceId: 'price_1RuXvBEHFuBHSJxkyXom9QGe',
    isLimited: true,                 // Plan limité
    maxSubscriptions: 100,           // Limite à 100 abonnements
    features: {
      // Limites principales
      maxProgrammes: Infinity,     // Programmes illimités
      unlimitedPatients: true,     // Patients illimités
      
      // Assistants IA disponibles (tous)
      assistants: [
        AI_ASSISTANTS.CONVERSATIONNEL,
        AI_ASSISTANTS.BIBLIOTHEQUE,
        AI_ASSISTANTS.CLINIQUE,
        AI_ASSISTANTS.ADMINISTRATIF
      ]
    },
    limits: {
      programmes: -1 // illimité
    },
    description: 'Plan Expert à prix pionnier - Limité aux 100 premiers !',
    highlights: [
      '🚀 Prix pionnier exceptionnel',
      'Programmes patients illimités',
      'Patients illimités',
      'Tous les assistants IA',
      'Assistant IA administratif',
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
    price: 59, 
    currency: 'EUR',
    interval: 'month',
    stripePriceId: 'price_1RuXvmEHFuBHSJxknXv8U4GQ',
    features: {
      // Limites principales  
      maxProgrammes: Infinity,     // Programmes illimités
      unlimitedPatients: true,     // Patients illimités
      
      // Assistants IA disponibles (tous)
      assistants: [
        AI_ASSISTANTS.CONVERSATIONNEL,
        AI_ASSISTANTS.BIBLIOTHEQUE,
        AI_ASSISTANTS.CLINIQUE,
        AI_ASSISTANTS.ADMINISTRATIF
      ]
    },
    limits: {
      programmes: -1 // illimité
    },
    description: 'Solution complète pour cabinet avec volume important',
    highlights: [
      'Programmes patients illimités',
      'Patients illimités',
      'Tous les assistants IA',
      'Assistant IA administratif',
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
    assistants: []               // Aucun assistant IA
  },
  limits: {
    programmes: 0
  },
  description: 'Accès limité - Abonnement requis pour les fonctionnalités IA',
  highlights: [
    'Gestion des patients illimitée',
    'Création de programmes de base',
    'Tableaux de bord de base',
    'Pas d\'accès aux programmes avec IA',
    'Pas d\'assistants IA'
  ]
};

// Helper pour récupérer un plan par son type
const getPlanByType = (planType) => {
  if (!planType) return FREE_PLAN;
  return PLANS[planType] || FREE_PLAN;
};

// Helper pour vérifier si un assistant IA est disponible
const hasAssistant = (planType, assistantType) => {
  const plan = getPlanByType(planType);
  return plan.features.assistants.includes(assistantType);
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

// Liste des features disponibles (pour les composants FeatureGate)
const FEATURES = {
  CREATE_PROGRAMME: 'CREATE_PROGRAMME',           // Créer un programme avec IA
  AI_CONVERSATIONNEL: 'AI_CONVERSATIONNEL',     // Assistant conversationnel
  AI_BIBLIOTHEQUE: 'AI_BIBLIOTHEQUE',           // Assistant bibliographique
  AI_CLINIQUE: 'AI_CLINIQUE',                   // Assistant clinique
  AI_ADMINISTRATIF: 'AI_ADMINISTRATIF',         // Assistant administratif
};

// Messages d'erreur contextuels
const PAYWALL_MESSAGES = {
  [FEATURES.CREATE_PROGRAMME]: {
    title: 'Limite de programmes atteinte',
    message: 'Vous avez atteint la limite de programmes avec IA de votre plan. Passez à un plan supérieur pour créer plus de programmes.',
  },
  [FEATURES.AI_CONVERSATIONNEL]: {
    title: 'Assistant IA non disponible',
    message: 'L\'assistant IA conversationnel nécessite un abonnement actif.',
  },
  [FEATURES.AI_BIBLIOTHEQUE]: {
    title: 'Assistant bibliographique indisponible', 
    message: 'Cette fonctionnalité est disponible à partir du plan Pratique.',
  },
  [FEATURES.AI_CLINIQUE]: {
    title: 'Assistant clinique indisponible',
    message: 'Cette fonctionnalité est disponible à partir du plan Pratique.',
  },
  [FEATURES.AI_ADMINISTRATIF]: {
    title: 'Assistant administratif indisponible',
    message: 'Cette fonctionnalité est disponible uniquement avec les plans Pionnier et Expert.',
  },
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
  AI_ASSISTANTS,
  PLANS,
  plans,
  FREE_PLAN,
  getPlanByType,
  hasAssistant,
  getProgrammeLimit,
  canCreateProgramme,
  FEATURES,
  PAYWALL_MESSAGES,
  isPlanAvailable,
  getRemainingSlots
};

// Export ES6 pour compatibilité
if (typeof exports === 'undefined') {
  window.KINE_PLANS = module.exports;
}