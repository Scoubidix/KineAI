// services/telegramService.js
const logger = require('../utils/logger');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(Boolean);

/**
 * Envoie une notification Telegram à tous les chat IDs (non-bloquante)
 */
async function sendNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
    logger.debug('Telegram non configuré, notification ignorée');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        logger.error('Erreur envoi Telegram', { chatId, status: res.status, body });
      }
    } catch (error) {
      logger.error('Erreur Telegram (non bloquante)', { chatId, error: error.message });
    }
  }
}

/**
 * Notification nouvel abonnement (sans PII)
 */
async function notifyNewSubscription(planType) {
  const message = `🎉 <b>Nouvel abonnement !</b>\n\n📋 Plan : <b>${planType}</b>\n🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  await sendNotification(message);
}

module.exports = { sendNotification, notifyNewSubscription };
