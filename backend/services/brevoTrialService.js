/**
 * Service Brevo — gestion des contacts sur les listes marketing (+ attributs).
 *
 * Distinct de brevoMailService (transactionnel /v3/smtp/email). Ici on utilise
 * l'API Contacts (/v3/contacts) pour ajouter le kiné à une liste ; l'entrée dans
 * la liste déclenche l'automation mail construite dans Brevo (côté Sylvain).
 *  - Liste « Inscrits » : séquence onboarding J0…J13 (déclenchée au signup / 1re saisie prénom).
 *  - Liste « Pionniers » : abonnés au plan PIONNIER.
 *
 * Logs sans PII : on ne log que le statut HTTP.
 */

const logger = require('../utils/logger');

const BREVO_CONTACTS_ENDPOINT = 'https://api.brevo.com/v3/contacts';
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

/**
 * Coeur : crée/met à jour un contact et l'ajoute à une liste Brevo.
 * Ajoute à la liste sans retirer des autres (union). Non spécifique à un usage.
 * @param {Object} p
 * @param {string} p.email
 * @param {number|string} p.listId
 * @param {Object} [p.attributes]
 * @param {string} p.context - libellé pour les logs (ex: 'essai', '1er bilan')
 * @returns {Promise<void>}
 */
async function postContact(payload, context) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(BREVO_CONTACTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    logger.error(`Brevo ${context} : échec réseau`, { name: err.name, message: err.message });
    throwErr('Échec contact Brevo (réseau)', ERROR_CODES.UNKNOWN);
  }
  clearTimeout(timer);

  // 201 = contact créé, 204 = contact existant mis à jour → succès.
  if (response.status === 201 || response.status === 204) {
    logger.info(`Brevo ${context} : contact synchronisé (status ${response.status})`);
    return;
  }

  let body = null;
  try { body = await response.json(); } catch { body = null; }
  logger.error(`Brevo ${context} : refusé`, { status: response.status, message: body?.message });

  if (response.status === 401 || response.status === 403) {
    throwErr('Authentification Brevo refusée', ERROR_CODES.AUTH);
  }
  if (response.status === 429) {
    throwErr('Limite de taux Brevo atteinte', ERROR_CODES.RATE_LIMIT);
  }
  if (response.status >= 400 && response.status < 500) {
    throwErr(body?.message || 'Contact refusé par Brevo', ERROR_CODES.VALIDATION);
  }
  throwErr('Erreur Brevo inattendue', ERROR_CODES.UNKNOWN);
}

async function postContactToList({ email, listId, attributes, context }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !listId) {
    throwErr(`Configuration Brevo ${context} manquante`, ERROR_CODES.CONFIG_MISSING);
  }
  if (!email) {
    throwErr('Email requis pour le contact Brevo', ERROR_CODES.VALIDATION);
  }
  return postContact({
    email,
    updateEnabled: true,
    listIds: [Number(listId)],
    ...(attributes ? { attributes } : {}),
  }, context);
}

/**
 * Ajoute le kiné à la liste « Pionniers » (abonnés au plan PIONNIER).
 * @param {Object} params
 * @param {string} params.email
 * @param {string} [params.firstName]
 * @returns {Promise<void>}
 */
async function addToPionnierList({ email, firstName }) {
  return postContactToList({
    email,
    listId: process.env.BREVO_PIONNIER_LIST_ID,
    attributes: { PRENOM: firstName || '' },
    context: 'pionnier',
  });
}

/**
 * Ajoute le kiné à la liste « Inscrits » (déclenche l'automation onboarding J0→J13,
 * cadencée sur la date d'inscription côté Brevo). Appelé au signup, avec ou sans carte.
 * @param {Object} params
 * @param {string} params.email
 * @param {string} [params.firstName]
 * @returns {Promise<void>}
 */
async function upsertSignupContact({ email, firstName }) {
  return postContactToList({
    email,
    listId: process.env.BREVO_SIGNUP_LIST_ID,
    attributes: { PRENOM: firstName || '' },
    context: 'inscrit',
  });
}

module.exports = { ERROR_CODES, addToPionnierList, upsertSignupContact };
