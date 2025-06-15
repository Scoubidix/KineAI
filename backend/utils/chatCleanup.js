// utils/chatCleanup.js
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { 
  archiveFinishedPrograms, 
  cleanupArchivedPrograms 
} = require('../services/chatService');

const prisma = new PrismaClient();

// NOUVEAU: Nettoyer l'historique des chats kinés > 5 jours
const cleanOldKineChatHistory = async () => {
  try {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const result = await prisma.chatKine.deleteMany({
      where: {
        createdAt: {
          lt: fiveDaysAgo
        }
      }
    });
    
    console.log(`🗑️ Chat kiné: ${result.count} messages supprimés (> 5 jours)`);
    return result;
  } catch (error) {
    console.error('❌ Erreur nettoyage chat kiné:', error);
    throw error;
  }
};

// Archiver les programmes terminés (avec leurs conversations)
const archiveFinishedProgramsTask = async () => {
  try {
    const now = new Date();
    console.log(`📦 [${now.toISOString()}] Démarrage archivage programmes terminés...`);
    
    const result = await archiveFinishedPrograms();
    
    if (result.programs > 0) {
      console.log(`✅ Archivage terminé: ${result.programs} programmes, ${result.messages} messages`);
    } else {
      console.log('ℹ️ Aucun programme à archiver aujourd\'hui');
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Erreur archivage programmes:`, error);
    throw error;
  }
};

// Supprimer définitivement les programmes archivés depuis plus de 6 mois
const cleanupOldArchivedProgramsTask = async () => {
  try {
    const now = new Date();
    console.log(`🗑️ [${now.toISOString()}] Démarrage suppression programmes archivés > 6 mois...`);
    
    const result = await cleanupArchivedPrograms();
    
    if (result.programs > 0) {
      console.log(`✅ Suppression terminée: ${result.programs} programmes, ${result.messages} messages`);
      console.log('📋 Programmes supprimés:', result.details.map(p => `${p.titre} (archivé le ${p.archivedAt})`));
    } else {
      console.log('ℹ️ Aucun programme archivé à supprimer (< 6 mois)');
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Erreur suppression programmes archivés:`, error);
    throw error;
  }
};

// NOUVEAU: Tâche de nettoyage du chat kiné
const cleanKineChatTask = async () => {
  try {
    const now = new Date();
    console.log(`💬 [${now.toISOString()}] Démarrage nettoyage chat kiné > 5 jours...`);
    
    const result = await cleanOldKineChatHistory();
    
    if (result.count > 0) {
      console.log(`✅ Nettoyage chat kiné terminé: ${result.count} messages supprimés`);
    } else {
      console.log('ℹ️ Aucun message de chat kiné à supprimer (< 5 jours)');
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Erreur nettoyage chat kiné:`, error);
    throw error;
  }
};

// Démarrer les tâches automatiques
const startProgramCleanupCron = () => {
  console.log(`🚀 [${new Date().toISOString()}] Initialisation du système d'archivage des programmes + chat kiné...`);
  
  // Tâche quotidienne à 2h du matin : archiver les programmes terminés
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('🕐 Tâche quotidienne d\'archivage déclenchée (2h00)');
      await archiveFinishedProgramsTask();
    } catch (error) {
      console.error('❌ Erreur tâche archivage quotidienne:', error);
    }
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // NOUVEAU: Tâche quotidienne à 2h30 du matin : nettoyer le chat kiné
  cron.schedule('30 2 * * *', async () => {
    try {
      console.log('💬 Tâche quotidienne de nettoyage chat kiné déclenchée (2h30)');
      await cleanKineChatTask();
    } catch (error) {
      console.error('❌ Erreur tâche nettoyage chat kiné:', error);
    }
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  // Tâche hebdomadaire le dimanche à 3h : supprimer les programmes archivés > 6 mois
  cron.schedule('0 3 * * 0', async () => {
    try {
      console.log('🗑️ Tâche hebdomadaire de nettoyage déclenchée (dimanche 3h00)');
      await cleanupOldArchivedProgramsTask();
    } catch (error) {
      console.error('❌ Erreur tâche nettoyage hebdomadaire:', error);
    }
  }, {
    timezone: "Europe/Paris",
    scheduled: true
  });

  console.log('📅 Système d\'archivage programmé:');
  console.log('   - Archivage quotidien à 2h00 (programmes terminés)');
  console.log('   - Nettoyage chat kiné à 2h30 (messages > 5 jours)');
  console.log('   - Nettoyage hebdomadaire dimanche 3h00 (archives > 6 mois)');
};

// Fonctions de test manuel (pour développement/debug)
const manualArchiveTest = async () => {
  try {
    console.log('🧪 Test manuel archivage programmes terminés...');
    const result = await archiveFinishedProgramsTask();
    console.log('✅ Test archivage terminé:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur test manuel archivage:', error);
    throw error;
  }
};

const manualCleanupTest = async () => {
  try {
    console.log('🧪 Test manuel nettoyage programmes archivés...');
    const result = await cleanupOldArchivedProgramsTask();
    console.log('✅ Test nettoyage terminé:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur test manuel nettoyage:', error);
    throw error;
  }
};

// NOUVEAU: Test manuel du nettoyage chat kiné
const manualKineChatCleanupTest = async () => {
  try {
    console.log('🧪 Test manuel nettoyage chat kiné...');
    const result = await cleanKineChatTask();
    console.log('✅ Test nettoyage chat kiné terminé:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur test manuel nettoyage chat kiné:', error);
    throw error;
  }
};

module.exports = {
  startProgramCleanupCron,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask,
  cleanKineChatTask, // NOUVEAU
  cleanOldKineChatHistory, // NOUVEAU
  manualArchiveTest,
  manualCleanupTest,
  manualKineChatCleanupTest // NOUVEAU
};