/**
 * Service d'envoi du contrat signé au Conseil départemental de l'Ordre des kinés.
 *
 * Obligation déontologique (art. R.4321-128 CSP) : le titulaire doit communiquer
 * le contrat de remplacement au CDO dont il dépend dans le mois qui suit la signature.
 *
 * Flow :
 *   1. Aperçu : GET /api/contracts/:id/ordre-email-preview
 *   2. Envoi  : POST /api/contracts/:id/send-to-ordre
 *
 * Stratégie d'envoi : on récupère une signed URL GCS du PDF final et on passe
 * cette URL à Brevo en attachment (Brevo télécharge côté serveur, on évite de
 * matérialiser le buffer en mémoire backend).
 */

const prismaService = require('./prismaService');
const brevoMailService = require('./brevoMailService');
const gcsStorageService = require('./gcsStorageService');
const contractService = require('./contractService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  NOT_INITIATEUR: 'NOT_INITIATEUR',
  IMMUTABLE_STATUS: 'IMMUTABLE_STATUS',
  PDF_NOT_READY: 'PDF_NOT_READY',
  INVALID_EMAIL: 'INVALID_EMAIL',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
};

function throwErr(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

const CONTRACT_TYPE_LABEL = {
  REMPLACEMENT_LIBERAL: 'remplacement libéral',
  ASSISTANAT_LIBERAL: 'assistanat libéral',
};

/**
 * Construit l'email du CDO selon la convention de l'Ordre national :
 *   cdo<code-département>@ordremk.fr (code en minuscules : "50", "75", "2a", "2b", "971"…)
 * Si le kiné n'a pas de département renseigné, on renvoie une chaîne vide
 * (le front affichera un champ vide et l'utilisateur devra saisir).
 */
function getOrdreEmailForDept(departementCode) {
  if (!departementCode) return '';
  return `cdo${String(departementCode).toLowerCase()}@ordremk.fr`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateFr(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getFrontendBase() {
  const url = process.env.FRONTEND_URL || 'http://localhost:3001';
  return url.replace(/\/$/, '');
}

const MARKETING_URL = 'https://www.monassistantkine.fr/';

/**
 * Construit le contenu du mail à envoyer au CDO.
 */
function buildOrdreEmailContent({ contract, initiator }) {
  const initFullName = `${initiator.firstName || ''} ${initiator.lastName || ''}`.trim();
  const destFullName = `${contract.destinataireFirstName || ''} ${contract.destinataireLastName || ''}`.trim();
  const contractLabel = CONTRACT_TYPE_LABEL[contract.type] || 'collaboration';
  const completedAtFr = formatDateFr(contract.completedAt);
  const dateDebutFr = formatDateFr(contract.data?.dateDebut);
  const dateFinFr = formatDateFr(contract.data?.dateFin);
  const logoUrl = `${getFrontendBase()}/logo.jpg`;
  const year = new Date().getFullYear();

  const subject = `Déclaration d'un contrat de ${contractLabel} — ${initFullName} / ${destFullName}`;

  const periodText = dateDebutFr && dateFinFr
    ? `, du ${dateDebutFr} au ${dateFinFr}`
    : '';
  const signedText = completedAtFr ? `, signé électroniquement le ${completedAtFr}` : '';

  const text = [
    `Madame, Monsieur,`,
    '',
    `Je vous transmets ci-joint mon contrat de ${contractLabel} conclu avec ${destFullName}${periodText}${signedText}.`,
    '',
    `Je reste à votre disposition pour toute information complémentaire.`,
    '',
    `Cordialement,`,
    initFullName,
    '',
    `— Envoyé via Mon Assistant Kiné`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
            <tr>
              <td align="center" style="background:#3899aa; border-radius:12px 12px 0 0; padding:24px;">
                <img src="${escapeHtml(logoUrl)}" alt="Mon Assistant Kiné" width="56" height="56" style="display:block; border:0; outline:none; text-decoration:none; border-radius:50%; background:#ffffff; padding:6px;">
                <div style="color:#ffffff; font-size:16px; font-weight:600; margin-top:10px;">Déclaration de contrat</div>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff; padding:28px 32px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; border-radius:0 0 12px 12px;">
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6;">Madame, Monsieur,</p>
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6;">
                  Je vous transmets ci-joint mon contrat de <strong>${escapeHtml(contractLabel)}</strong>
                  conclu avec <strong>${escapeHtml(destFullName)}</strong>${periodText}${signedText}.
                </p>
                <p style="margin:0 0 8px; font-size:14px; line-height:1.6;">Je reste à votre disposition pour toute information complémentaire.</p>
                <p style="margin:24px 0 0; font-size:14px; line-height:1.6;">Cordialement,<br><strong>${escapeHtml(initFullName)}</strong></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 16px 8px;">
                <p style="margin:0; font-size:12px; color:#9ca3af;">Envoyé via <a href="${escapeHtml(MARKETING_URL)}" style="color:#3899aa; text-decoration:none; font-weight:600;">Mon Assistant Kiné</a></p>
                <p style="margin:6px 0 0; font-size:11px; color:#9ca3af;">© ${year} Mon Assistant Kiné</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Construit l'aperçu du mail pour l'UI (sans envoi).
 * Vérifie ownership + statut COMPLETE.
 */
async function previewOrdreEmail({ contractId, kineId }) {
  const prisma = prismaService.getInstance();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId: kineId }
  });
  if (!contract) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);
  if (contract.status !== 'COMPLETE') {
    throwErr(`Envoi possible uniquement après signature complète (statut actuel : ${contract.status})`, ERROR_CODES.IMMUTABLE_STATUS);
  }

  const initiator = await prisma.kine.findUnique({ where: { id: kineId } });
  const { subject, html, text } = buildOrdreEmailContent({ contract, initiator });

  return {
    subject,
    html,
    text,
    defaultRecipientEmail: getOrdreEmailForDept(initiator.departementOrdre),
    destinataire: {
      firstName: contract.destinataireFirstName,
      lastName: contract.destinataireLastName,
      email: contract.destinataireEmail,
    },
    alreadySent: !!contract.ordreSentAt,
    previousRecipient: contract.ordreRecipientEmail || null,
    previousSentAt: contract.ordreSentAt || null,
  };
}

/**
 * Envoie le contrat au CDO :
 *  - Vérifie ownership + status COMPLETE + PDF disponible
 *  - Génère signed URL GCS du PDF final
 *  - Envoie via Brevo (attachment URL, CC destinataire si demandé)
 *  - Commit DB (ordreSentAt, ordreRecipientEmail, ordreMessageId) + audit log
 */
async function sendToOrdre({ contractId, kineId, recipientEmail, ccEmail }) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!recipientEmail || typeof recipientEmail !== 'string' || !emailRegex.test(recipientEmail.trim())) {
    throwErr('Email du Conseil de l\'Ordre invalide', ERROR_CODES.INVALID_EMAIL);
  }
  const cleanRecipient = recipientEmail.trim();
  const cleanCc = typeof ccEmail === 'string' && ccEmail.trim() && emailRegex.test(ccEmail.trim())
    ? ccEmail.trim()
    : null;

  const prisma = prismaService.getInstance();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId: kineId }
  });
  if (!contract) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);
  if (contract.status !== 'COMPLETE') {
    throwErr(`Envoi impossible au statut ${contract.status}`, ERROR_CODES.IMMUTABLE_STATUS);
  }
  if (!contract.pdfFinalUrl) {
    throwErr('PDF final non encore généré', ERROR_CODES.PDF_NOT_READY);
  }

  const initiator = await prisma.kine.findUnique({ where: { id: kineId } });
  const { subject, html, text } = buildOrdreEmailContent({ contract, initiator });
  const initFullName = `${initiator.firstName || ''} ${initiator.lastName || ''}`.trim();

  // Signed URL pour Brevo (téléchargement côté Brevo, on garde le path interne en DB).
  const pdfSignedUrl = await gcsStorageService.generateContractPdfSignedUrl(contract.pdfFinalUrl);
  if (!pdfSignedUrl) {
    throwErr('Génération du lien PDF impossible', ERROR_CODES.PDF_NOT_READY);
  }

  const pdfFileName = `contrat-${contractId}.pdf`;
  // Le front pré-remplit le CC avec l'email du destinataire mais l'initiateur peut le modifier
  // (ou le retirer) avant l'envoi — on respecte la saisie.
  const ccList = cleanCc
    ? [{
        email: cleanCc,
        // Si le CC correspond au destinataire du contrat, on attache son nom pour l'affichage du header.
        name: cleanCc === contract.destinataireEmail
          ? `${contract.destinataireFirstName || ''} ${contract.destinataireLastName || ''}`.trim() || undefined
          : undefined,
      }]
    : undefined;

  let messageId = null;
  try {
    const result = await brevoMailService.sendTransactionalEmail({
      toEmail: cleanRecipient,
      subject,
      htmlContent: html,
      textContent: text,
      senderDisplayName: initFullName ? `${initFullName} via Mon Assistant Kiné` : undefined,
      replyTo: initiator.email ? { email: initiator.email, name: initFullName || undefined } : undefined,
      cc: ccList,
      attachment: [{ name: pdfFileName, url: pdfSignedUrl }],
    });
    messageId = result.messageId;
  } catch (err) {
    logger.warn(`Échec envoi Ordre Brevo (contrat ${sanitizeId(contractId)}) : ${err.code || 'UNKNOWN'}`);
    const e = new Error(err.message || 'Échec d\'envoi du mail à l\'Ordre');
    e.code = ERROR_CODES.EMAIL_SEND_FAILED;
    e.cause = err.code;
    throw e;
  }

  const auditLog = contractService.appendAuditEvent(contract.auditLog, {
    action: 'SENT_TO_ORDRE',
    by: kineId,
    meta: { recipient: cleanRecipient, cc: cleanCc, provider: 'BREVO', messageId },
  });

  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      ordreSentAt: new Date(),
      ordreRecipientEmail: cleanRecipient,
      ordreMessageId: messageId,
      auditLog,
    },
    select: { id: true, ordreSentAt: true, ordreRecipientEmail: true, ordreMessageId: true },
  });

  logger.info(`Contrat envoyé à l'Ordre : ${sanitizeId(contractId)} (kiné ${sanitizeId(kineId)})`);

  return { contract: updated, sentTo: cleanRecipient, messageId };
}

module.exports = {
  ERROR_CODES,
  getOrdreEmailForDept,
  buildOrdreEmailContent,
  previewOrdreEmail,
  sendToOrdre,
};
