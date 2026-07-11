// utils/trialMailCron.js — planifie les mails événements de l'essai.
// Logique dans trialMailService (découplée) → migration Cloud Scheduler triviale.
const cron = require('node-cron');
const logger = require('./logger');
const { sendFirstBilanMails, sendTrialRecapMails } = require('../services/trialMailService');

function startTrialMailCron() {
  // Mail « 1er bilan » — tous les jours à 19h (Europe/Paris)
  cron.schedule('0 19 * * *', async () => {
    try {
      const r = await sendFirstBilanMails();
      logger.info(`[trialMailCron] 1er bilan : ${r.sent} envoyé(s)`);
    } catch (err) {
      logger.error('[trialMailCron] erreur 1er bilan:', err.message);
    }
  }, { timezone: 'Europe/Paris' });

  // Mail récap de fin — tous les jours à 10h (Europe/Paris)
  cron.schedule('0 10 * * *', async () => {
    try {
      const r = await sendTrialRecapMails();
      logger.info(`[trialMailCron] récap : ${r.sent} envoyé(s)`);
    } catch (err) {
      logger.error('[trialMailCron] erreur récap:', err.message);
    }
  }, { timezone: 'Europe/Paris' });

  logger.info('[trialMailCron] crons essai planifiés (19h 1er bilan, 10h récap)');
}

module.exports = { startTrialMailCron };
