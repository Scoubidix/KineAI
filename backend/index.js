require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PrismaClient } = require('@prisma/client');

// Import du nouveau système d'archivage
const { startProgramCleanupCron } = require('./utils/chatCleanup');

// Import des routes
const kinesRoutes = require('./routes/kines');
const patientsRoutes = require('./routes/patients');
const programmeRoutes = require('./routes/programmes');
const programmeAdminRoutes = require('./routes/programmeAdmin'); // NOUVEAU
const exerciceRoutes = require('./routes/exercices');
const testOpenAIRoutes = require('./routes/testOpenAI');
const patientChatRoutes = require('./routes/patientChat');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8080; // Changé pour Cloud Run

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ========== ROUTES DE TEST - POUR DEBUG ==========

// Health check simple
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'KineAI Backend',
    port: PORT
  });
});

// Test connexion base de données
app.get('/api/test-db', async (req, res) => {
  try {
    // Test simple : compte le nombre de kinés
    const kineCount = await prisma.kine.count();
    
    res.json({
      message: 'Database connection successful',
      timestamp: new Date().toISOString(),
      kineCount: kineCount,
      database: 'PostgreSQL + Prisma'
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

// Test variables d'environnement (sans révéler les secrets)
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
      frontendURL: process.env.FRONTEND_URL
    }
  });
});

// Debug base de données - Comparaison local vs Cloud Run
app.get('/api/debug-db', async (req, res) => {
  try {
    // Vérifier la connexion
    const dbInfo = await prisma.$queryRaw`SELECT current_database(), current_schema(), version()`;
    
    // Lister toutes les tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    res.json({
      database: dbInfo,
      tables: tables,
      tableCount: tables.length,
      databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@'), // Masque le mot de passe
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== ROUTES PRINCIPALES ==========

app.use('/kine', kinesRoutes);
app.use('/patients', patientsRoutes);
app.use('/programmes', programmeRoutes);
app.use('/admin/programmes', programmeAdminRoutes); // NOUVEAU - Routes admin
app.use('/exercices', exerciceRoutes);
app.use('/api/test', testOpenAIRoutes);
app.use('/api/patient', patientChatRoutes);

// Routes de test pour le système d'archivage (à supprimer en production)
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

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur l API KineAI - Système d\'archivage des programmes activé',
    timestamp: new Date().toISOString(),
    version: '2.0',
    status: 'running'
  });
});

// Démarrage du système d'archivage automatique
startProgramCleanupCron();

// Gestion gracieuse de l'arrêt
process.on('SIGINT', async () => {
  console.log('🛑 Arrêt du serveur...');
  await prisma.$disconnect();
  process.exit(0);
});

// Démarrage du serveur - IMPORTANT : 0.0.0.0 pour Cloud Run
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 KineAI Backend running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});