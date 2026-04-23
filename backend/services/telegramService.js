// services/telegramService.js
const logger = require('../utils/logger');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Envoie une notification Telegram (non-bloquante)
 */
async function sendNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.debug('Telegram non configuré, notification ignorée');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('Erreur envoi Telegram', { status: res.status, body });
    }
  } catch (error) {
    logger.error('Erreur Telegram (non bloquante)', { error: error.message });
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
