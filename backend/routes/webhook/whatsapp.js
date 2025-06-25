// routes/webhook/whatsapp.js
const express = require('express');
const router = express.Router();

// Configuration WhatsApp
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN;
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`;

// Vérification du webhook (GET) - C'est ça que Meta va tester !
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Meta teste le webhook:', { mode, token, challenge });

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook vérifié avec succès');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Échec de la vérification du webhook');
    res.sendStatus(403);
  }
});

// Réception des messages (POST) - Pas encore utilisé mais nécessaire
router.post('/', (req, res) => {
  const body = req.body;
  console.log('Message WhatsApp reçu:', body);
  res.status(200).send('EVENT_RECEIVED');
});

// Fonction pour envoyer un message WhatsApp
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Message WhatsApp envoyé:', result);
      return { success: true, data: result };
    } else {
      console.error('❌ Erreur envoi WhatsApp:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('❌ Erreur technique WhatsApp:', error);
    return { success: false, error: error.message };
  }
}

// Fonction pour envoyer le lien de programme
async function sendProgramLink(phoneNumber, patientName, programLink) {
  const message = `Bonjour ${patientName},

Votre programme de rééducation du jour est prêt ! 💪

👉 Accédez à votre chat personnalisé :
${programLink}

Votre kinésithérapeute vous accompagne à distance.

L'équipe Mon Assistant Kiné`;

  return await sendWhatsAppMessage(phoneNumber, message);
}

module.exports = {
  router,
  sendWhatsAppMessage,
  sendProgramLink
};