// utils/chatCleanup.js
const cron = require('node-cron');
const { 
  archiveFinishedPrograms, 
  cleanupArchivedPrograms 
} = require('../services/chatService');

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

// Démarrer les tâches automatiques
const startProgramCleanupCron = () => {
  console.log(`🚀 [${new Date().toISOString()}] Initialisation du système d'archivage des programmes...`);
  
  // Test immédiat pour debug (peut être commenté en production)
  console.log('🧪 Test archivage immédiat...');
  archiveFinishedProgramsTask().catch(err => {
    console.error('❌ Erreur test archivage:', err);
  });

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

  // Cron de test toutes les minutes (à supprimer en production)
  cron.schedule('* * * * *', () => {
    const now = new Date();
    console.log(`⏰ Test cron archivage: ${now.toLocaleString('fr-FR')}`);
  });

  console.log('📅 Système d\'archivage programmé:');
  console.log('   - Archivage quotidien à 2h00 (programmes terminés)');
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

module.exports = {
  startProgramCleanupCron,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask,
  manualArchiveTest,
  manualCleanupTest
};