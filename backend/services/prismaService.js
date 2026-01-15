// services/prismaService.js - Version Production
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

// Instance globale unique
let prismaInstance = null;
let isConnected = false;
let lastActivity = null;
let totalCreations = 0;  // Total depuis démarrage serveur
let currentConnectionId = null;  // ID de la connexion actuelle

// Variable d'environnement pour debug
const DEBUG_LOGS = process.env.NODE_ENV === 'development';

class PrismaService {
  
  getInstance() {
    if (!prismaInstance) {
      totalCreations++;
      currentConnectionId = totalCreations;
      
      // Log avec vraie info
      logger.warn("🔧 Connexion DB créée - Total:", totalCreations);
      
      // Debug détaillé seulement en dev
      if (DEBUG_LOGS) {
        logger.debug('📍 Stack:', new Error().stack.split('\n')[2]?.trim());
      }
      
      const dbUrl = new URL(process.env.DATABASE_URL);
      dbUrl.searchParams.set('connection_limit', '2');  // 2 connexions pour gérer reconnexion GCP
      dbUrl.searchParams.set('pool_timeout', '20');
      dbUrl.searchParams.set('connect_timeout', '15');
      
      prismaInstance = new PrismaClient({
        log: ['error', 'warn'], // Seulement erreurs et warnings
        datasources: {
          db: {
            url: dbUrl.toString()
          }
        }
      });

      isConnected = true;
      lastActivity = Date.now();

      // Event listeners pour fermeture propre
      ['SIGINT', 'SIGTERM', 'SIGQUIT', 'beforeExit'].forEach(event => {
        if (!process.listenerCount(event)) {
          process.on(event, async () => {
            logger.warn(`🛑 Arrêt ${event} - fermeture connexion DB`);
            await this.forceDisconnect();
            if (event !== 'beforeExit') process.exit(0);
          });
        }
      });

    } else if (DEBUG_LOGS) {
      logger.debug(`♻️ Réutilisation connexion (${currentConnectionId})`);
    }
    
    this.markActivity();
    return prismaInstance;
  }

  markActivity() {
    lastActivity = Date.now();
    // Log détaillé seulement en debug
    if (DEBUG_LOGS) {
      logger.debug('🔄 Activité:', new Date(lastActivity).toISOString());
    }
  }

  // Timer de cleanup supprimé - GCP Cloud SQL gère les connexions zombies via TCP keepalives

  isConnected() {
    return isConnected && prismaInstance !== null;
  }

  async forceDisconnect() {
    if (prismaInstance && isConnected) {
      logger.info(`🔌 Fermeture connexion DB...`);
      try {
        await Promise.race([
          prismaInstance.$disconnect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout disconnect')), 3000)
          )
        ]);
        logger.info(`🔌 Connexion DB fermée`);
      } catch (error) {
        logger.error(`❌ Erreur fermeture connexion DB:`, error.message);
      } finally {
        prismaInstance = null;
        isConnected = false;
        lastActivity = null;
        currentConnectionId = null;  // Reset de l'ID
      }
    }
  }

  async disconnect() {
    await this.forceDisconnect();
  }

  async executeInTransaction(callback, options = {}) {
    const prisma = this.getInstance();
    this.markActivity();
    
    try {
      const result = await prisma.$transaction(callback, {
        maxWait: 5000,
        timeout: 10000,
        ...options
      });
      this.markActivity();
      return result;
    } catch (error) {
      logger.error('❌ Erreur transaction:', error.message);
      throw error;
    }
  }

  async executeWithTempConnection(callback) {
    // Logs minimalistes
    if (DEBUG_LOGS) {
      logger.debug('🔄 executeWithTempConnection');
    }
    
    const prisma = this.getInstance();
    this.markActivity();
    
    try {
      const result = await callback(prisma);
      this.markActivity();
      
      if (DEBUG_LOGS) {
        logger.debug('✅ executeWithTempConnection terminé');
      }
      
      return result;
    } catch (error) {
      logger.error('❌ Erreur executeWithTempConnection:', error.message);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const prisma = this.getInstance();
      
      const healthPromise = prisma.$queryRaw`SELECT 1`;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 3000)
      );
      
      await Promise.race([healthPromise, timeoutPromise]);
      this.markActivity();
      return { status: 'healthy' };
      
    } catch (error) {
      // Log warning seulement pour les vraies erreurs
      if (!error.message.includes('timeout') && !error.message.includes('pool')) {
        logger.error('❌ Health check failed:', error.message);
        await this.forceDisconnect();
        return { status: 'reconnected' };
      }
      
      return { status: 'busy', message: 'Connection busy' };
    }
  }

  getConnectionStats() {
    const now = Date.now();
    const inactiveTime = lastActivity ? now - lastActivity : 0;

    return {
      isConnected: this.isConnected(),
      hasInstance: prismaInstance !== null,
      totalCreations: totalCreations,
      currentConnectionId: currentConnectionId,
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
      inactiveTime: Math.round(inactiveTime / 1000) + 's',
      timestamp: new Date().toISOString()
    };
  }
}

const prismaService = new PrismaService();
module.exports = prismaService;