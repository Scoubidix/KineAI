// services/prismaService.js
console.log('📦 CHARGEMENT du module prismaService.js');

const { PrismaClient } = require('@prisma/client');

class PrismaService {
  constructor() {
    console.log('🏗️ CONSTRUCTION nouvelle instance PrismaService');
    this.prisma = null;
  }

  // Obtenir l'instance Prisma (singleton)
  getInstance() {
    if (!this.prisma) {
      console.log('🔧 CREATION nouvelle connexion Prisma');
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
    } else {
      console.log('♻️ REUTILISATION connexion Prisma existante');
    }
    return this.prisma;
  }

  // Fermer la connexion
  async disconnect() {
    if (this.prisma) {
      console.log('🔌 Fermeture connexion Prisma...');
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

  // Utilise l'instance partagée (pas de connexions temporaires)
  async executeWithTempConnection(callback) {
    console.log('🔄 Début executeWithTempConnection');
    const prisma = this.getInstance();
    
    try {
      console.log('🔄 Utilisation connexion partagée pour tâche CRON');
      const result = await callback(prisma);
      console.log('✅ executeWithTempConnection terminé avec succès');
      return result;
    } catch (error) {
      console.error('❌ Erreur dans executeWithTempConnection:', error);
      throw error;
    }
  }
}

// Export d'une instance unique (singleton)
console.log('📤 EXPORT instance unique PrismaService');
module.exports = new PrismaService();