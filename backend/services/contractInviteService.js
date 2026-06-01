/**
 * Service d'orchestration de l'invitation destinataire :
 * - Envoi d'invitation : génère le magic token, envoie l'email via Brevo,
 *   et seulement en cas de succès commit l'update DB (anti-token orphelin)
 * - Révocation : invalide le magic token tant que pas signé
 * - Accès via token : valide, retourne contract ou erreur typée
 * - Création de session courte après identification
 */

const prismaService = require('./prismaService');
const magicLinkService = require('./magicLinkService');
const contractService = require('./contractService');
const brevoMailService = require('./brevoMailService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  IMMUTABLE_STATUS: 'IMMUTABLE_STATUS',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOKEN_USED: 'TOKEN_USED',
  TOKEN_MISMATCH: 'TOKEN_MISMATCH',
  CONTRACT_MISMATCH: 'CONTRACT_MISMATCH',
  INVALID_CHANNEL: 'INVALID_CHANNEL',
  INVALID_MODE: 'INVALID_MODE',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
};

function throwErr(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function getFrontendBase() {
  const url = process.env.FRONTEND_URL || 'http://localhost:3001';
  return url.replace(/\/$/, '');
}

function buildMagicLink(token) {
  return `${getFrontendBase()}/contrat/sign/${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CONTRACT_TYPE_LABEL = {
  REMPLACEMENT_LIBERAL: 'remplacement libéral',
  ASSISTANAT_LIBERAL: 'assistanat libéral',
};

/**
 * Construit le contenu de l'email envoyé via Brevo au destinataire.
 * Retourne { subject, html, text }. Le magicLink n'est jamais exposé au front initiateur :
 * il est seulement embarqué dans le corps de l'email.
 */
function buildEmailContent({ contract, initiator, magicLink }) {
  const initFullName = `${initiator.firstName || ''} ${initiator.lastName || ''}`.trim();
  const destFirstName = contract.destinataireFirstName || '';
  const contractLabel = CONTRACT_TYPE_LABEL[contract.type] || 'collaboration';
  const logoUrl = `${getFrontendBase()}/logo.jpg`;
  const appUrl = getFrontendBase();
  const year = new Date().getFullYear();

  const subject = `Contrat de ${contractLabel} — ${initFullName}`;

  const text = [
    `Bonjour ${destFirstName},`,
    '',
    `${initFullName} vous propose un contrat de ${contractLabel} à signer électroniquement.`,
    '',
    `Accédez au contrat via ce lien sécurisé :`,
    magicLink,
    '',
    `Ce lien est valable 7 jours. Vous pourrez consulter le contrat, compléter vos informations et le signer en ligne.`,
    '',
    `Si vous n'êtes pas ${destFirstName} ou si vous n'attendiez pas ce contrat, n'utilisez pas ce lien et signalez-le à l'expéditeur. Toute signature falsifiée constitue un faux en écriture (article 441-1 du Code pénal).`,
    '',
    `— Mon Assistant Kiné`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f2937;">
    <span style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      ${escapeHtml(initFullName)} vous propose un contrat de ${escapeHtml(contractLabel)} à signer.
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
            <!-- Header bandeau teal + logo -->
            <tr>
              <td align="center" style="background:#3899aa; border-radius:12px 12px 0 0; padding:28px 24px;">
                <img src="${escapeHtml(logoUrl)}" alt="Mon Assistant Kiné" width="64" height="64" style="display:block; border:0; outline:none; text-decoration:none; border-radius:50%; background:#ffffff; padding:6px;">
                <div style="color:#ffffff; font-size:18px; font-weight:600; margin-top:12px; letter-spacing:0.2px;">Mon Assistant Kiné</div>
              </td>
            </tr>
            <!-- Card principale -->
            <tr>
              <td style="background:#ffffff; padding:32px 32px 8px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
                <h1 style="margin:0 0 8px; font-size:22px; font-weight:700; color:#111827;">Contrat de ${escapeHtml(contractLabel)}</h1>
                <p style="margin:0 0 16px; font-size:15px; color:#4b5563;">à signer électroniquement</p>
                <p style="margin:0 0 16px; font-size:15px; line-height:1.5;">
                  Bonjour <strong>${escapeHtml(destFirstName)}</strong>,
                </p>
                <p style="margin:0 0 24px; font-size:15px; line-height:1.5;">
                  <strong>${escapeHtml(initFullName)}</strong> vous propose un contrat de ${escapeHtml(contractLabel)} à signer en ligne.
                </p>
                <!-- CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="center" style="padding:8px 0 24px;">
                      <a href="${escapeHtml(magicLink)}"
                         style="background:#3899aa; color:#ffffff; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px; display:inline-block; mso-padding-alt:0; box-shadow:0 2px 8px rgba(56,153,170,0.25);">
                        Accéder au contrat
                      </a>
                    </td>
                  </tr>
                </table>
                <!-- Encadré info expiration -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="background:#f0f9fa; border-left:3px solid #3899aa; border-radius:6px; padding:14px 16px;">
                      <p style="margin:0; font-size:13px; color:#1f2937; line-height:1.5;">
                        <strong style="color:#3899aa;">Lien valable 7 jours.</strong> Vous pourrez consulter le contrat, compléter vos informations et le signer en ligne.
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0; font-size:12px; color:#6b7280; line-height:1.5;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                  <span style="word-break:break-all; color:#3899aa;">${escapeHtml(magicLink)}</span>
                </p>
              </td>
            </tr>
            <!-- Mention sécurité -->
            <tr>
              <td style="background:#ffffff; padding:16px 32px 28px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; border-radius:0 0 12px 12px;">
                <hr style="border:none; border-top:1px solid #e5e7eb; margin:0 0 16px;">
                <p style="margin:0; font-size:11px; color:#9ca3af; line-height:1.5;">
                  Si vous n'êtes pas ${escapeHtml(destFirstName)} ou si vous n'attendiez pas ce contrat, n'utilisez pas ce lien et signalez-le à l'expéditeur.
                  Toute signature falsifiée constitue un faux en écriture (article 441-1 du Code pénal).
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td align="center" style="padding:20px 16px 8px;">
                <p style="margin:0; font-size:12px; color:#9ca3af;">
                  Envoyé via <a href="${escapeHtml(appUrl)}" style="color:#3899aa; text-decoration:none; font-weight:600;">Mon Assistant Kiné</a>
                </p>
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
 * Envoie une invitation au destinataire :
 * - Vérifie ownership + statut SIGNE_INITIATEUR (ou ENVOYE pour renvoi)
 * - Génère un magic token en mémoire (pas encore committé en DB)
 * - Envoie l'email via Brevo
 * - Seulement en cas de succès Brevo : commit l'update DB (hash, sentAt, status=ENVOYE)
 *   Ainsi, si l'envoi échoue, le contrat reste à son statut précédent et aucun token orphelin
 *   n'est stocké. L'utilisateur peut retenter directement.
 */
async function sendInvitation({ contractId, kineId, channel }) {
  if (!['EMAIL', 'WHATSAPP', 'BOTH'].includes(channel)) {
    throwErr('Canal invalide', ERROR_CODES.INVALID_CHANNEL);
  }
  // V1 : seul EMAIL est implémenté (Brevo). WhatsApp/BOTH refusés explicitement.
  if (channel !== 'EMAIL') {
    throwErr('Canal non supporté pour le moment', ERROR_CODES.INVALID_CHANNEL);
  }

  const prisma = prismaService.getInstance();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId: kineId }
  });
  if (!contract) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);

  // L'initiateur doit avoir signé avant d'envoyer (sous-étape 2 garantit ça)
  // On accepte SIGNE_INITIATEUR (1er envoi) et ENVOYE (renvoi, ex: nouveau lien)
  if (!['SIGNE_INITIATEUR', 'ENVOYE'].includes(contract.status)) {
    throwErr(
      `Envoi impossible au statut ${contract.status}. Signez le contrat d'abord.`,
      ERROR_CODES.IMMUTABLE_STATUS
    );
  }

  // Si le token actuel a déjà été utilisé pour signer, on ne renvoie pas
  if (contract.accessTokenUsedAt) {
    throwErr('Le lien a déjà été utilisé pour signer', ERROR_CODES.TOKEN_USED);
  }

  const initiator = await prisma.kine.findUnique({ where: { id: kineId } });

  const { token, hash, jti, expiresAt } = magicLinkService.generateMagicToken({
    contractId,
    signerRole: 'DESTINATAIRE',
  });
  const magicLink = buildMagicLink(token);

  const { subject, html, text } = buildEmailContent({ contract, initiator, magicLink });

  // Envoi via Brevo AVANT toute écriture DB.
  // From : adresse de service ; displayName personnalisé pour identifier l'initiateur ;
  // replyTo : email de l'initiateur pour permettre une réponse directe.
  const initFullName = `${initiator.firstName || ''} ${initiator.lastName || ''}`.trim();
  let messageId = null;
  try {
    const result = await brevoMailService.sendTransactionalEmail({
      toEmail: contract.destinataireEmail,
      toName: `${contract.destinataireFirstName || ''} ${contract.destinataireLastName || ''}`.trim() || undefined,
      subject,
      htmlContent: html,
      textContent: text,
      senderDisplayName: initFullName ? `${initFullName} via Mon Assistant Kiné` : undefined,
      replyTo: initiator.email ? { email: initiator.email, name: initFullName || undefined } : undefined,
    });
    messageId = result.messageId;
  } catch (err) {
    logger.warn(`Échec envoi email Brevo (contrat ${sanitizeId(contractId)}) : ${err.code || 'UNKNOWN'}`);
    const e = new Error(err.message || 'Échec d\'envoi de l\'email');
    e.code = ERROR_CODES.EMAIL_SEND_FAILED;
    e.cause = err.code;
    throw e;
  }

  // Succès Brevo : on commit l'update en DB
  const auditLog = contractService.appendAuditEvent(contract.auditLog, {
    action: 'INVITATION_SENT',
    by: kineId,
    meta: { channel, jti, provider: 'BREVO', messageId },
  });

  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      accessTokenHash: hash,
      accessTokenChannel: channel,
      accessTokenSentAt: new Date(),
      accessTokenExpiresAt: expiresAt,
      accessTokenUsedAt: null,
      accessTokenRevokedAt: null,
      status: 'ENVOYE',
      auditLog,
    }
  });

  logger.info(`Invitation contrat envoyée : ${sanitizeId(contractId)} (kiné ${sanitizeId(kineId)}, canal ${channel})`);

  return {
    contract: updated,
    sentTo: contract.destinataireEmail,
    expiresAt,
  };
}

/**
 * Révoque l'invitation. Tant que le destinataire n'a pas signé, l'initiateur
 * peut invalider le lien. Status retombe à SIGNE_INITIATEUR.
 */
async function revokeInvitation({ contractId, kineId }) {
  const prisma = prismaService.getInstance();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId: kineId }
  });
  if (!contract) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);
  if (contract.status !== 'ENVOYE') {
    throwErr(`Révocation impossible au statut ${contract.status}`, ERROR_CODES.IMMUTABLE_STATUS);
  }
  if (contract.accessTokenUsedAt) {
    throwErr('Le lien a déjà été utilisé pour signer', ERROR_CODES.TOKEN_USED);
  }

  const auditLog = contractService.appendAuditEvent(contract.auditLog, {
    action: 'INVITATION_REVOKED',
    by: kineId,
  });

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      accessTokenHash: null,
      accessTokenChannel: null,
      accessTokenExpiresAt: null,
      accessTokenRevokedAt: new Date(),
      status: 'SIGNE_INITIATEUR',
      auditLog,
    }
  });

  logger.info(`Invitation contrat révoquée : ${sanitizeId(contractId)} (kiné ${sanitizeId(kineId)})`);
}

/**
 * Récupère un contract à partir d'un magic token. Valide tous les invariants.
 * Retourne { contract, payload } ou throw avec code typé.
 */
async function getContractByMagicToken(token) {
  const payload = magicLinkService.verifyMagicToken(token);
  const prisma = prismaService.getInstance();

  const contract = await prisma.contract.findUnique({
    where: { accessTokenHash: payload.hash }
  });
  if (!contract) throwErr('Lien invalide', ERROR_CODES.TOKEN_INVALID);
  if (contract.id !== payload.contractId) {
    throwErr('Lien invalide', ERROR_CODES.CONTRACT_MISMATCH);
  }
  if (contract.accessTokenRevokedAt) throwErr('Lien révoqué', ERROR_CODES.TOKEN_REVOKED);
  if (contract.accessTokenUsedAt) throwErr('Lien déjà utilisé', ERROR_CODES.TOKEN_USED);
  if (contract.accessTokenExpiresAt && contract.accessTokenExpiresAt < new Date()) {
    throwErr('Lien expiré', ERROR_CODES.TOKEN_EXPIRED);
  }
  return { contract, payload };
}

/**
 * Infos publiques (avant identification du destinataire).
 * Pas d'exposition des données privées du destinataire (RGPD)
 * ni des conditions chiffrées du contrat (préférable d'attendre l'identification).
 */
async function getPublicContractInfo(token) {
  const { contract } = await getContractByMagicToken(token);
  const prisma = prismaService.getInstance();
  const initiator = await prisma.kine.findUnique({
    where: { id: contract.kineInitiateurId },
    select: { firstName: true, lastName: true }
  });

  const destinataireRole = contract.roleInitiateur === 'TITULAIRE'
    ? 'REMPLACANT_OU_ASSISTANT'
    : 'TITULAIRE';

  // Vérification : un compte Kine existe-t-il déjà avec l'email du destinataire ?
  const matchedKine = await prisma.kine.findUnique({
    where: { email: contract.destinataireEmail },
    select: { id: true }
  });

  return {
    contractId: contract.id,
    type: contract.type,
    destinataireRole,
    initiator: {
      firstName: initiator?.firstName || '',
      lastName: initiator?.lastName || '',
    },
    destinataireFirstName: contract.destinataireFirstName,
    destinataireLastName: contract.destinataireLastName,
    destinataireEmail: contract.destinataireEmail,
    hasExistingAccount: !!matchedKine,
    expiresAt: contract.accessTokenExpiresAt,
  };
}

/**
 * Crée une session token courte après identification.
 * mode ∈ EXISTING_KINE | NEW_KINE | GUEST
 */
async function startSession(token, mode) {
  if (!['EXISTING_KINE', 'NEW_KINE', 'GUEST'].includes(mode)) {
    throwErr('Mode invalide', ERROR_CODES.INVALID_MODE);
  }
  const { contract, payload } = await getContractByMagicToken(token);
  const sessionToken = magicLinkService.generateSessionToken({
    contractId: contract.id,
    signerRole: payload.signerRole,
    jti: payload.jti,
    mode,
  });

  // Audit de l'identification (sans loguer le mode complet pour pas exposer les choix utilisateur)
  const prisma = prismaService.getInstance();
  const auditLog = contractService.appendAuditEvent(contract.auditLog, {
    action: 'RECIPIENT_IDENTIFIED',
    meta: { mode, jti: payload.jti },
  });
  await prisma.contract.update({
    where: { id: contract.id },
    data: { auditLog }
  });

  logger.info(`Session destinataire ouverte : contrat ${sanitizeId(contract.id)} mode ${mode}`);
  return { sessionToken, contractId: contract.id, mode };
}

module.exports = {
  ERROR_CODES,
  buildMagicLink,
  buildEmailContent,
  sendInvitation,
  revokeInvitation,
  getContractByMagicToken,
  getPublicContractInfo,
  startSession,
};
