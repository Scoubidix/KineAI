const logger = require('../utils/logger');
const { sendTransactionalEmail } = require('./brevoMailService');
const { sendVisioLink } = require('../routes/webhook/whatsapp');

function formatDateFr(scheduledAt) {
  return new Date(scheduledAt).toLocaleString('fr-FR', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris',
  });
}

/**
 * Envoie le lien de séance visio via le canal choisi par le kiné.
 * @param {'EMAIL'|'WHATSAPP'} channel
 */
async function sendSeanceLink({ channel, patient, token, seanceUrl, scheduledAt }) {
  const dateStr = formatDateFr(scheduledAt);

  if (channel === 'EMAIL') {
    const htmlContent = `<p>Bonjour,</p>
<p>Votre séance de télésoin est prévue le <strong>${dateStr}</strong>.</p>
<p>Pour la rejoindre, cliquez sur ce lien à l'heure du rendez-vous :</p>
<p><a href="${seanceUrl}">${seanceUrl}</a></p>
<p>Pensez à vous installer dans un endroit calme et confidentiel, avec une bonne connexion internet.</p>
<p>À très bientôt.</p>`;
    try {
      await sendTransactionalEmail({
        toEmail: patient.email,
        subject: 'Votre séance de télésoin',
        htmlContent,
        textContent: `Bonjour, votre séance de télésoin est prévue le ${dateStr}. Lien pour la rejoindre : ${seanceUrl}`,
      });
      return { success: true };
    } catch (err) {
      logger.error('Echec envoi email visio (Brevo):', err.message);
      return { success: false };
    }
  }

  if (channel === 'WHATSAPP') {
    const res = await sendVisioLink(patient.phone, token, dateStr);
    return { success: !!res.success };
  }

  logger.error('Canal de transmission inconnu:', channel);
  return { success: false };
}

module.exports = { sendSeanceLink };
