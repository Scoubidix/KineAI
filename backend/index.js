require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const prismaService = require('./services/prismaService');

// Import du nouveau système d'archivage
const { startProgramCleanupCron } = require('./utils/chatCleanup');

// Import des routes existantes
const kinesRoutes = require('./routes/kines');
const patientsRoutes = require('./routes/patients');
const programmeRoutes = require('./routes/programmes');
const programmeAdminRoutes = require('./routes/programmeAdmin');
const exerciceRoutes = require('./routes/exercices');
const testOpenAIRoutes = require('./routes/testOpenAI');
const patientChatRoutes = require('./routes/patientChat');
const chatKineRoutes = require('./routes/chatKine'); // Route existante améliorée

// NOUVELLES ROUTES VECTORIELLES
const documentsRoutes = require('./routes/documents');

// NOUVEAU : Import du webhook WhatsApp
const { router: whatsappWebhook } = require('./routes/webhook/whatsapp');

// 🔔 NOUVEAU : Import des routes notifications
const notificationRoutes = require('./routes/notifications');

// 💳 NOUVEAU : Import des routes Stripe existantes
const stripeWebhookRoutes = require('./routes/webhook/stripe');

// 💳 NOUVEAU PAYWALL : Import des nouvelles routes paywall
const subscriptionRoutes = require('./routes/subscription');
const checkoutRoutes = require('./routes/checkout');
const plansRoutes = require('./routes/plans');

const app = express();
const PORT = process.env.PORT || 8080;

// ========== CONFIGURATION CORS ==========
const corsOptions = {
  origin: function (origin, callback) {
    // Autorise les requêtes sans origin (apps mobiles, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://monassistantkine.vercel.app',
      'http://localhost:3000',  // Pour ton HTML de test
      'http://localhost:3001',  // Pour ton frontend principal
      'file://'  // Pour les fichiers HTML ouverts directement
    ];
    
    // Vérification spéciale pour les fichiers locaux
    if (origin.startsWith('file://')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`❌ CORS: Origine non autorisée: ${origin}`);
      callback(new Error('Non autorisé par CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true, // Important pour les cookies et JWT
  optionsSuccessStatus: 200 // Pour les anciens navigateurs
};

// 💳 IMPORTANT : Webhook Stripe AVANT les middlewares JSON
// Le webhook Stripe a besoin du raw body, donc on le place avant express.json()
app.use('/webhook', stripeWebhookRoutes);

// Middleware - Augmenté pour les PDFs
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ========== ROUTES DE TEST - POUR DEBUG ==========

// Health check simple
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'KineAI Backend with Vector DB + WhatsApp + Notifications + Stripe + Paywall + 4 IA Spécialisées',
    port: PORT,
    features: [
      'Patient Chat',
      'Programme Management', 
      'Auto Archive System',
      '🤖 4 IA Kinés Spécialisées (Basique, Biblio, Clinique, Administrative)',
      'PDF Upload & Vector Search',
      'WhatsApp Integration',
      '🔔 Notification System',
      '💳 Stripe Subscriptions',
      '🔒 Paywall System'
    ]
  });
});

// Test connexion base de données
app.get('/api/test-db', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    
    const kineCount = await prisma.kine.count();
    
    res.json({
      message: 'Database connection successful',
      timestamp: new Date().toISOString(),
      kineCount: kineCount,
      database: 'PostgreSQL + Prisma + Supabase Vector + Notifications + Stripe + Paywall + 4 Tables IA'
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      error: 'Database connection failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test variables d'environnement
app.get('/api/test-env', (req, res) => {
  res.json({
    message: 'Environment check',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      hasFirebaseConfig: !!process.env.FIREBASE_PROJECT_ID,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasJWT: !!process.env.JWT_SECRET_PATIENT,
      hasDatabaseURL: !!process.env.DATABASE_URL,
      frontendURL: process.env.FRONTEND_URL,
      hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_API_KEY),
      // Variables WhatsApp
      hasWhatsApp: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_ID),
      whatsappConfigured: !!process.env.WHATSAPP_WEBHOOK_TOKEN,
      // 💳 NOUVEAU : Variables Stripe
      hasStripe: !!process.env.STRIPE_SECRET_KEY,
      hasStripeWebhook: !!process.env.STRIPE_ENDPOINT_SECRET,
      stripeConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ENDPOINT_SECRET),
      // 🔒 NOUVEAU PAYWALL : Variables système paywall
      paywallConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.FRONTEND_URL)
    }
  });
});

// NOUVEAU : Test de la base vectorielle
app.get('/api/test-vector', async (req, res) => {
  try {
    // Test de connexion Supabase seulement si les services sont disponibles
    let vectorStatus = { connected: false, error: 'Services non disponibles' };
    
    try {
      const { supabase } = require('./services/supabaseClient');
      
      const { count, error } = await supabase
        .from('documents_kine')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      
      vectorStatus = {
        connected: true,
        url: process.env.SUPABASE_URL,
        documentsCount: count || 0
      };
    } catch (serviceError) {
      vectorStatus = {
        connected: false,
        error: serviceError.message
      };
    }

    res.json({
      message: vectorStatus.connected ? 'Vector database connection successful' : 'Vector database connection failed',
      timestamp: new Date().toISOString(),
      supabase: vectorStatus
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Vector database test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// NOUVEAU : Test WhatsApp
app.get('/api/test-whatsapp', (req, res) => {
  res.json({
    message: 'WhatsApp configuration check',
    timestamp: new Date().toISOString(),
    whatsapp: {
      hasAccessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
      hasPhoneId: !!process.env.WHATSAPP_PHONE_ID,
      hasWebhookToken: !!process.env.WHATSAPP_WEBHOOK_TOKEN,
      webhookUrl: '/webhook/whatsapp',
      configured: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_WEBHOOK_TOKEN)
    }
  });
});

// 🔔 NOUVEAU : Test notifications
app.get('/api/test-notifications', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    
    // Compter les notifications dans la DB
    const notificationCount = await prisma.notification.count();
    const notificationTypes = await prisma.notification.groupBy({
      by: ['type'],
      _count: { type: true }
    });

    res.json({
      message: 'Notification system check',
      timestamp: new Date().toISOString(),
      notifications: {
        total: notificationCount,
        byType: notificationTypes.reduce((acc, item) => {
          acc[item.type] = item._count.type;
          return acc;
        }, {}),
        endpoints: [
          'GET /api/notifications',
          'GET /api/notifications/unread-count',
          'PUT /api/notifications/:id/read',
          'PUT /api/notifications/mark-all-read'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Notification system test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 💳 NOUVEAU : Test Stripe
app.get('/api/test-stripe', (req, res) => {
  res.json({
    message: 'Stripe configuration check',
    timestamp: new Date().toISOString(),
    stripe: {
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasWebhookSecret: !!process.env.STRIPE_ENDPOINT_SECRET,
      hasFrontendUrl: !!process.env.FRONTEND_URL,
      webhookEndpoint: '/webhook/stripe',
      configured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ENDPOINT_SECRET),
      endpoints: [
        'POST /webhook/stripe',
        'GET /api/kine/subscription',
        'GET /api/kine/usage',
        'POST /api/stripe/create-checkout',
        'POST /api/stripe/create-portal',
        'GET /api/plans/PIONNIER/availability'
      ]
    }
  });
});

// 🔒 NOUVEAU : Test Paywall
app.get('/api/test-paywall', (req, res) => {
  res.json({
    message: 'Paywall system check',
    timestamp: new Date().toISOString(),
    paywall: {
      configured: !!(process.env.STRIPE_SECRET_KEY && process.env.FRONTEND_URL),
      endpoints: [
        'GET /api/kine/subscription',
        'GET /api/kine/usage',
        'GET /api/kine/limits',
        'POST /api/kine/usage/refresh',
        'GET /api/plans/PIONNIER/availability',
        'GET /api/plans/PIONNIER/remaining-slots',
        'GET /api/plans/stats',
        'POST /api/stripe/create-checkout',
        'POST /api/stripe/create-portal'
      ],
      features: [
        'Plan FREE protection',
        'Subscription status check',
        'Usage tracking (chatbots)',
        'Plan Pionnier limitation (100 slots)',
        'Feature gates by plan',
        'Stripe checkout integration'
      ]
    }
  });
});

// 🤖 NOUVEAU : Test des 4 IA Spécialisées
app.get('/api/test-ia', (req, res) => {
  res.json({
    message: '4 IA Spécialisées system check',
    timestamp: new Date().toISOString(),
    iaSystem: {
      configured: !!process.env.OPENAI_API_KEY,
      tables: [
        'chat_ia_basique',
        'chat_ia_biblio', 
        'chat_ia_clinique',
        'chat_ia_administrative'
      ],
      endpoints: {
        iaBasique: 'POST /api/chat/kine/ia-basique',
        iaBiblio: 'POST /api/chat/kine/ia-biblio',
        iaClinique: 'POST /api/chat/kine/ia-clinique',
        iaAdministrative: 'POST /api/chat/kine/ia-administrative',
        iaStatus: 'GET /api/chat/kine/ia-status',
        historyBasique: 'GET /api/chat/kine/history-basique',
        historyBiblio: 'GET /api/chat/kine/history-biblio',
        historyClinique: 'GET /api/chat/kine/history-clinique',
        historyAdministrative: 'GET /api/chat/kine/history-administrative',
        allHistory: 'GET /api/chat/kine/all-history',
        clearHistoryBasique: 'DELETE /api/chat/kine/history-basique',
        clearAllHistory: 'DELETE /api/chat/kine/all-history'
      },
      features: [
        'IA Basique - Assistant conversationnel général',
        'IA Bibliographique - Références scientifiques',
        'IA Clinique - Aide diagnostic et traitement',
        'IA Administrative - Gestion cabinet et réglementation',
        'Historiques séparés par IA',
        'Recherche vectorielle intégrée',
        'Prompts spécialisés par domaine'
      ]
    }
  });
});

// NOUVEAU : Test CORS
app.get('/api/test-cors', (req, res) => {
  res.json({
    message: 'CORS test successful',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'No origin header',
    userAgent: req.headers['user-agent'] || 'No user agent',
    headers: req.headers,
    corsConfig: {
      allowedOrigins: [
        'https://monassistantkine.vercel.app',
        'http://localhost:3001',
        'http://localhost:3000'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    }
  });
});

// Debug base de données
app.get('/api/debug-db', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    
    const dbInfo = await prisma.$queryRaw`SELECT current_database(), current_schema(), version()`;
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    res.json({
      database: dbInfo,
      tables: tables,
      tableCount: tables.length,
      databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@'),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== NOUVELLES ROUTES DEBUG PRISMA ==========

// Route pour diagnostiquer les imports multiples de Prisma
app.get('/debug/prisma-imports', (req, res) => {
  const stats = prismaService.getConnectionStats();
  
  // Lister tous les modules chargés qui contiennent "prisma"
  const prismaModules = Object.keys(require.cache)
    .filter(path => path.includes('prisma') || path.includes('Prisma'))
    .map(path => ({
      path: path.replace(process.cwd(), ''), // Chemin relatif
      loaded: !!require.cache[path],
      loadTime: require.cache[path]?.loaded ? 'loaded' : 'loading'
    }));

  // Compter les services prisma chargés
  const prismaServiceModules = Object.keys(require.cache)
    .filter(path => path.includes('prismaService'))
    .map(path => path.replace(process.cwd(), ''));

  res.json({
    stats,
    prismaModules: prismaModules.slice(0, 10), // Limite à 10 pour lisibilité
    prismaServiceModules,
    moduleLoadOrder: prismaModules.length,
    warning: stats.creationCount > 1 ? '⚠️ MULTIPLE INSTANCES DETECTED!' : '✅ OK - Single instance',
    recommendation: stats.creationCount > 1 ? 
      'Vérifiez vos imports: utilisez toujours le même chemin relatif' : 
      'Configuration correcte'
  });
});

// Route pour surveiller les connexions DB en temps réel
app.get('/debug/connections', async (req, res) => {
  try {
    const stats = prismaService.getConnectionStats();
    const health = await prismaService.healthCheck();
    
    res.json({
      prisma: stats,
      health,
      server: {
        uptime: Math.round(process.uptime()) + 's',
        pid: process.pid,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Route pour forcer le nettoyage des connexions
app.post('/debug/cleanup-connections', async (req, res) => {
  try {
    console.log('🧹 Nettoyage forcé des connexions demandé via API');
    await prismaService.forceDisconnect();
    
    // Petit délai pour laisser les connexions se fermer
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newStats = prismaService.getConnectionStats();
    
    res.json({ 
      success: true, 
      message: 'Connexions nettoyées et réinitialisées',
      before: 'connexions fermées',
      after: newStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Route pour lister tous les imports de votre projet
app.get('/debug/all-imports', (req, res) => {
  const allModules = Object.keys(require.cache)
    .filter(path => path.includes(process.cwd())) // Seulement votre projet
    .map(path => path.replace(process.cwd(), ''))
    .sort();

  const prismaRelated = allModules.filter(path => 
    path.includes('prisma') || 
    path.includes('database') || 
    path.includes('db')
  );

  res.json({
    totalModules: allModules.length,
    prismaRelated,
    warning: prismaRelated.length > 3 ? 
      '⚠️ Beaucoup de modules Prisma chargés' : 
      '✅ Imports normaux'
  });
});

// ========== ROUTES PRINCIPALES ==========

// NOUVEAU : Webhook WhatsApp
app.use('/webhook/whatsapp', whatsappWebhook);

// 🔔 NOUVEAU : Routes notifications
app.use('/api/notifications', notificationRoutes);

// 💳 NOUVEAU PAYWALL : Routes système paywall
app.use('/api/kine', subscriptionRoutes);  // /api/kine/subscription, /api/kine/usage, etc.
app.use('/api/stripe', checkoutRoutes);    // /api/stripe/create-checkout, etc.
app.use('/api/plans', plansRoutes);        // /api/plans/PIONNIER/availability, etc.

// Routes existantes
app.use('/kine', kinesRoutes);
app.use('/patients', patientsRoutes);
app.use('/programmes', programmeRoutes);
app.use('/admin/programmes', programmeAdminRoutes);
app.use('/exercices', exerciceRoutes);
app.use('/api/test', testOpenAIRoutes);
app.use('/api/patient', patientChatRoutes);
app.use('/api/chat/kine', chatKineRoutes); // ✅ Route existante avec les 4 nouvelles IA

// NOUVELLE ROUTE VECTORIELLE
app.use('/api/documents', documentsRoutes);

// Routes de test pour le système d'archivage
app.get('/test-archive-finished', async (req, res) => {
  const { manualArchiveTest } = require('./utils/chatCleanup');
  try {
    const result = await manualArchiveTest();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/test-cleanup-archived', async (req, res) => {
  const { manualCleanupTest } = require('./utils/chatCleanup');
  try {
    const result = await manualCleanupTest();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 NOUVEAU : Route de test pour les notifications de programmes
app.get('/test-notifications-programs', async (req, res) => {
  const { manualNotificationsTest } = require('./utils/chatCleanup');
  try {
    const result = await manualNotificationsTest();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route racine mise à jour
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur l API KineAI - 4 IA Spécialisées + Base Vectorielle Supabase + WhatsApp + Notifications + Stripe + Paywall',
    timestamp: new Date().toISOString(),
    version: '3.0', // Version mise à jour avec 4 IA
    status: 'running',
    features: [
      'Patient Chat',
      'Programme Management', 
      'Auto Archive System',
      '🤖 4 IA Kinés Spécialisées (Basique, Biblio, Clinique, Administrative)',
      'PDF Upload & Vector Search',
      'Semantic Knowledge Base',
      'WhatsApp Business Integration',
      '🔔 Real-time Notification System',
      '💳 Stripe Subscription Management',
      '🔒 Paywall & Feature Gates System'
    ],
    endpoints: {
      // 🤖 NOUVEAUX ENDPOINTS 4 IA SPÉCIALISÉES
      iaBasique: '/api/chat/kine/ia-basique',
      iaBiblio: '/api/chat/kine/ia-biblio',
      iaClinique: '/api/chat/kine/ia-clinique',
      iaAdministrative: '/api/chat/kine/ia-administrative',
      iaStatus: '/api/chat/kine/ia-status',
      iaTest: '/api/test-ia',
      // HISTORIQUES IA
      historyBasique: '/api/chat/kine/history-basique',
      historyBiblio: '/api/chat/kine/history-biblio',
      historyClinique: '/api/chat/kine/history-clinique',
      historyAdministrative: '/api/chat/kine/history-administrative',
      allHistory: '/api/chat/kine/all-history',
      // SUPPRESSION HISTORIQUES
      clearHistoryBasique: '/api/chat/kine/history-basique [DELETE]',
      clearAllHistory: '/api/chat/kine/all-history [DELETE]',
      // AUTRES ENDPOINTS
      documents: '/api/documents',
      upload: '/api/documents/upload',
      search: '/api/documents/search',
      vectorTest: '/api/test-vector',
      whatsappTest: '/api/test-whatsapp',
      whatsappWebhook: '/webhook/whatsapp',
      corsTest: '/api/test-cors',
      // 🔔 ENDPOINTS NOTIFICATIONS
      notifications: '/api/notifications',
      notificationsUnreadCount: '/api/notifications/unread-count',
      notificationsStats: '/api/notifications/stats',
      notificationsTest: '/api/test-notifications',
      // 💳 ENDPOINTS STRIPE
      stripeTest: '/api/test-stripe',
      stripeWebhook: '/webhook/stripe',
      subscription: '/api/kine/subscription',
      usage: '/api/kine/usage',
      // 🔒 ENDPOINTS PAYWALL
      paywallTest: '/api/test-paywall',
      plansAvailability: '/api/plans/PIONNIER/availability',
      stripeCheckout: '/api/stripe/create-checkout',
      stripePortal: '/api/stripe/create-portal',
      // ENDPOINTS DEBUG
      debugPrisma: '/debug/prisma-imports',
      debugConnections: '/debug/connections',
      cleanupConnections: '/debug/cleanup-connections [POST]'
    }
  });
});

// Démarrage du système d'archivage automatique
startProgramCleanupCron();

// Gestion gracieuse de l'arrêt
process.on('SIGINT', async () => {
  console.log('🛑 Arrêt du serveur...');
  await prismaService.disconnect();
  process.exit(0);
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 KineAI Backend running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 IA Basique: /api/chat/kine/ia-basique`);
  console.log(`🤖 IA Bibliographique: /api/chat/kine/ia-biblio`);
  console.log(`🤖 IA Clinique: /api/chat/kine/ia-clinique`);
  console.log(`🤖 IA Administrative: /api/chat/kine/ia-administrative`);
  console.log(`🤖 Statut 4 IA: /api/chat/kine/ia-status`);
  console.log(`🤖 Test 4 IA: /api/test-ia`);
  console.log(`📄 Documents API: /api/documents`);
  console.log(`📊 Vector Test: /api/test-vector`);
  console.log(`📱 WhatsApp Test: /api/test-whatsapp`);
  console.log(`📱 WhatsApp Webhook: /webhook/whatsapp`);
  console.log(`🔒 CORS Test: /api/test-cors`);
  console.log(`🔔 Notifications: /api/notifications`);
  console.log(`🔔 Test Notifications: /api/test-notifications`);
  console.log(`💳 Stripe Test: /api/test-stripe`);
  console.log(`💳 Stripe Webhook: /webhook/stripe`);
  console.log(`🔒 Paywall Subscription: /api/kine/subscription`);
  console.log(`🔒 Paywall Usage: /api/kine/usage`);
  console.log(`🔒 Plans Availability: /api/plans/PIONNIER/availability`);
  console.log(`💳 Stripe Checkout: /api/stripe/create-checkout`);
  console.log(`🔒 Paywall Test: /api/test-paywall`);
  console.log(`🔍 Debug Prisma: /debug/prisma-imports`);
  console.log(`📊 Debug Connections: /debug/connections`);
  console.log(`🔒 CORS configuré pour: https://monassistantkine.vercel.app, localhost:3000, localhost:3001, fichiers locaux`);
});