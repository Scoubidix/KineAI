// services/prismaService.js - Version Production
const { PrismaClient } = require('@prisma/client');

// Instance globale unique
let prismaInstance = null;
let isConnected = false;
let lastActivity = null;
let cleanupInterval = null;
let creationCount = 0;

// Variable d'environnement pour debug
const DEBUG_LOGS = process.env.NODE_ENV === 'development';

class PrismaService {
  
  getInstance() {
    if (!prismaInstance) {
      creationCount++;
      
      // Log minimal en production
      console.log(`🔧 Connexion Prisma #${creationCount} créée`);
      
      // Debug détaillé seulement en dev
      if (DEBUG_LOGS) {
        console.log('📍 Créée depuis:', new Error().stack.split('\n')[2]?.trim());
      }
      
      const dbUrl = new URL(process.env.DATABASE_URL);
      dbUrl.searchParams.set('connection_limit', '1');
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
      this.startCleanupTimer();

      // Event listeners pour fermeture propre
      ['SIGINT', 'SIGTERM', 'SIGQUIT', 'beforeExit'].forEach(event => {
        if (!process.listenerCount(event)) {
          process.on(event, async () => {
            console.log(`🛑 Arrêt ${event} - fermeture Connexion (${creationCount})`);
            await this.forceDisconnect();
            if (event !== 'beforeExit') process.exit(0);
          });
        }
      });

    } else if (DEBUG_LOGS) {
      console.log(`♻️ Réutilisation connexion #${creationCount}`);
    }
    
    this.markActivity();
    return prismaInstance;
  }

  markActivity() {
    lastActivity = Date.now();
    // Log détaillé seulement en debug
    if (DEBUG_LOGS) {
      console.log('🔄 Activité:', new Date(lastActivity).toISOString());
    }
  }

  startCleanupTimer() {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(async () => {
      const inactiveTime = Date.now() - (lastActivity || 0);
      const maxInactiveTime = 5 * 60 * 1000; // 5 minutes

      // Log check seulement en debug
      if (DEBUG_LOGS) {
        console.log(`⏰ Inactivité: ${Math.round(inactiveTime/1000)}s / ${maxInactiveTime/1000}s max`);
      }

      if (inactiveTime > maxInactiveTime && isConnected) {
        console.log(`🧹 Fermeture automatique Connexion (${creationCount})`);
        await this.forceDisconnect();
      }
    }, 2 * 60 * 1000); // Check toutes les 2 minutes

    if (DEBUG_LOGS) {
      console.log('⏰ Timer de nettoyage démarré');
    }
  }

  stopCleanupTimer() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }

  isConnected() {
    return isConnected && prismaInstance !== null;
  }

  async forceDisconnect() {
    this.stopCleanupTimer();

    if (prismaInstance && isConnected) {
      console.log(`🔌 Fermeture connexion Prisma (${creationCount})...`);
      try {
        await Promise.race([
          prismaInstance.$disconnect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout disconnect')), 3000)
          )
        ]);
        console.log(`🔌 Connexion ${creationCount} fermée`);
      } catch (error) {
        console.error(`❌ Erreur fermeture Connexion ${creationCount}:`, error.message);
      } finally {
        prismaInstance = null;
        isConnected = false;
        lastActivity = null;
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
      console.error('❌ Erreur transaction:', error.message);
      throw error;
    }
  }

  async executeWithTempConnection(callback) {
    // Logs minimalistes
    if (DEBUG_LOGS) {
      console.log('🔄 executeWithTempConnection');
    }
    
    const prisma = this.getInstance();
    this.markActivity();
    
    try {
      const result = await callback(prisma);
      this.markActivity();
      
      if (DEBUG_LOGS) {
        console.log('✅ executeWithTempConnection terminé');
      }
      
      return result;
    } catch (error) {
      console.error('❌ Erreur executeWithTempConnection:', error.message);
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
        console.error('❌ Health check failed:', error.message);
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
      creationCount: creationCount,
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
      inactiveTime: Math.round(inactiveTime / 1000) + 's',
      hasCleanupTimer: cleanupInterval !== null,
      timestamp: new Date().toISOString()
    };
  }
}

const prismaService = new PrismaService();
module.exports = prismaService;