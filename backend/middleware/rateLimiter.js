// middleware/rateLimiter.js
// Middleware de limitation de débit universel pour l'application

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeIP } = require('../utils/logSanitizer');

/**
 * Helper pour générer des clés sécurisées IPv6/IPv4
 * @param {Request} req - Express request
 * @param {string} prefix - Préfixe de la clé
 * @returns {string} - Clé sécurisée
 */
function generateSecureKey(req, prefix) {
  // Utiliser l'UID Firebase en priorité (plus sécurisé)
  if (req.uid) {
    return `${prefix}_user_${req.uid}`;
  }
  
  // Fallback sur IP (req.ip gère trust proxy configuré dans Express)
  const ip = req.ip || req.connection.remoteAddress;
  
  // Normaliser les IPs IPv6 et IPv4
  let normalizedIP = ip;
  if (ip.includes('::ffff:')) {
    // IPv4 mappée en IPv6 -> extraire l'IPv4
    normalizedIP = ip.replace('::ffff:', '');
  } else if (ip.includes(':')) {
    // IPv6 pure -> garder seulement les 4 premiers segments pour éviter tracking
    const segments = ip.split(':');
    normalizedIP = segments.slice(0, 4).join(':') + '::';
  }
  
  return `${prefix}_ip_${normalizedIP}`;
}

/**
 * Rate limiter pour les endpoints de paiement Stripe (sécurité critique)
 * - Création de checkout/portal : 5 requêtes par minute par utilisateur
 * - Changement/annulation abonnement : 3 requêtes par minute par utilisateur
 */
const stripePaymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requêtes max
  message: {
    error: 'Trop de tentatives de paiement',
    details: 'Veuillez patienter 1 minute avant de réessayer',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'stripe_payment'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Paiement Stripe - User: ${safeUser}`);
    res.status(429).json({
      error: 'Trop de tentatives de paiement',
      details: 'Veuillez patienter 1 minute avant de réessayer',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter strict pour changement/annulation abonnements
 * Plus restrictif car actions critiques
 */
const stripeSubscriptionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requêtes max
  message: {
    error: 'Trop de modifications d\'abonnement',
    details: 'Veuillez patienter 1 minute avant de réessayer',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'stripe_subscription'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Modification abonnement - User: ${safeUser}`);
    res.status(429).json({
      error: 'Trop de modifications d\'abonnement',
      details: 'Veuillez patienter 1 minute avant de réessayer',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter pour les webhooks Stripe
 * Volume élevé autorisé car trafic légitime de Stripe
 */
const stripeWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 webhooks par minute
  message: {
    error: 'Webhook rate limit exceeded',
    details: 'Too many webhook requests'
  },
  standardHeaders: false, // Pas besoin pour les webhooks
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'stripe_webhook'),
  handler: (req, res) => {
    logger.warn(`🚫 Rate limit dépassé - Webhook Stripe - IP: ${req.ip}`);
    res.status(429).json({
      error: 'Webhook rate limit exceeded'
    });
  }
});

/**
 * Rate limiter pour les appels GPT/IA
 * - Chat avec IA : 5 requêtes par minute par utilisateur
 * - Génération de contenu : limitée pour éviter les abus
 */
const gptLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requêtes par minute
  message: {
    error: 'Trop d\'appels à l\'IA',
    details: 'Veuillez patienter 1 minute avant de réessayer',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'gpt'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Appels GPT - User: ${safeUser}`);
    res.status(429).json({
      error: 'Trop d\'appels à l\'IA',
      details: 'Veuillez patienter 1 minute avant de réessayer',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter pour les appels GPT coûteux (génération de programmes)
 * Plus restrictif car utilisation intensive des tokens
 */
const gptHeavyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 requêtes par 5 minutes
  message: {
    error: 'Trop de générations de programmes',
    details: 'Veuillez patienter 5 minutes avant de créer un nouveau programme',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'gpt_heavy'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Génération programme - User: ${safeUser}`);
    res.status(429).json({
      error: 'Trop de générations de programmes',
      details: 'Veuillez patienter 5 minutes avant de créer un nouveau programme',
      retryAfter: 300
    });
  }
});

/**
 * Rate limiter général pour tous les endpoints
 * Limite de base pour éviter les abus
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requêtes par minute
  message: {
    error: 'Trop de requêtes',
    details: 'Veuillez patienter 1 minute avant de réessayer',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'general'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Général - User: ${safeUser} - Route: ${req.path}`);
    res.status(429).json({
      error: 'Trop de requêtes',
      details: 'Veuillez patienter 1 minute avant de réessayer',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter pour les endpoints d'authentification
 * Prévient les attaques par force brute
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives par 15 minutes
  message: {
    error: 'Trop de tentatives de connexion',
    details: 'Veuillez patienter 15 minutes avant de réessayer',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'auth'),
  handler: (req, res) => {
    logger.warn(`🚫 Rate limit dépassé - Authentification - IP: ${req.ip}`);
    res.status(429).json({
      error: 'Trop de tentatives de connexion',
      details: 'Veuillez patienter 15 minutes avant de réessayer',
      retryAfter: 900
    });
  }
});

/**
 * Rate limiter pour l'envoi WhatsApp par programme
 * 1 envoi par programme par heure
 */
const whatsappSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 1, // 1 envoi par programme/heure
  message: {
    error: 'Envoi WhatsApp déjà effectué pour ce programme',
    details: 'Vous devez attendre 1 heure avant de renvoyer le lien de ce programme par WhatsApp',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // req.params.id n'est pas disponible dans app.use() middleware (avant le router)
    // On extrait le programmeId depuis req.path (ex: "/123/send-whatsapp")
    const programmeId = req.path.split('/')[1];
    const baseKey = generateSecureKey(req, 'whatsapp_send');
    return `${baseKey}_programme_${programmeId}`;
  },
  handler: (req, res) => {
    const programmeId = req.path.split('/')[1];
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Envoi WhatsApp - User: ${safeUser} - Programme: ${programmeId}`);
    res.status(429).json({
      error: 'Envoi WhatsApp déjà effectué pour ce programme',
      details: 'Vous devez attendre 1 heure avant de renvoyer le lien de ce programme par WhatsApp',
      retryAfter: 3600
    });
  }
});

/**
 * Rate limiter pour la recherche vectorielle (coûteuse)
 * Même limite que les appels IA car utilise OpenAI + Supabase
 */
const documentSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requêtes par minute (comme gptLimiter)
  message: {
    error: 'Trop de recherches documentaires',
    details: 'Veuillez patienter 1 minute avant de relancer une recherche',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'document_search'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Recherche Documents - User: ${safeUser}`);
    res.status(429).json({
      error: 'Trop de recherches documentaires',
      details: 'Veuillez patienter 1 minute avant de relancer une recherche',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter pour l'envoi WhatsApp via templates (par patient)
 * Protège les patients du spam : max 2 messages/heure par patient
 */
const whatsappTemplatesPatientLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 2, // 2 messages max par patient/heure
  message: {
    error: 'Limite d\'envoi WhatsApp atteinte pour ce patient',
    details: 'Maximum 2 messages WhatsApp par heure par patient',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { patientId } = req.body;
    const baseKey = generateSecureKey(req, 'whatsapp_tpl');
    return `${baseKey}_patient_${patientId}`;
  },
  handler: (req, res) => {
    const { patientId } = req.body;
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - WhatsApp Template Patient - User: ${safeUser} - Patient: ${patientId}`);
    res.status(429).json({
      error: 'Limite d\'envoi WhatsApp atteinte pour ce patient',
      details: 'Maximum 2 messages WhatsApp par heure par patient. Veuillez patienter avant de renvoyer un message à ce patient.',
      retryAfter: 3600
    });
  }
});

/**
 * Rate limiter pour l'envoi WhatsApp via templates (par kiné)
 * Protège contre l'abus massif : max 10 messages/heure tous patients confondus
 */
const whatsappTemplatesKineLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 messages max/heure tous patients confondus
  message: {
    error: 'Limite d\'envoi WhatsApp atteinte',
    details: 'Maximum 10 messages WhatsApp par heure',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'whatsapp_tpl_kine'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - WhatsApp Template Kiné - User: ${safeUser}`);
    res.status(429).json({
      error: 'Limite d\'envoi WhatsApp atteinte',
      details: 'Vous avez atteint la limite de 10 messages WhatsApp par heure. Veuillez patienter avant de renvoyer des messages.',
      retryAfter: 3600
    });
  }
});

/**
 * Rate limiter pour les exports RGPD (très protégé)
 * 1 export par heure par utilisateur - données sensibles
 */
const rgpdExportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 1, // 1 export par heure
  message: {
    error: 'Export de données limité',
    details: 'Un seul export de données RGPD par heure autorisé',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'rgpd_export'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Export RGPD - User: ${safeUser}`);
    res.status(429).json({
      error: 'Export de données limité',
      details: 'Un seul export de données RGPD par heure autorisé. Veuillez patienter 60 minutes.',
      code: 'EXPORT_RATE_LIMITED',
      retryAfter: 3600
    });
  }
});

/**
 * Rate limiter pour la suppression de compte (ultra protégé)
 * 3 tentatives par jour pour gérer les erreurs, mais reste restrictif
 */
const rgpdDeleteLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 heures
  max: 3, // 3 tentatives par jour
  message: {
    error: 'Tentatives de suppression limitées',
    details: 'Maximum 3 tentatives de suppression de compte par jour',
    retryAfter: 86400
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'rgpd_delete'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Suppression compte - User: ${safeUser}`);
    res.status(429).json({
      error: 'Tentatives de suppression limitées',
      details: 'Limite de 3 tentatives de suppression de compte atteinte. Essayez demain ou contactez le support.',
      code: 'DELETE_RATE_LIMITED',
      retryAfter: 86400
    });
  }
});

/**
 * Rate limiter pour l'upload de vidéos exercices
 * 3 uploads par minute max - empêche saturation CPU/disque
 */
const videoUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 uploads max/minute
  message: {
    error: 'Trop d\'uploads de vidéos',
    details: 'Maximum 3 vidéos par minute. Veuillez patienter avant de réessayer.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateSecureKey(req, 'video_upload'),
  handler: (req, res) => {
    const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
    logger.warn(`🚫 Rate limit dépassé - Upload vidéo - User: ${safeUser}`);
    res.status(429).json({
      error: 'Trop d\'uploads de vidéos',
      details: 'Maximum 3 vidéos par minute. Veuillez patienter avant de réessayer.',
      retryAfter: 60
    });
  }
});

/**
 * Middleware pour afficher les informations de rate limiting
 * Utile pour le debugging
 */
const rateLimitLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Logger seulement si rate limit info disponible
    if (res.get('X-RateLimit-Limit')) {
      const safeUser = req.uid ? sanitizeUID(req.uid) : sanitizeIP(req.ip);
      logger.warn(`📊 Rate Limit - ${req.method} ${req.path} - User: ${safeUser} - ${res.get('X-RateLimit-Remaining')}/${res.get('X-RateLimit-Limit')} remaining`);
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  stripePaymentLimiter,
  stripeSubscriptionLimiter,
  stripeWebhookLimiter,
  gptLimiter,
  gptHeavyLimiter,
  generalLimiter,
  authLimiter,
  whatsappSendLimiter,
  whatsappTemplatesPatientLimiter,
  whatsappTemplatesKineLimiter,
  documentSearchLimiter,
  rgpdExportLimiter,
  rgpdDeleteLimiter,
  videoUploadLimiter,
  rateLimitLogger
};