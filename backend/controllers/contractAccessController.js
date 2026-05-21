/**
 * Controller des routes publiques d'accès au contrat via magic link.
 * Routes : /api/contract-access/...
 *
 * Pas d'authentification Firebase requise — la sécurité repose sur :
 * - Validation du magic token JWT (HS256 + hash en DB)
 * - Session token courte (1h) après identification
 * - Rate limiters dédiés (magicLinkAccessLimiter, magicLinkSignLimiter)
 */

const admin = require('../firebase/firebase');
const contractInviteService = require('../services/contractInviteService');
const contractService = require('../services/contractService');
const contractPdfService = require('../services/contractPdfService');
const gcsStorageService = require('../services/gcsStorageService');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeId, sanitizeEmail } = require('../utils/logSanitizer');

const ERR_TO_STATUS = {
  [contractInviteService.ERROR_CODES.NOT_FOUND]: 404,
  [contractInviteService.ERROR_CODES.TOKEN_INVALID]: 401,
  [contractInviteService.ERROR_CODES.TOKEN_EXPIRED]: 410,
  [contractInviteService.ERROR_CODES.TOKEN_REVOKED]: 410,
  [contractInviteService.ERROR_CODES.TOKEN_USED]: 410,
  [contractInviteService.ERROR_CODES.TOKEN_MISMATCH]: 401,
  [contractInviteService.ERROR_CODES.CONTRACT_MISMATCH]: 401,
  [contractInviteService.ERROR_CODES.INVALID_MODE]: 400,
  EMAIL_MISMATCH: 403,
  ACCOUNT_EXISTS: 409,
  KINE_NOT_FOUND: 404,
  SESSION_INVALID: 401,
  GUEST_PROFILE_INCOMPLETE: 400,
  SIGNATURE_MISMATCH: 400,
};

function handleErr(err, res, defaultMsg) {
  const status = ERR_TO_STATUS[err.code];
  if (status) return res.status(status).json({ success: false, error: err.message, code: err.code });
  logger.error('Erreur contractAccessController:', err);
  return res.status(500).json({ success: false, error: defaultMsg, code: 'INTERNAL_ERROR' });
}

/**
 * GET /api/contract-access/:token
 * Renvoie les infos publiques minimales avant identification.
 */
exports.getPublicInfo = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ success: false, error: 'Token manquant', code: 'TOKEN_MISSING' });

    const info = await contractInviteService.getPublicContractInfo(token);
    res.json({ success: true, info });
  } catch (err) {
    return handleErr(err, res, 'Erreur accès contrat');
  }
};

/**
 * POST /api/contract-access/:token/identify
 * Body : { mode: 'EXISTING_KINE' | 'NEW_KINE' | 'GUEST', firebaseIdToken?: string }
 * Pour EXISTING_KINE/NEW_KINE : vérifie le firebase token + lie le Kine au contrat.
 * Retourne un session token court (1h).
 */
exports.identify = async (req, res) => {
  try {
    const { token } = req.params;
    const { mode, firebaseIdToken } = req.body || {};

    if (!['EXISTING_KINE', 'NEW_KINE', 'GUEST'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'Mode invalide', code: 'INVALID_MODE' });
    }

    // Valide d'abord le magic token et récupère le contract
    const { contract, payload } = await contractInviteService.getContractByMagicToken(token);

    // Gestion par mode
    let linkedKineId = null;

    if (mode === 'EXISTING_KINE') {
      if (!firebaseIdToken) {
        return res.status(400).json({ success: false, error: 'Identifiant Firebase manquant', code: 'FIREBASE_TOKEN_MISSING' });
      }
      const decoded = await admin.auth().verifyIdToken(firebaseIdToken).catch(() => null);
      if (!decoded) return res.status(401).json({ success: false, error: 'Identifiant Firebase invalide', code: 'FIREBASE_TOKEN_INVALID' });

      const prisma = prismaService.getInstance();
      const kine = await prisma.kine.findUnique({ where: { uid: decoded.uid } });
      if (!kine) return res.status(404).json({ success: false, error: 'Aucun compte trouvé', code: 'KINE_NOT_FOUND' });

      if (kine.email.toLowerCase() !== contract.destinataireEmail.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'L\'email du compte connecté ne correspond pas au destinataire du contrat',
          code: 'EMAIL_MISMATCH'
        });
      }
      linkedKineId = kine.id;
    }

    if (mode === 'NEW_KINE') {
      if (!firebaseIdToken) {
        return res.status(400).json({ success: false, error: 'Identifiant Firebase manquant', code: 'FIREBASE_TOKEN_MISSING' });
      }
      const decoded = await admin.auth().verifyIdToken(firebaseIdToken).catch(() => null);
      if (!decoded) return res.status(401).json({ success: false, error: 'Identifiant Firebase invalide', code: 'FIREBASE_TOKEN_INVALID' });

      // Vérifie email Firebase matche destinataire (anti-bypass)
      const firebaseEmail = (decoded.email || '').toLowerCase();
      if (firebaseEmail !== contract.destinataireEmail.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'L\'email du compte créé doit être celui du destinataire',
          code: 'EMAIL_MISMATCH'
        });
      }

      const prisma = prismaService.getInstance();
      const existing = await prisma.kine.findUnique({ where: { uid: decoded.uid } });
      if (existing) {
        // Compte déjà créé : on bascule en EXISTING_KINE
        if (existing.email.toLowerCase() !== contract.destinataireEmail.toLowerCase()) {
          return res.status(403).json({ success: false, error: 'Email du compte ne correspond pas', code: 'EMAIL_MISMATCH' });
        }
        linkedKineId = existing.id;
      } else {
        // Création du Kine — emailVerified true car prouvé par le magic link reçu sur cet email
        const newKine = await prisma.kine.create({
          data: {
            uid: decoded.uid,
            email: contract.destinataireEmail,
            firstName: contract.destinataireFirstName,
            lastName: contract.destinataireLastName,
            phone: contract.destinatairePhone || null,
          }
        });
        linkedKineId = newKine.id;
        logger.info(`Compte Kine créé via magic link : ${sanitizeId(newKine.id)} (email ${sanitizeEmail(newKine.email)})`);
      }
    }

    // Si le destinataire est un Kine identifié, on lie le contrat à son compte
    if (linkedKineId && !contract.kineDestinataireId) {
      const prisma = prismaService.getInstance();
      await prisma.contract.update({
        where: { id: contract.id },
        data: { kineDestinataireId: linkedKineId },
      });
    }

    // Génération de la session
    const { sessionToken: tok } = await contractInviteService.startSession(token, mode);

    res.json({
      success: true,
      sessionToken: tok,
      contractId: contract.id,
      mode,
      linkedKineId: linkedKineId || null,
    });
  } catch (err) {
    return handleErr(err, res, 'Erreur identification');
  }
};

/**
 * GET /api/contract-access/me
 * Renvoie l'état complet du contrat pour le destinataire (avec sa session).
 * Inclut data, profil destinataire actuel (Kine OU guestData), liste signatures.
 */
exports.getSessionContext = async (req, res) => {
  try {
    const { contractId, mode } = req.contractSession;
    const prisma = prismaService.getInstance();
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { signatures: true, kineDestinataire: true },
    });
    if (!contract) return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });

    // Initiateur (infos publiques uniquement)
    const initiator = await prisma.kine.findUnique({
      where: { id: contract.kineInitiateurId },
      select: { firstName: true, lastName: true, email: true },
    });

    // Profil destinataire selon mode
    let destinataireProfile = null;
    if (mode === 'GUEST') {
      const sigDest = contract.signatures.find(s => s.signerRole === 'DESTINATAIRE');
      destinataireProfile = (sigDest && sigDest.guestData) || null;
    } else if (contract.kineDestinataire) {
      const k = contract.kineDestinataire;
      destinataireProfile = {
        firstName: k.firstName,
        lastName: k.lastName,
        email: k.email,
        civilite: k.civilite,
        birthDate: k.birthDate,
        birthPlace: k.birthPlace,
        departementOrdre: k.departementOrdre,
        numeroOrdinal: k.numeroOrdinal,
        numeroUrssaf: k.numeroUrssaf,
        adresseCabinet: k.adresseCabinet,
        adresseDomicile: k.adresseDomicile,
      };
    }

    const initiatorSigned = !!contract.signatures.find(s => s.signerRole === 'INITIATEUR');
    const destinataireSigned = !!contract.signatures.find(s => s.signerRole === 'DESTINATAIRE');

    res.json({
      success: true,
      mode,
      contract: {
        id: contract.id,
        type: contract.type,
        roleInitiateur: contract.roleInitiateur,
        status: contract.status,
        data: contract.data,
        destinataireFirstName: contract.destinataireFirstName,
        destinataireLastName: contract.destinataireLastName,
        destinataireEmail: contract.destinataireEmail,
        completedAt: contract.completedAt,
        initiatorSigned,
        destinataireSigned,
      },
      initiator,
      destinataireProfile,
    });
  } catch (err) {
    return handleErr(err, res, 'Erreur chargement contexte');
  }
};

/**
 * POST /api/contract-access/me/profile
 * Body : profil destinataire (civilité, birthDate, birthPlace, dépt ordre, etc.)
 * Pour mode EXISTING_KINE/NEW_KINE : update le Kine
 * Pour mode GUEST : stocké temporairement, appliqué à la signature finale
 */
exports.saveProfile = async (req, res) => {
  try {
    const { contractId, mode } = req.contractSession;
    const prisma = prismaService.getInstance();

    const profileData = {
      civilite: req.body.civilite || null,
      birthDate: req.body.birthDate || null,
      birthPlace: req.body.birthPlace || null,
      departementOrdre: req.body.departementOrdre || null,
      numeroOrdinal: req.body.numeroOrdinal || null,
      numeroUrssaf: req.body.numeroUrssaf || null,
      adresseCabinet: req.body.adresseCabinet || null,
      adresseDomicile: req.body.adresseDomicile || null,
    };

    if (mode === 'GUEST') {
      // Stockage temporaire dans le contrat en attendant la signature
      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      const auditLog = contractService.appendAuditEvent(contract.auditLog, {
        action: 'RECIPIENT_PROFILE_SAVED',
        meta: { mode: 'GUEST' },
      });
      // On stocke le profil "draft" dans data.recipientDraftProfile (sera transféré à la signature)
      const data = { ...(contract.data || {}), recipientDraftProfile: profileData };

      // En GUEST uniquement, on autorise la correction du prénom/nom : l'initiateur peut s'être
      // trompé en créant le contact. Email reste verrouillé (sert pour le magic link).
      const updateFields = { data, auditLog };
      const fn = typeof req.body.firstName === 'string' ? req.body.firstName.trim() : '';
      const ln = typeof req.body.lastName === 'string' ? req.body.lastName.trim() : '';
      if (fn) updateFields.destinataireFirstName = fn;
      if (ln) updateFields.destinataireLastName = ln;

      await prisma.contract.update({
        where: { id: contractId },
        data: updateFields
      });
    } else {
      // EXISTING_KINE / NEW_KINE : update Kine
      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract.kineDestinataireId) {
        return res.status(409).json({ success: false, error: 'Compte Kine non lié au contrat', code: 'NO_LINKED_KINE' });
      }
      const updateData = {};
      Object.entries(profileData).forEach(([k, v]) => {
        if (v === null) {
          updateData[k] = null;
        } else if (k === 'birthDate') {
          updateData[k] = v ? new Date(v) : null;
        } else {
          updateData[k] = v;
        }
      });
      await prisma.kine.update({ where: { id: contract.kineDestinataireId }, data: updateData });

      const auditLog = contractService.appendAuditEvent(contract.auditLog, {
        action: 'RECIPIENT_PROFILE_SAVED',
        meta: { mode, kineId: contract.kineDestinataireId },
      });
      await prisma.contract.update({ where: { id: contractId }, data: { auditLog } });
    }

    res.json({ success: true });
  } catch (err) {
    return handleErr(err, res, 'Erreur sauvegarde profil');
  }
};

/**
 * GET /api/contract-access/me/preview-pdf
 * Renvoie le PDF de prévisualisation incluant les données destinataire.
 * Utilisé avant signature finale pour relecture.
 */
exports.previewPdf = async (req, res) => {
  try {
    const { contractId, mode } = req.contractSession;
    const prisma = prismaService.getInstance();
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { kineDestinataire: true },
    });
    if (!contract) return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });

    const initiator = await prisma.kine.findUnique({ where: { id: contract.kineInitiateurId } });

    // Construit le "kineDestinataire" virtuel à partir du mode :
    let destinataire = null;
    if (mode === 'GUEST') {
      const draft = contract.data?.recipientDraftProfile || {};
      destinataire = {
        firstName: contract.destinataireFirstName,
        lastName: contract.destinataireLastName,
        email: contract.destinataireEmail,
        ...draft,
      };
    } else if (contract.kineDestinataire) {
      destinataire = contract.kineDestinataire;
    }

    const contractPdfService = require('../services/contractPdfService');
    let pdfBuffer;
    try {
      pdfBuffer = await contractPdfService.generateContractPdf(contract, initiator, destinataire);
    } catch (err) {
      if (err.code === contractPdfService.ERROR_CODES.PUPPETEER_DISABLED) {
        return res.status(503).json({ success: false, error: err.message, code: err.code });
      }
      if (err.code === contractPdfService.ERROR_CODES.UNSUPPORTED_TYPE) {
        return res.status(400).json({ success: false, error: err.message, code: err.code });
      }
      throw err;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrat-${contract.id}-destinataire.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    return handleErr(err, res, 'Erreur preview PDF');
  }
};

/**
 * POST /api/contract-access/me/sign
 * Body : { signatureText, mention }
 * Effectue la signature finale du destinataire.
 * Si l'initiateur a aussi signé → status COMPLETE.
 */
exports.sign = async (req, res) => {
  try {
    const { contractId, mode } = req.contractSession;
    const { signatureText, mention } = req.body || {};
    if (!signatureText || String(signatureText).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Signature requise', code: 'SIGNATURE_MISSING' });
    }

    const prisma = prismaService.getInstance();
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { signatures: true, kineDestinataire: true },
    });
    if (!contract) return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });
    if (contract.status !== 'ENVOYE') {
      return res.status(409).json({ success: false, error: `Signature impossible au statut ${contract.status}`, code: 'IMMUTABLE_STATUS' });
    }
    if (contract.signatures.find(s => s.signerRole === 'DESTINATAIRE')) {
      return res.status(409).json({ success: false, error: 'Contrat déjà signé par vous', code: 'ALREADY_SIGNED' });
    }

    // Détermine prénom/nom attendus selon le mode
    let expectedFirst, expectedLast, signerEmail, signerKineId = null, guestData = null;
    if (mode === 'GUEST') {
      const draft = contract.data?.recipientDraftProfile || {};
      if (!draft.civilite || !draft.birthDate || !draft.birthPlace || !draft.departementOrdre || !draft.numeroOrdinal) {
        return res.status(400).json({
          success: false,
          error: 'Profil destinataire incomplet — complétez votre profil avant de signer',
          code: 'GUEST_PROFILE_INCOMPLETE'
        });
      }
      expectedFirst = contract.destinataireFirstName;
      expectedLast = contract.destinataireLastName;
      signerEmail = contract.destinataireEmail;
      guestData = draft;
    } else if (contract.kineDestinataire) {
      expectedFirst = contract.kineDestinataire.firstName;
      expectedLast = contract.kineDestinataire.lastName;
      signerEmail = contract.kineDestinataire.email;
      signerKineId = contract.kineDestinataire.id;
    } else {
      return res.status(409).json({ success: false, error: 'Profil destinataire non lié au contrat', code: 'NO_LINKED_PROFILE' });
    }

    const expected = contractService.normalizeSignatureText(`${expectedFirst} ${expectedLast}`);
    const provided = contractService.normalizeSignatureText(signatureText);
    if (!provided || provided !== expected) {
      return res.status(400).json({
        success: false,
        error: 'La signature doit correspondre exactement à votre prénom + nom',
        code: 'SIGNATURE_MISMATCH'
      });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    const initiatorSigned = !!contract.signatures.find(s => s.signerRole === 'INITIATEUR');
    const willComplete = initiatorSigned; // En V1 l'initiateur signe toujours avant l'envoi

    const auditLog = contractService.appendAuditEvent(contract.auditLog, {
      action: willComplete ? 'CONTRACT_COMPLETED' : 'RECIPIENT_SIGNED',
      by: signerKineId || null,
      ip: ip || null,
      ua: userAgent || null,
      meta: { mode, jti: req.contractSession.jti },
    });

    await prisma.$transaction(async (tx) => {
      await tx.contractSignature.create({
        data: {
          contractId,
          signerRole: 'DESTINATAIRE',
          signerKineId,
          signerEmail,
          signerFirstName: expectedFirst,
          signerLastName: expectedLast,
          signatureText: String(signatureText).trim(),
          mention: mention || 'Lu et approuvé',
          accountType: mode,
          guestData,
          ip,
          userAgent,
        }
      });

      const updateData = {
        accessTokenUsedAt: new Date(),
        auditLog,
      };
      if (willComplete) {
        updateData.status = 'COMPLETE';
        updateData.completedAt = new Date();
      }
      await tx.contract.update({ where: { id: contractId }, data: updateData });
    });

    logger.info(`Signature destinataire posée : contrat ${sanitizeId(contractId)} mode ${mode}`);

    // Génération du PDF final scellé + upload GCS si les 2 parties ont signé
    if (willComplete) {
      try {
        const fullContract = await prisma.contract.findUnique({
          where: { id: contractId },
          include: { signatures: true, kineDestinataire: true }
        });
        const initiator = await prisma.kine.findUnique({ where: { id: fullContract.kineInitiateurId } });

        // Construit le destinataire effectif en respectant le mode choisi par le destinataire.
        // En GUEST, même si un compte Kine est lié (via matchKineDestinataire à la création), on
        // doit utiliser le guestData saisi dans le wizard — c'est ce que l'utilisateur a relu en
        // aperçu, et c'est le profil sur lequel il a apposé sa signature.
        let destinataireForPdf;
        if (mode === 'GUEST' && guestData) {
          destinataireForPdf = {
            firstName: fullContract.destinataireFirstName,
            lastName: fullContract.destinataireLastName,
            email: fullContract.destinataireEmail,
            civilite: guestData.civilite || null,
            birthDate: guestData.birthDate ? new Date(guestData.birthDate) : null,
            birthPlace: guestData.birthPlace || null,
            departementOrdre: guestData.departementOrdre || null,
            numeroOrdinal: guestData.numeroOrdinal || null,
            numeroUrssaf: guestData.numeroUrssaf || null,
            adresseCabinet: guestData.adresseCabinet || null,
            adresseDomicile: guestData.adresseDomicile || null,
          };
        } else if (fullContract.kineDestinataire) {
          destinataireForPdf = fullContract.kineDestinataire;
        }

        const { buffer, hash } = await contractPdfService.generateFinalPdf(fullContract, initiator, destinataireForPdf);
        const path = await gcsStorageService.uploadContractPdf(buffer, contractId);
        await prisma.contract.update({
          where: { id: contractId },
          data: {
            pdfFinalUrl: path,
            pdfFinalHash: hash,
            pdfFinalGeneratedAt: new Date(),
          }
        });
        logger.info(`PDF final généré et uploadé : contrat ${sanitizeId(contractId)}`);
      } catch (err) {
        // On ne fait pas échouer la signature : le PDF peut être régénéré via un endpoint admin
        logger.error(`Échec génération/upload PDF final contrat ${sanitizeId(contractId)} :`, err);
      }
    }

    res.json({ success: true, completed: willComplete });
  } catch (err) {
    return handleErr(err, res, 'Erreur signature destinataire');
  }
};

/**
 * GET /api/contract-access/me/final-pdf
 * Renvoie une signed URL GCS 7j si le contrat est COMPLETE.
 */
exports.getFinalPdfUrl = async (req, res) => {
  try {
    const { contractId } = req.contractSession;
    const prisma = prismaService.getInstance();
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { status: true, pdfFinalUrl: true }
    });
    if (!contract) return res.status(404).json({ success: false, error: 'Contrat introuvable', code: 'NOT_FOUND' });
    if (contract.status !== 'COMPLETE' || !contract.pdfFinalUrl) {
      return res.status(409).json({ success: false, error: 'PDF final non encore disponible', code: 'PDF_NOT_READY' });
    }
    const url = await gcsStorageService.generateContractPdfSignedUrl(contract.pdfFinalUrl);
    if (!url) return res.status(500).json({ success: false, error: 'Erreur génération URL', code: 'SIGN_URL_FAILED' });
    res.json({ success: true, url });
  } catch (err) {
    return handleErr(err, res, 'Erreur accès PDF final');
  }
};
