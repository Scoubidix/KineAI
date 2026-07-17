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
    const htmlContent = `<p>Bonjour ${patient.firstName},</p>
<p>Votre séance de télésoin est prévue le <strong>${dateStr}</strong>.</p>
<p>Pour la rejoindre, cliquez sur ce lien à l'heure du rendez-vous :</p>
<p><a href="${seanceUrl}">${seanceUrl}</a></p>
<p>Assurez-vous d'être dans un endroit calme et confidentiel, avec une bonne connexion internet.</p>`;
    await sendTransactionalEmail({
      toEmail: patient.email,
      toName: patient.firstName,
      subject: 'Votre séance de télésoin',
      htmlContent,
      textContent: `Votre séance de télésoin est prévue le ${dateStr}. Lien : ${seanceUrl}`,
    });
    return { success: true };
  }

  if (channel === 'WHATSAPP') {
    const res = await sendVisioLink(patient.phone, token);
    return { success: !!res.success };
  }

  logger.error('Canal de transmission inconnu:', channel);
  return { success: false };
}

module.exports = { sendSeanceLink };
