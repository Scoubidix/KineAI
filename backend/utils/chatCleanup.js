// utils/chatCleanup.js
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const cleanupOldChatSessions = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await prisma.chatSession.deleteMany({
      where: {
        sessionDate: {
          lt: today
        }
      }
    });

    console.log(`🧹 Chat cleanup: ${result.count} messages supprimés`);
    return result.count;
  } catch (error) {
    console.error('❌ Erreur nettoyage chat:', error);
    throw error;
  }
};

// Démarrer le cron de nettoyage à minuit
const startChatCleanupCron = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      await cleanupOldChatSessions();
    } catch (error) {
      console.error('Erreur cron nettoyage chat:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });
  
  console.log('📅 Nettoyage automatique des chats programmé');
};

module.exports = {
  startChatCleanupCron,
  cleanupOldChatSessions
};