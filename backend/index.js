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

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware - Augmenté pour les PDFs
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ========== ROUTES DE TEST - POUR DEBUG ==========

// Health check simple
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'KineAI Backend with Vector DB',
    port: PORT,
    features: [
      'Patient Chat',
      'Programme Management', 
      'Auto Archive System',
      'Kiné Personal AI Assistant Enhanced',
      'PDF Upload & Vector Search'
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
      database: 'PostgreSQL + Prisma + Supabase Vector'
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
      hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_API_KEY)
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

// Routes existantes
app.use('/kine', kinesRoutes);
app.use('/patients', patientsRoutes);
app.use('/programmes', programmeRoutes);
app.use('/admin/programmes', programmeAdminRoutes);
app.use('/exercices', exerciceRoutes);
app.use('/api/test', testOpenAIRoutes);
app.use('/api/patient', patientChatRoutes);
app.use('/api/chat/kine', chatKineRoutes); // Route existante avec nouvelles fonctionnalités

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

// Route racine mise à jour
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur l API KineAI - Base Vectorielle Supabase Intégrée',
    timestamp: new Date().toISOString(),
    version: '2.2',
    status: 'running',
    features: [
      'Patient Chat',
      'Programme Management', 
      'Auto Archive System',
      'Kiné Personal AI Assistant Enhanced', 
      'PDF Upload & Vector Search',
      'Semantic Knowledge Base'
    ],
    endpoints: {
      chat: '/api/chat/kine/message',
      chatEnhanced: '/api/chat/kine/message-enhanced',
      documents: '/api/documents',
      upload: '/api/documents/upload',
      search: '/api/documents/search',
      vectorTest: '/api/test-vector',
      // NOUVEAUX ENDPOINTS DEBUG
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
  console.log(`🤖 Chat Kiné: /api/chat/kine/message`);
  console.log(`🤖 Chat Enhanced: /api/chat/kine/message-enhanced`);
  console.log(`📄 Documents API: /api/documents`);
  console.log(`📊 Vector Test: /api/test-vector`);
  console.log(`🔍 Debug Prisma: /debug/prisma-imports`);
  console.log(`📊 Debug Connections: /debug/connections`);
});