// services/prismaService.js
console.log('📦 CHARGEMENT du module prismaService.js');

const { PrismaClient } = require('@prisma/client');

// Instance globale unique - EN DEHORS de toute classe
let prismaInstance = null;
let isConnected = false;
let lastActivity = null;
let cleanupInterval = null;

// Compteur pour détecter les créations multiples
let creationCount = 0;

class PrismaService {
  
  getInstance() {
    if (!prismaInstance) {
      creationCount++;
      console.log(`🔧 CREATION connexion Prisma #${creationCount} - GLOBALE`);
      console.log('📍 Créée depuis:', new Error().stack.split('\n')[2]?.trim());
      
      // URL avec paramètres de connexion optimisés pour UNE seule connexion
      const dbUrl = new URL(process.env.DATABASE_URL);
      dbUrl.searchParams.set('connection_limit', '1');        // UNE seule connexion TCP
      dbUrl.searchParams.set('pool_timeout', '20');          // Timeout plus généreux pour éviter les erreurs
      dbUrl.searchParams.set('connect_timeout', '15');       // Connexion plus généreuse
      
      prismaInstance = new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
          db: {
            url: dbUrl.toString()
          }
        }
      });

      isConnected = true;
      lastActivity = Date.now();

      // Nettoyage automatique toutes les 2 minutes
      this.startCleanupTimer();

      // Event listeners pour Cloud Run
      ['SIGINT', 'SIGTERM', 'SIGQUIT', 'beforeExit'].forEach(event => {
        if (!process.listenerCount(event)) {
          process.on(event, async () => {
            console.log(`🛑 Event ${event} - fermeture immédiate`);
            await this.forceDisconnect();
            if (event !== 'beforeExit') process.exit(0);
          });
        }
      });

      console.log(`✅ Connexion Prisma GLOBALE #${creationCount} créée`);
    } else {
      console.log(`♻️ REUTILISATION connexion globale #${creationCount}`);
      console.log('📍 Demandée depuis:', new Error().stack.split('\n')[2]?.trim());
    }
    
    // Marquer activité à chaque accès
    this.markActivity();
    return prismaInstance;
  }

  // Marquer l'activité
  markActivity() {
    lastActivity = Date.now();
    console.log('🔄 Activité marquée à', new Date(lastActivity).toISOString());
  }

  // Timer de nettoyage automatique
  startCleanupTimer() {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(async () => {
      const inactiveTime = Date.now() - (lastActivity || 0);
      const maxInactiveTime = 5 * 60 * 1000; // 5 minutes

      console.log(`⏰ Check inactivité: ${Math.round(inactiveTime/1000)}s / ${maxInactiveTime/1000}s max`);

      if (inactiveTime > maxInactiveTime && isConnected) {
        console.log('🧹 Fermeture automatique pour inactivité');
        await this.forceDisconnect();
      }
    }, 2 * 60 * 1000); // Check toutes les 2 minutes

    console.log('⏰ Timer de nettoyage démarré (check toutes les 2min)');
  }

  // Arrêter le timer
  stopCleanupTimer() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
      console.log('⏰ Timer de nettoyage arrêté');
    }
  }

  isConnected() {
    return isConnected && prismaInstance !== null;
  }

  // Fermeture forcée immédiate
  async forceDisconnect() {
    this.stopCleanupTimer();

    if (prismaInstance && isConnected) {
      console.log('🔌 Fermeture FORCÉE connexion Prisma...');
      try {
        // Timeout de fermeture (3 secondes max)
        await Promise.race([
          prismaInstance.$disconnect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout disconnect')), 3000)
          )
        ]);
        console.log('🔌 Connexion fermée avec succès');
      } catch (error) {
        console.error('❌ Erreur/timeout fermeture:', error.message);
        // Forcer la fermeture même en cas d'erreur
      } finally {
        prismaInstance = null;
        isConnected = false;
        lastActivity = null;
        console.log('✅ État réinitialisé');
      }
    }
  }

  // Fermeture douce
  async disconnect() {
    console.log('🔌 Fermeture douce demandée...');
    await this.forceDisconnect();
  }

  // Transaction avec marquage d'activité
  async executeInTransaction(callback, options = {}) {
    const prisma = this.getInstance();
    this.markActivity();
    
    try {
      const result = await prisma.$transaction(callback, {
        maxWait: 5000,
        timeout: 10000,
        ...options
      });
      this.markActivity(); // Marquer fin d'activité
      return result;
    } catch (error) {
      console.error('❌ Erreur transaction:', error);
      throw error;
    }
  }

  // Execution normale
  async executeWithTempConnection(callback) {
    console.log('🔄 executeWithTempConnection');
    const prisma = this.getInstance();
    this.markActivity();
    
    try {
      const result = await callback(prisma);
      this.markActivity(); // Marquer fin d'activité
      console.log('✅ executeWithTempConnection terminé');
      return result;
    } catch (error) {
      console.error('❌ Erreur executeWithTempConnection:', error);
      throw error;
    }
  }

  // Health check avec retry en cas de timeout
  async healthCheck() {
    try {
      const prisma = this.getInstance();
      
      // Timeout plus court pour éviter les blocages
      const healthPromise = prisma.$queryRaw`SELECT 1`;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 3000)
      );
      
      await Promise.race([healthPromise, timeoutPromise]);
      this.markActivity();
      return { status: 'healthy' };
      
    } catch (error) {
      console.log('⚠️ Health check timeout (normal avec 1 connexion)', error.message);
      
      // Ne pas forcer la reconnexion pour un simple timeout
      if (error.message.includes('timeout') || error.message.includes('pool')) {
        return { status: 'busy', message: 'Connection busy but functional' };
      }
      
      // Seulement reconnecter en cas d'erreur grave
      console.error('❌ Health check failed, reconnexion...', error);
      await this.forceDisconnect();
      return { status: 'reconnected' };
    }
  }

  // Stats détaillées avec debug
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

console.log('📤 EXPORT PrismaService avec nettoyage agressif');
const prismaService = new PrismaService();

module.exports = prismaService;