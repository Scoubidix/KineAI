// routes/webhook/whatsapp.js
const logger = require('../../utils/logger');
const express = require('express');
const router = express.Router();
const { sanitizeName } = require('../../utils/logSanitizer');

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

  logger.debug('Meta teste le webhook:', { mode, token, challenge });

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    logger.debug('✅ Webhook vérifié avec succès');
    res.status(200).send(challenge);
  } else {
    logger.debug('❌ Échec de la vérification du webhook');
    res.sendStatus(403);
  }
});

// Réception des messages (POST) - Pas encore utilisé mais nécessaire
router.post('/', (req, res) => {
  const body = req.body;
  logger.debug('Message WhatsApp reçu:', body);
  res.status(200).send('EVENT_RECEIVED');
});

// Fonction pour envoyer ton template personnalisé PROGRAMME_KINE
async function sendProgrammeTemplate(phoneNumber, chatLink) {
  try {
    logger.debug('🔄 ENVOI TEMPLATE PROGRAMME_KINE avec lien:', chatLink);
    
    // Extraire SEULEMENT le token JWT de l'URL complète
    const baseUrl = `${process.env.FRONTEND_URL}/chat/`;
    const jwtToken = chatLink.replace(baseUrl, '');
    logger.debug('🔑 Token JWT extrait:', jwtToken);
    logger.debug('🌐 Base URL utilisée:', baseUrl);
    
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'programme_kine',
          language: {
            code: 'fr'
          },
          components: [
            {
              type: 'BUTTON',
              sub_type: 'URL',
              index: 0,
              parameters: [
                {
                  type: 'TEXT',
                  text: jwtToken  // Token envoyé au bouton, pas au corps
                }
              ]
            }
          ]
        }
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      logger.debug('✅ TEMPLATE PROGRAMME_KINE ENVOYÉ:', result);
      return { success: true, data: result };
    } else {
      logger.error('❌ ERREUR TEMPLATE PROGRAMME_KINE:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    logger.error('❌ ERREUR TECHNIQUE TEMPLATE PROGRAMME_KINE:', error);
    return { success: false, error: error.message };
  }
}

// Fonction pour envoyer le template hello_world (fallback)
async function sendHelloWorldTemplate(phoneNumber) {
  try {
    logger.debug('🔄 FALLBACK - ENVOI TEMPLATE HELLO_WORLD...');
    
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'hello_world',
          language: {
            code: 'en_US'
          }
        }
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      logger.debug('✅ TEMPLATE HELLO_WORLD ENVOYÉ:', result);
      return { success: true, data: result };
    } else {
      logger.error('❌ ERREUR TEMPLATE HELLO_WORLD:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    logger.error('❌ ERREUR TECHNIQUE TEMPLATE HELLO_WORLD:', error);
    return { success: false, error: error.message };
  }
}

// Fonction pour envoyer un message texte libre (désactivée pour l'instant)
async function sendTextMessage(phoneNumber, message) {
  try {
    logger.debug('🔄 Envoi message texte...');
    
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
      logger.debug('✅ Message texte envoyé:', result);
      return { success: true, data: result };
    } else {
      logger.error('❌ Erreur message texte:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    logger.error('❌ Erreur technique message texte:', error);
    return { success: false, error: error.message };
  }
}

// Fonction principale - UTILISE TON TEMPLATE PERSONNALISÉ
async function sendWhatsAppMessage(phoneNumber, message, chatLink = null) {
  logger.debug('🚀 ENVOI TEMPLATE PROGRAMME_KINE pour:', phoneNumber);
  
  // Si on a un lien de chat, utilise le template personnalisé
  if (chatLink) {
    logger.debug('🔄 Tentative template personnalisé PROGRAMME_KINE...');
    const result = await sendProgrammeTemplate(phoneNumber, chatLink);
    
    if (result.success) {
      return result;
    }
    
    // Si ça échoue, utilise hello_world en fallback
    logger.debug('🔄 Template personnalisé échoué, fallback hello_world...');
    return await sendHelloWorldTemplate(phoneNumber);
  }
  
  // Si pas de lien, utilise hello_world
  return await sendHelloWorldTemplate(phoneNumber);
}

// Fonction pour envoyer le lien de programme - UTILISE TON TEMPLATE !
async function sendProgramLink(phoneNumber, patientName, programLink) {
  logger.debug('📱 Envoi lien programme via TEMPLATE PROGRAMME_KINE pour:', sanitizeName(patientName));
  logger.debug('🔗 Lien à envoyer:', programLink);

  // Utilise ton template personnalisé avec le lien
  return await sendWhatsAppMessage(phoneNumber, null, programLink);
}

// Fonction pour envoyer un message via template MESSAGE_KINE_PATIENT
async function sendMessageTemplate(phoneNumber, messageContent) {
  try {
    logger.debug('🔄 ENVOI TEMPLATE MESSAGE_KINE_PATIENT');
    logger.debug('📱 Numéro:', phoneNumber);
    logger.debug('💬 Message (tronqué):', messageContent.substring(0, 100) + '...');

    // WhatsApp Business API ne supporte PAS les sauts de ligne dans les variables de template
    // Contraintes: pas de \n, \t, ni plus de 4 espaces consécutifs
    let cleanedMessage = messageContent
      .replace(/\n\n+/g, '. ')  // Doubles sauts de ligne ou plus → point + espace
      .replace(/\n/g, ' ')       // Sauts de ligne simples → espace
      .replace(/\t/g, ' ')       // Tabulations → espace
      .replace(/\s{5,}/g, '    ') // Plus de 4 espaces consécutifs → 4 espaces max
      .replace(/\.\s*\./g, '.')  // Nettoyer les doubles points accidentels
      .trim();

    // Limiter la longueur du message (WhatsApp limite à 1024 caractères par variable)
    const truncatedMessage = cleanedMessage.length > 1024
      ? cleanedMessage.substring(0, 1021) + '...'
      : cleanedMessage;

    if (messageContent.length > 1024) {
      logger.warn('⚠️ Message tronqué de', messageContent.length, 'à 1024 caractères');
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'message_kine_patient', // Nom du template dans Meta Business Manager
          language: {
            code: 'fr'
          },
          components: [
            {
              type: 'BODY',
              parameters: [
                {
                  type: 'TEXT',
                  text: truncatedMessage
                }
              ]
            }
          ]
        }
      })
    });

    const result = await response.json();

    if (response.ok) {
      logger.debug('✅ TEMPLATE MESSAGE_KINE_PATIENT ENVOYÉ:', result);
      return { success: true, data: result };
    } else {
      logger.error('❌ ERREUR TEMPLATE MESSAGE_KINE_PATIENT:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    logger.error('❌ ERREUR TECHNIQUE TEMPLATE MESSAGE_KINE_PATIENT:', error);
    return { success: false, error: error.message };
  }
}

// Envoi du lien de séance visio via le template visio_kine.
// BODY {{1}} = date/heure du RDV ; BOUTON URL {{1}} = token de séance.
async function sendVisioLink(phoneNumber, token, dateStr = '') {
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
        type: 'template',
        template: {
          name: 'visio_kine',
          language: { code: 'fr' },
          components: [
            {
              type: 'BODY',
              parameters: [{ type: 'TEXT', text: dateStr }],
            },
            {
              type: 'BUTTON',
              sub_type: 'URL',
              index: 0,
              parameters: [{ type: 'TEXT', text: token }],
            },
          ],
        },
      }),
    });
    const result = await response.json();
    if (response.ok) return { success: true, data: result };
    logger.error('❌ ERREUR TEMPLATE VISIO_KINE:', result);
    return { success: false, error: result };
  } catch (error) {
    logger.error('❌ ERREUR TECHNIQUE TEMPLATE VISIO_KINE:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  router,
  sendWhatsAppMessage,
  sendProgramLink,
  sendMessageTemplate,
  sendVisioLink
};