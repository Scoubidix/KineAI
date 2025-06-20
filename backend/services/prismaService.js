// services/prismaService.js
const { PrismaClient } = require('@prisma/client');

class PrismaService {
  constructor() {
    this.prisma = null;
  }

  // Obtenir l'instance Prisma (singleton)
  getInstance() {
    if (!this.prisma) {
      this.prisma = new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        }
      });

      // Gérer la fermeture propre
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await this.disconnect();
        process.exit(0);
      });
    }
    return this.prisma;
  }

  // Fermer la connexion
  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
      console.log('🔌 Connexion Prisma fermée');
    }
  }

  // Créer une transaction sécurisée
  async executeInTransaction(callback) {
    const prisma = this.getInstance();
    try {
      return await prisma.$transaction(callback);
    } catch (error) {
      console.error('❌ Erreur transaction Prisma:', error);
      throw error;
    }
  }

  // Créer une connexion temporaire pour les tâches CRON
  async executeWithTempConnection(callback) {
    const tempPrisma = new PrismaClient({
      log: ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    try {
      return await callback(tempPrisma);
    } catch (error) {
      console.error('❌ Erreur connexion temporaire:', error);
      throw error;
    } finally {
      await tempPrisma.$disconnect();
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new PrismaService();