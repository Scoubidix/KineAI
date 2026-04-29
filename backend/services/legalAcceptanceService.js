// services/legalAcceptanceService.js
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');
const LEGAL_VERSIONS = require('../config/legalVersions');

const VALID_DOCUMENT_TYPES = Object.keys(LEGAL_VERSIONS);

/**
 * Enregistrer l'acceptation d'un document legal
 */
async function recordAcceptance(kineId, documentType, version, ipAddress) {
  if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
    throw new Error(`Type de document invalide: ${documentType}`);
  }

  const prisma = prismaService.getInstance();

  const acceptance = await prisma.legalAcceptance.create({
    data: {
      kineId,
      documentType,
      documentVersion: version,
      ipAddress: ipAddress || null
    }
  });

  logger.info(`Acceptation legale enregistree - Kine: ${sanitizeId(kineId)}, Doc: ${documentType} v${version}`);
  return acceptance;
}

/**
 * Enregistrer plusieurs acceptations en une transaction (signup)
 */
async function recordMultipleAcceptances(kineId, acceptances, ipAddress) {
  const prisma = prismaService.getInstance();

  const data = acceptances.map(({ documentType, version }) => {
    if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
      throw new Error(`Type de document invalide: ${documentType}`);
    }
    if (LEGAL_VERSIONS[documentType] !== version) {
      throw new Error(`Version invalide pour ${documentType}: attendu ${LEGAL_VERSIONS[documentType]}, recu ${version}`);
    }
    return {
      kineId,
      documentType,
      documentVersion: version,
      ipAddress: ipAddress || null
    };
  });

  const result = await prisma.legalAcceptance.createMany({ data });

  logger.info(`${result.count} acceptations legales enregistrees - Kine: ${sanitizeId(kineId)}`);
  return result;
}

/**
 * Verifier le statut d'acceptation d'un kine pour tous les documents
 * Retourne un objet avec le statut de chaque document
 */
async function getAcceptanceStatus(kineId) {
  const prisma = prismaService.getInstance();

  // Recuperer la derniere acceptation par type de document
  const acceptances = await prisma.legalAcceptance.findMany({
    where: { kineId },
    orderBy: { acceptedAt: 'desc' }
  });

  const status = {};
  for (const docType of VALID_DOCUMENT_TYPES) {
    const latest = acceptances.find(a => a.documentType === docType);
    const currentVersion = LEGAL_VERSIONS[docType];

    status[docType] = {
      accepted: latest ? latest.documentVersion : null,
      acceptedAt: latest ? latest.acceptedAt : null,
      current: currentVersion,
      upToDate: latest ? latest.documentVersion === currentVersion : false
    };
  }

  return status;
}

/**
 * Verifier si un kine est a jour sur tous les documents
 */
async function isFullyUpToDate(kineId) {
  const status = await getAcceptanceStatus(kineId);
  return Object.values(status).every(s => s.upToDate);
}

/**
 * Recuperer l'historique complet des acceptations d'un kine (audit/RGPD)
 */
async function getAcceptanceHistory(kineId) {
  const prisma = prismaService.getInstance();

  return prisma.legalAcceptance.findMany({
    where: { kineId },
    orderBy: { acceptedAt: 'desc' }
  });
}

module.exports = {
  recordAcceptance,
  recordMultipleAcceptances,
  getAcceptanceStatus,
  isFullyUpToDate,
  getAcceptanceHistory,
  VALID_DOCUMENT_TYPES
};
