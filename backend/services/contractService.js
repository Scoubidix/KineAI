const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

/**
 * Service de gestion des contrats remplacement/assistanat.
 * Niveau MVP étape 2 : CRUD brouillon initiateur uniquement.
 * Signature / envoi / PDF / lien magique : étapes ultérieures.
 */

const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  IMMUTABLE_STATUS: 'IMMUTABLE_STATUS',
  INVALID_DESTINATAIRE: 'INVALID_DESTINATAIRE',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  SIGNATURE_MISMATCH: 'SIGNATURE_MISMATCH',
  ALREADY_SIGNED: 'ALREADY_SIGNED',
  KINE_NOT_FOUND: 'KINE_NOT_FOUND',
};

// Normalise une signature texte pour comparaison souple : trim, collapse spaces, upper
function normalizeSignatureText(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function appendAuditEvent(existingLog, event) {
  const log = Array.isArray(existingLog) ? existingLog : [];
  return [...log, { at: new Date().toISOString(), ...event }];
}

function throwErr(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * Résout les infos destinataire depuis soit un contactKineId, soit des infos brutes.
 * Vérifie l'ownership du contact si fourni.
 */
async function resolveDestinataire(prisma, kineInitiateurId, payload) {
  const { contactKineId } = payload;

  if (contactKineId) {
    const contact = await prisma.contactKine.findFirst({
      where: { id: contactKineId, kineId: kineInitiateurId }
    });
    if (!contact) {
      throwErr('Contact destinataire introuvable', ERROR_CODES.CONTACT_NOT_FOUND);
    }
    return {
      contactKineId: contact.id,
      destinataireFirstName: contact.firstName,
      destinataireLastName: contact.lastName,
      destinataireEmail: contact.email,
      destinatairePhone: contact.phone,
    };
  }

  const { destinataireFirstName, destinataireLastName, destinataireEmail, destinatairePhone } = payload;
  if (!destinataireFirstName || !destinataireLastName || !destinataireEmail) {
    throwErr(
      'Soit contactKineId, soit destinataireFirstName + destinataireLastName + destinataireEmail',
      ERROR_CODES.INVALID_DESTINATAIRE
    );
  }
  return {
    contactKineId: null,
    destinataireFirstName,
    destinataireLastName,
    destinataireEmail,
    destinatairePhone: destinatairePhone || null,
  };
}

/**
 * Match interne kineDestinataireId via email (lookup silencieux, pas d'exposition de données).
 * Anti-self-match : on ignore si l'email correspond au kiné initiateur lui-même.
 */
async function matchKineDestinataire(prisma, email, kineInitiateurId) {
  if (!email) return null;
  const k = await prisma.kine.findUnique({ where: { email } });
  if (!k) return null;
  if (k.id === kineInitiateurId) return null;
  return k.id;
}

async function createContract({ kineInitiateurId, payload }) {
  const prisma = prismaService.getInstance();
  const { type, roleInitiateur, data } = payload;

  const dest = await resolveDestinataire(prisma, kineInitiateurId, payload);
  const kineDestinataireId = await matchKineDestinataire(prisma, dest.destinataireEmail, kineInitiateurId);

  const contract = await prisma.contract.create({
    data: {
      kineInitiateurId,
      type,
      roleInitiateur,
      contactKineId: dest.contactKineId,
      kineDestinataireId,
      destinataireFirstName: dest.destinataireFirstName,
      destinataireLastName: dest.destinataireLastName,
      destinataireEmail: dest.destinataireEmail,
      destinatairePhone: dest.destinatairePhone,
      data: data ?? {},
      status: 'BROUILLON',
    }
  });

  logger.info(`Contrat brouillon créé : ${sanitizeId(contract.id)} (kiné init ${sanitizeId(kineInitiateurId)})`);
  return contract;
}

async function getContractById(contractId, kineInitiateurId) {
  const prisma = prismaService.getInstance();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId },
    include: { signatures: true }
  });
  return contract || null;
}

/**
 * Liste les contrats accessibles à un kiné : ceux qu'il a initiés OU ceux où
 * il est destinataire identifié (kineDestinataireId).
 * Retourne un champ `role` calculé : 'INITIATEUR' | 'DESTINATAIRE'.
 */
async function listContractsByKine(kineId, { status, role } = {}) {
  const prisma = prismaService.getInstance();
  const orClauses = [];
  if (!role || role === 'INITIATEUR') orClauses.push({ kineInitiateurId: kineId });
  if (!role || role === 'DESTINATAIRE') orClauses.push({ kineDestinataireId: kineId });
  const where = { OR: orClauses };
  if (status) where.status = status;

  const contracts = await prisma.contract.findMany({
    where,
    select: {
      id: true,
      type: true,
      roleInitiateur: true,
      status: true,
      kineInitiateurId: true,
      kineDestinataireId: true,
      destinataireFirstName: true,
      destinataireLastName: true,
      destinataireEmail: true,
      pdfFinalUrl: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      ordreSentAt: true,
      ordreRecipientEmail: true,
      kineInitiateur: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return contracts.map(c => ({
    ...c,
    role: c.kineInitiateurId === kineId ? 'INITIATEUR' : 'DESTINATAIRE',
  }));
}

/**
 * Compte les contrats COMPLETE depuis lastContractsViewedAt côté initiateur,
 * pour afficher un badge "nouveau" sur l'item sidebar.
 */
async function getUnreadCount(kineId) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({
    where: { id: kineId },
    select: { lastContractsViewedAt: true }
  });
  const since = kine?.lastContractsViewedAt || new Date(0);
  const count = await prisma.contract.count({
    where: {
      kineInitiateurId: kineId,
      status: 'COMPLETE',
      completedAt: { gt: since },
    }
  });
  return count;
}

async function markContractsViewed(kineId) {
  const prisma = prismaService.getInstance();
  await prisma.kine.update({
    where: { id: kineId },
    data: { lastContractsViewedAt: new Date() }
  });
}

/**
 * Compte les contrats COMPLETE côté initiateur dont l'envoi au CDO n'a pas encore été fait.
 * Sert au badge "à déclarer" sur la card hub Mes contrats.
 */
async function getPendingOrdreCount(kineId) {
  const prisma = prismaService.getInstance();
  return prisma.contract.count({
    where: {
      kineInitiateurId: kineId,
      status: 'COMPLETE',
      ordreSentAt: null,
    }
  });
}

async function updateContract(contractId, kineInitiateurId, payload) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId }
  });
  if (!existing) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);

  // Update interdit dès qu'on est passé en SIGNE_INITIATEUR ou plus
  if (existing.status !== 'BROUILLON') {
    throwErr(
      `Contrat non modifiable au statut ${existing.status}`,
      ERROR_CODES.IMMUTABLE_STATUS
    );
  }

  // Si destinataire modifié → recalcul du match
  let updateData = {};
  const destinataireFields = [
    'contactKineId',
    'destinataireFirstName',
    'destinataireLastName',
    'destinataireEmail',
    'destinatairePhone',
  ];
  const destinataireChanged = destinataireFields.some(f => f in payload);

  if (destinataireChanged) {
    const dest = await resolveDestinataire(prisma, kineInitiateurId, {
      contactKineId: 'contactKineId' in payload ? payload.contactKineId : existing.contactKineId,
      destinataireFirstName: payload.destinataireFirstName ?? existing.destinataireFirstName,
      destinataireLastName: payload.destinataireLastName ?? existing.destinataireLastName,
      destinataireEmail: payload.destinataireEmail ?? existing.destinataireEmail,
      destinatairePhone: payload.destinatairePhone ?? existing.destinatairePhone,
    });
    const kineDestinataireId = await matchKineDestinataire(prisma, dest.destinataireEmail, kineInitiateurId);
    updateData = {
      contactKineId: dest.contactKineId,
      destinataireFirstName: dest.destinataireFirstName,
      destinataireLastName: dest.destinataireLastName,
      destinataireEmail: dest.destinataireEmail,
      destinatairePhone: dest.destinatairePhone,
      kineDestinataireId,
    };
  }

  if ('data' in payload) updateData.data = payload.data ?? {};
  if ('type' in payload) updateData.type = payload.type;
  if ('roleInitiateur' in payload) updateData.roleInitiateur = payload.roleInitiateur;

  return prisma.contract.update({
    where: { id: contractId },
    data: updateData,
  });
}

async function deleteContract(contractId, kineInitiateurId) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId }
  });
  if (!existing) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);

  // Suppression autorisée tant que le destinataire n'a pas pris connaissance / signé :
  // BROUILLON et SIGNE_INITIATEUR. ENVOYE doit d'abord être révoqué (→ SIGNE_INITIATEUR).
  // COMPLETE/ARCHIVE : intouchables (audit trail des 2 parties).
  if (!['BROUILLON', 'SIGNE_INITIATEUR'].includes(existing.status)) {
    throwErr(
      `Suppression interdite au statut ${existing.status}. Révoquez l'envoi d'abord.`,
      ERROR_CODES.IMMUTABLE_STATUS
    );
  }

  await prisma.contract.delete({ where: { id: contractId } });
  logger.info(`Contrat supprimé : ${sanitizeId(contractId)} (kiné ${sanitizeId(kineInitiateurId)})`);
}

/**
 * Pose la signature de l'initiateur via modal in-app.
 * Vérifie ownership, status BROUILLON, pas de signature INITIATEUR existante,
 * et que le texte de signature matche bien le nom complet du Kine.
 * Update Contract.status → SIGNE_INITIATEUR + auditLog.
 */
async function signInitiator({ contractId, kineId, signatureText, mention, ip, userAgent }) {
  const prisma = prismaService.getInstance();

  const existing = await prisma.contract.findFirst({
    where: { id: contractId, kineInitiateurId: kineId }
  });
  if (!existing) throwErr('Contrat introuvable', ERROR_CODES.NOT_FOUND);

  if (existing.status !== 'BROUILLON') {
    throwErr(`Signature impossible au statut ${existing.status}`, ERROR_CODES.IMMUTABLE_STATUS);
  }

  const kine = await prisma.kine.findUnique({ where: { id: kineId } });
  if (!kine) throwErr('Kiné introuvable', ERROR_CODES.KINE_NOT_FOUND);

  const expected = normalizeSignatureText(`${kine.firstName} ${kine.lastName}`);
  const provided = normalizeSignatureText(signatureText);
  if (!provided || provided !== expected) {
    throwErr('La signature doit correspondre exactement à votre prénom + nom', ERROR_CODES.SIGNATURE_MISMATCH);
  }

  const existingSig = await prisma.contractSignature.findFirst({
    where: { contractId, signerRole: 'INITIATEUR' }
  });
  if (existingSig) throwErr('Le contrat est déjà signé par vous', ERROR_CODES.ALREADY_SIGNED);

  const auditLog = appendAuditEvent(existing.auditLog, {
    action: 'INITIATOR_SIGNED',
    by: kineId,
    ip: ip || null,
    ua: userAgent || null,
  });

  const result = await prisma.$transaction(async (tx) => {
    const signature = await tx.contractSignature.create({
      data: {
        contractId,
        signerRole: 'INITIATEUR',
        signerKineId: kineId,
        signerEmail: kine.email,
        signerFirstName: kine.firstName,
        signerLastName: kine.lastName,
        signatureText: String(signatureText).trim(),
        mention: mention || 'Lu et approuvé',
        accountType: 'EXISTING_KINE',
        ip: ip || null,
        userAgent: userAgent || null,
      }
    });

    const contract = await tx.contract.update({
      where: { id: contractId },
      data: { status: 'SIGNE_INITIATEUR', auditLog }
    });

    return { contract, signature };
  });

  logger.info(`Signature initiateur posée : contrat ${sanitizeId(contractId)} (kiné ${sanitizeId(kineId)})`);
  return result;
}

module.exports = {
  ERROR_CODES,
  createContract,
  getContractById,
  listContractsByKine,
  updateContract,
  deleteContract,
  signInitiator,
  getUnreadCount,
  markContractsViewed,
  getPendingOrdreCount,
  appendAuditEvent,
  normalizeSignatureText,
};
