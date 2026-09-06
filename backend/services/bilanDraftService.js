// Règles métier de la ressource /api/bilans (brouillons et bilans V1).
// Le contrôleur ne fait que traduire DraftError en HTTP.
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { emptyDocument, validateDocument, isDocumentEmpty } = require('./bilanDocument');
const { getCatalog } = require('./bilanRenderService');

const BILAN_TYPES = ['INITIAL', 'INTERMEDIAIRE', 'FINAL'];
const DRAFT_STATUSES = ['BROUILLON', 'GENERE'];

class DraftError extends Error {
  constructor(code, status, message, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const PATIENT_SELECT = { id: true, firstName: true, lastName: true, birthDate: true };

async function findOwnedPatient(prisma, kineId, patientId) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, kineId, isActive: true } });
  if (!patient) throw new DraftError('PATIENT_NOT_FOUND', 404, 'Patient non trouvé ou accès refusé');
  return patient;
}

async function findOwnedBilan(prisma, kineId, bilanId) {
  const bilan = await prisma.bilanKine.findFirst({
    where: { id: bilanId, kineId, isActive: true },
    include: { patient: { select: PATIENT_SELECT } },
  });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  return bilan;
}

async function createDraft({ kineId, type = 'INITIAL', patientId = null, motif = null }) {
  if (!BILAN_TYPES.includes(type)) throw new DraftError('INVALID_TYPE', 400, 'Type de bilan invalide');
  const prisma = prismaService.getInstance();
  if (patientId !== null) await findOwnedPatient(prisma, kineId, patientId);
  const bilan = await prisma.bilanKine.create({
    data: { kineId, patientId, type, status: 'BROUILLON', motif, rawNotes: null, document: emptyDocument() },
    include: { patient: { select: PATIENT_SELECT } },
  });
  logger.info(`Brouillon de bilan ${bilan.id} créé (kiné ${kineId})`);
  return bilan;
}

function toListItem(b) {
  return {
    id: b.id,
    status: b.status,
    type: b.type,
    motif: b.motif,
    updatedAt: b.updatedAt,
    createdAt: b.createdAt,
    patient: b.patient ? { id: b.patient.id, firstName: b.patient.firstName, lastName: b.patient.lastName } : null,
  };
}

async function listMyBilans({ kineId, statuses = DRAFT_STATUSES, limit = 20 }) {
  const prisma = prismaService.getInstance();
  const rows = await prisma.bilanKine.findMany({
    where: { kineId, isActive: true, status: { in: statuses } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { patient: { select: PATIENT_SELECT } },
  });
  return rows.map(toListItem);
}

async function getForEditor({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  return findOwnedBilan(prisma, kineId, bilanId);
}

// Champs modifiables par PATCH. Le statut et les relations passent par des actions dédiées.
const PATCHABLE = ['rawNotes', 'motif', 'type', 'document'];

async function updateDraft({ kineId, bilanId, patch, expectedUpdatedAt }) {
  const prisma = prismaService.getInstance();
  const data = {};
  for (const key of PATCHABLE) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }
  if (data.type !== undefined && !BILAN_TYPES.includes(data.type)) {
    throw new DraftError('INVALID_TYPE', 400, 'Type de bilan invalide');
  }
  if (data.document !== undefined) {
    const catalog = await getCatalog();
    const result = validateDocument(data.document, catalog);
    if (!result.success) throw new DraftError('INVALID_DOCUMENT', 400, 'Document invalide', { details: result.errors });
    data.document = result.data;
  }

  // Vérification et écriture en une seule requête (check-and-set atomique) : l'UPDATE ne
  // touche la ligne que si elle appartient au kiné, est active, et si updatedAt n'a pas bougé
  // depuis la lecture par le client. Deux requêtes (updateMany + findFirst) laisseraient une
  // fenêtre où la ligne peut disparaître ou être réécrite entre les deux, faussant le diagnostic.
  const expected = new Date(expectedUpdatedAt);
  try {
    const updated = await prisma.bilanKine.update({
      where: { id: bilanId, kineId, isActive: true, updatedAt: expected },
      data,
      select: { updatedAt: true },
    });
    return { updatedAt: updated.updatedAt };
  } catch (err) {
    // P2025 : aucune ligne ne correspond → soit le bilan n'existe plus, soit updatedAt a bougé
    if (err && err.code === 'P2025') {
      const current = await prisma.bilanKine.findFirst({ where: { id: bilanId, kineId, isActive: true }, select: { updatedAt: true } });
      if (!current) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
      throw new DraftError('STALE_DRAFT', 409, 'Ce bilan a été modifié ailleurs', { updatedAt: current.updatedAt });
    }
    throw err;
  }
}

async function attachPatient({ kineId, bilanId, patientId }) {
  const prisma = prismaService.getInstance();
  await findOwnedBilan(prisma, kineId, bilanId);
  await findOwnedPatient(prisma, kineId, patientId);
  return prisma.bilanKine.update({
    where: { id: bilanId },
    data: { patientId },
    include: { patient: { select: PATIENT_SELECT } },
  });
}

async function finalizeBilan({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const bilan = await findOwnedBilan(prisma, kineId, bilanId);
  if (bilan.status === 'ENREGISTRE') throw new DraftError('ALREADY_FINALIZED', 409, 'Ce bilan est déjà enregistré');
  if (!bilan.patientId) throw new DraftError('PATIENT_REQUIRED', 400, 'Associe un patient avant d’enregistrer');
  if (isDocumentEmpty(bilan.document)) throw new DraftError('DOCUMENT_EMPTY', 400, 'Le bilan est vide');
  const updated = await prisma.bilanKine.update({
    where: { id: bilanId },
    data: { status: 'ENREGISTRE' },
    include: { patient: { select: PATIENT_SELECT } },
  });
  logger.info(`Bilan ${bilanId} enregistré (kiné ${kineId})`);
  return updated;
}

async function removeBilan({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const bilan = await findOwnedBilan(prisma, kineId, bilanId);
  if (bilan.status === 'BROUILLON') {
    await prisma.bilanKine.delete({ where: { id: bilanId } });
    logger.info(`Brouillon ${bilanId} supprimé (kiné ${kineId})`);
    return { deleted: 'hard' };
  }
  await prisma.bilanKine.update({ where: { id: bilanId }, data: { isActive: false, deletedAt: new Date() } });
  logger.info(`Bilan ${bilanId} archivé (soft delete, kiné ${kineId})`);
  return { deleted: 'soft' };
}

module.exports = {
  DraftError,
  BILAN_TYPES,
  DRAFT_STATUSES,
  createDraft,
  listMyBilans,
  getForEditor,
  updateDraft,
  attachPatient,
  finalizeBilan,
  removeBilan,
};
