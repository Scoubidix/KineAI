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
 * @param {string} planType - DECLIC | PRATIQUE | PIONNIER | EXPERT
 * @param {string} billingCycle - 'monthly' | 'yearly'
 */
async function notifyNewSubscription(planType, billingCycle = 'monthly') {
  const cycleLabel = billingCycle === 'yearly' ? '📅 Annuel' : '🔁 Mensuel';
  const message = `🎉 <b>Nouvel abonnement !</b>\n\n📋 Plan : <b>${planType}</b>\n${cycleLabel}\n🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  await sendNotification(message);
}

const FEEDBACK_LABELS_FR = {
  too_expensive: 'Trop cher',
  missing_features: 'Fonctionnalités manquantes',
  switched_service: 'Passé à un concurrent',
  unused: 'Pas assez utilisé',
  customer_service: 'Service client',
  low_quality: 'Qualité insuffisante',
  too_complex: 'Trop compliqué',
  other: 'Autre',
};

/** 🎁 Essai Stripe démarré (carte saisie, 0 € encaissé). */
async function notifyTrialStarted(planType, billingCycle = 'monthly') {
  const cycleLabel = billingCycle === 'yearly' ? '📅 Annuel' : '🔁 Mensuel';
  const message = `🎁 <b>Essai démarré !</b>\n\n📋 Plan : <b>${planType}</b>\n${cycleLabel}\n🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  await sendNotification(message);
}

/** 🎉 Conversion essai → payant (1er paiement encaissé). */
async function notifyTrialConverted(planType, billingCycle = 'monthly') {
  const cycleLabel = billingCycle === 'yearly' ? '📅 Annuel' : '🔁 Mensuel';
  const message = `🎉 <b>Abonnement confirmé (1er paiement) !</b>\n\n📋 Plan : <b>${planType}</b>\n${cycleLabel}\n🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  await sendNotification(message);
}

/** ⚠️ Résiliation demandée (clic « résilier »), avec motif Stripe. Sans PII identifiante. */
async function notifyCancellation({ planType, kineId, feedback, comment, endDate }) {
  const motif = feedback ? (FEEDBACK_LABELS_FR[feedback] || feedback) : 'Non renseigné';
  const fin = endDate ? new Date(endDate).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '—';
  let message = `⚠️ <b>Résiliation demandée</b>\n\n📋 Plan : <b>${planType}</b>\n🧑 Kiné #${kineId}\n💬 Motif : ${motif}\n📅 Fin d'accès : ${fin}`;
  if (comment) message += `\n📝 « ${comment} »`;
  await sendNotification(message);
}

module.exports = { sendNotification, notifyNewSubscription, notifyTrialStarted, notifyTrialConverted, notifyCancellation, FEEDBACK_LABELS_FR };
