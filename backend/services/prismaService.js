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
            url: process.env.DATABASE_URL + "?connect_timeout=30&pool_timeout=30"
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

  // SUPPRIMÉ: executeWithTempConnection - utilise getInstance() partout
  async executeWithTempConnection(callback) {
    // Plus de connexion temporaire, on utilise l'instance partagée
    const prisma = this.getInstance();
    
    try {
      console.log('🔄 Utilisation connexion partagée pour tâche CRON');
      return await callback(prisma);
    } catch (error) {
      console.error('❌ Erreur dans executeWithTempConnection:', error);
      throw error;
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new PrismaService();