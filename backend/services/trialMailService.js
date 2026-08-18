// services/trialMailService.js
// Mail événement de l'essai Stripe (logique découplée du déclencheur webhook).

const logger = require('../utils/logger');
const { sendTemplateEmail } = require('./brevoMailService');

/**
 * Mail J-3 « ton essai se termine bientôt, débit dans 3 jours ».
 * Déclenché par le webhook customer.subscription.trial_will_end. No-op si template absent.
 * Template Brevo 88 : params PRENOM, DATE_DEBIT (déjà formatée FR), MONTANT (nombre), PLAN.
 * @param {Object} params
 * @param {string} params.email
 * @param {string} [params.firstName]
 * @param {string} params.dateDebit - date du 1er débit, déjà formatée FR (« 15 août 2026 »)
 * @param {number} params.montant - montant du 1er débit en euros, sans symbole
 * @param {string} params.plan - « mensuel » | « annuel »
 * @returns {Promise<void>}
 */
async function sendTrialWillEndMail({ email, firstName, dateDebit, montant, plan }) {
  const templateId = process.env.BREVO_TRIAL_J3_TEMPLATE_ID;
  if (!templateId) {
    logger.warn('[trialMail] BREVO_TRIAL_J3_TEMPLATE_ID absent — mail J-3 ignoré');
    return;
  }
  await sendTemplateEmail({
    toEmail: email,
    toName: firstName || undefined,
    templateId,
    params: { PRENOM: firstName || '', DATE_DEBIT: dateDebit, MONTANT: montant, PLAN: plan },
  });
}

module.exports = { sendTrialWillEndMail };
