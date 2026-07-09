/**
 * Service d'envoi d'emails transactionnels via l'API Brevo.
 *
 * Utilise fetch natif (Node 18+) — pas de dépendance SDK.
 * Endpoint : POST https://api.brevo.com/v3/smtp/email
 * Docs : https://developers.brevo.com/reference/sendtransacemail
 *
 * Logs sans PII : on ne log que le messageId Brevo et le statut HTTP.
 */

const logger = require('../utils/logger');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10000;

const ERROR_CODES = {
  CONFIG_MISSING: 'BREVO_CONFIG_MISSING',
  AUTH: 'BREVO_AUTH',
  VALIDATION: 'BREVO_VALIDATION',
  RATE_LIMIT: 'BREVO_RATE_LIMIT',
  UNKNOWN: 'BREVO_UNKNOWN',
};

function throwErr(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function getConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  const fromName = process.env.BREVO_FROM_NAME;
  if (!apiKey || !fromEmail || !fromName) {
    throwErr('Configuration Brevo manquante', ERROR_CODES.CONFIG_MISSING);
  }
  return { apiKey, fromEmail, fromName };
}

/**
 * Envoie un email transactionnel via Brevo.
 *
 * @param {Object} params
 * @param {string} params.toEmail - Email du destinataire
 * @param {string} [params.toName] - Nom du destinataire (optionnel)
 * @param {string} params.subject - Sujet
 * @param {string} params.htmlContent - Corps HTML
 * @param {string} params.textContent - Corps texte (fallback)
 * @param {Object} [params.replyTo] - { email, name } pour Reply-To
 * @param {string} [params.senderDisplayName] - Si fourni, override le BREVO_FROM_NAME (ex: "Jean Dupont via Mon Assistant Kiné")
 * @param {Array<{ email: string, name?: string }>} [params.cc] - Destinataires en copie
 * @param {Array<{ name: string, url?: string, content?: string }>} [params.attachment] - Pièces jointes (url publique ou contenu base64)
 * @returns {Promise<{ messageId: string }>}
 */
async function sendTransactionalEmail({
  toEmail,
  toName,
  subject,
  htmlContent,
  textContent,
  replyTo,
  senderDisplayName,
  cc,
  attachment,
}) {
  const { apiKey, fromEmail, fromName } = getConfig();

  if (!toEmail || !subject || !htmlContent) {
    throwErr('Paramètres email incomplets', ERROR_CODES.VALIDATION);
  }

  const payload = {
    sender: { email: fromEmail, name: senderDisplayName || fromName },
    to: [{ email: toEmail, ...(toName ? { name: toName } : {}) }],
    subject,
    htmlContent,
    ...(textContent ? { textContent } : {}),
    ...(replyTo && replyTo.email ? { replyTo: { email: replyTo.email, ...(replyTo.name ? { name: replyTo.name } : {}) } } : {}),
    ...(Array.isArray(cc) && cc.length > 0
      ? { cc: cc.filter(c => c && c.email).map(c => ({ email: c.email, ...(c.name ? { name: c.name } : {}) })) }
      : {}),
    ...(Array.isArray(attachment) && attachment.length > 0 ? { attachment } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    logger.error('Brevo : échec réseau', { name: err.name, message: err.message });
    throwErr('Échec d\'envoi email (réseau)', ERROR_CODES.UNKNOWN);
  }
  clearTimeout(timer);

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 201) {
    const messageId = body?.messageId || null;
    logger.info(`Brevo : email envoyé (status ${response.status}, messageId ${messageId || 'n/a'})`);
    return { messageId };
  }

  logger.error('Brevo : envoi refusé', { status: response.status, code: body?.code, message: body?.message });

  if (response.status === 401 || response.status === 403) {
    throwErr('Authentification Brevo refusée', ERROR_CODES.AUTH);
  }
  if (response.status === 429) {
    throwErr('Limite de taux Brevo atteinte', ERROR_CODES.RATE_LIMIT);
  }
  if (response.status >= 400 && response.status < 500) {
    throwErr(body?.message || 'Email refusé par Brevo', ERROR_CODES.VALIDATION);
  }
  throwErr('Erreur Brevo inattendue', ERROR_CODES.UNKNOWN);
}

module.exports = {
  ERROR_CODES,
  sendTransactionalEmail,
};
