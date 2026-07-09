// services/trialMailService.js
// Mails événements de l'essai (logique découplée du déclencheur cron).
// Idempotence via réservation atomique sur des colonnes DateTime de Kine.

const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { TRIAL_DURATION_DAYS, getEffectivePlan } = require('./planService');
const { sendTemplateEmail } = require('./brevoMailService');
const { sumMinutes } = require('../config/timeSaved');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Début d'essai déduit de la date de fin (fin = début + 14 j). */
function trialStart(trialEndDate) {
  return new Date(new Date(trialEndDate).getTime() - TRIAL_DURATION_DAYS * MS_PER_DAY);
}

/**
 * Mail « 1er bilan » : kinés en essai actif ayant généré ≥1 bilan IA, non encore notifiés.
 * @returns {Promise<{ sent: number, skipped: number }>}
 */
async function sendFirstBilanMails(now = new Date()) {
  const prisma = prismaService.getInstance();
  const templateId = process.env.BREVO_TRIAL_BILAN_TEMPLATE_ID;
  if (!templateId) {
    logger.warn('[trialMail] BREVO_TRIAL_BILAN_TEMPLATE_ID absent — envoi 1er bilan ignoré');
    return { sent: 0, skipped: 0 };
  }

  // Candidats : essai actif, pas encore notifié, ≥1 événement BILAN_GENERATED pendant l'essai.
  const candidates = await prisma.kine.findMany({
    where: {
      trialEndDate: { gt: now },
      trialBilanMailSentAt: null,
      activityEvents: { some: { type: 'BILAN_GENERATED' } },
    },
    select: { id: true, email: true, firstName: true, trialEndDate: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const kine of candidates) {
    // Filtre fin : le bilan doit être survenu pendant l'essai (≥ début d'essai).
    const start = trialStart(kine.trialEndDate);
    const count = await prisma.kineActivityEvent.count({
      where: { kineId: kine.id, type: 'BILAN_GENERATED', createdAt: { gte: start } },
    });
    if (count === 0) { skipped++; continue; }

    // Réservation atomique : une seule instance « gagne » et envoie.
    const claim = await prisma.kine.updateMany({
      where: { id: kine.id, trialBilanMailSentAt: null },
      data: { trialBilanMailSentAt: now },
    });
    if (claim.count !== 1) { skipped++; continue; }

    try {
      await sendTemplateEmail({
        toEmail: kine.email,
        toName: kine.firstName || undefined,
        templateId,
        params: { PRENOM: kine.firstName || '' },
      });
      sent++;
    } catch (err) {
      logger.warn(`[trialMail] envoi 1er bilan échoué (kiné ${kine.id}): ${err.message}`);
    }
  }
  logger.info(`[trialMail] 1er bilan : ${sent} envoyé(s), ${skipped} ignoré(s)`);
  return { sent, skipped };
}

/**
 * Mail récap de fin d'essai : kinés dont l'essai est terminé, NON convertis,
 * non encore notifiés. Agrège l'usage sur la fenêtre d'essai (barème canonique).
 * @returns {Promise<{ sent: number, skipped: number }>}
 */
async function sendTrialRecapMails(now = new Date()) {
  const prisma = prismaService.getInstance();
  const templateId = process.env.BREVO_TRIAL_RECAP_TEMPLATE_ID;
  if (!templateId) {
    logger.warn('[trialMail] BREVO_TRIAL_RECAP_TEMPLATE_ID absent — envoi récap ignoré');
    return { sent: 0, skipped: 0 };
  }

  const candidates = await prisma.kine.findMany({
    where: { trialEndDate: { lte: now }, trialRecapMailSentAt: null },
    select: { id: true, email: true, firstName: true, planType: true, subscriptionId: true, trialEndDate: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const kine of candidates) {
    // Exclure les convertis : plan effectif encore payant → pas de récap "fin d'essai".
    if (getEffectivePlan(kine, now) !== 'FREE') { skipped++; continue; }

    const start = trialStart(kine.trialEndDate);
    const window = { gte: start, lte: kine.trialEndDate };

    const [grouped, patientsCount] = await Promise.all([
      prisma.kineActivityEvent.groupBy({
        by: ['type'],
        where: { kineId: kine.id, createdAt: window },
        _count: { _all: true },
      }),
      prisma.patient.count({ where: { kineId: kine.id, createdAt: window } }),
    ]);

    const byType = Object.fromEntries(grouped.map((g) => [g.type, g._count._all]));
    const totalMinutes = sumMinutes(grouped);

    // Réservation atomique.
    const claim = await prisma.kine.updateMany({
      where: { id: kine.id, trialRecapMailSentAt: null },
      data: { trialRecapMailSentAt: now },
    });
    if (claim.count !== 1) { skipped++; continue; }

    try {
      await sendTemplateEmail({
        toEmail: kine.email,
        toName: kine.firstName || undefined,
        templateId,
        params: {
          PRENOM: kine.firstName || '',
          NB_BILANS: byType.BILAN_GENERATED || 0,
          NB_PROGRAMMES: byType.PROGRAMME_CREATED || 0,
          NB_REQUETES_IA: byType.IA_SEARCH || 0,
          NB_COURRIERS: byType.ADMIN_LETTER || 0,
          NB_PATIENTS: patientsCount,
          TEMPS_GAGNE_H: Math.floor(totalMinutes / 60),
          TEMPS_GAGNE_MIN: totalMinutes % 60,
        },
      });
      sent++;
    } catch (err) {
      logger.warn(`[trialMail] envoi récap échoué (kiné ${kine.id}): ${err.message}`);
    }
  }
  logger.info(`[trialMail] récap : ${sent} envoyé(s), ${skipped} ignoré(s)`);
  return { sent, skipped };
}

module.exports = { sendFirstBilanMails, sendTrialRecapMails };
