// Règles métier de la ressource /api/bilans (brouillons et bilans V1).
// Le contrôleur ne fait que traduire DraftError en HTTP.
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { emptyDocument, validateDocument, isDocumentEmpty } = require('./bilanDocument');
const { getCatalog } = require('./bilanRenderService');
const { computeProgress } = require('./bilanJobRules');
const { resolveIdentity } = require('./pseudonymService');

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

// Identité du kiné pour la pseudonymisation (spec 2026-09-12) : jamais l'objet Kine complet.
async function loadIdentity(prisma, kineId) {
  return prisma.kine.findUnique({ where: { id: kineId }, select: { firstName: true, lastName: true, email: true } });
}

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
  const job = b.job
    ? { status: b.job.status, progress: computeProgress(b.job.status, b.job.segments.filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length, b.job.segmentsTotal, b.job.kind) }
    : null;
  return {
    id: b.id,
    status: b.status,
    type: b.type,
    motif: b.motif,
    updatedAt: b.updatedAt,
    createdAt: b.createdAt,
    patient: b.patient ? { id: b.patient.id, firstName: b.patient.firstName, lastName: b.patient.lastName } : null,
    job,
  };
}

async function listMyBilans({ kineId, statuses = DRAFT_STATUSES, limit = 20 }) {
  const prisma = prismaService.getInstance();
  const rows = await prisma.bilanKine.findMany({
    where: { kineId, isActive: true, status: { in: statuses } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { patient: { select: PATIENT_SELECT }, job: { select: { status: true, segmentsTotal: true, kind: true, segments: { select: { status: true } } } } },
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
  if (!expectedUpdatedAt || Number.isNaN(expected.getTime())) {
    throw new DraftError('INVALID_EXPECTED_UPDATED_AT', 400, 'Version attendue manquante ou invalide');
  }
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

// Résout les jetons d'identité de toutes les sections d'un document (spec 2026-09-12 : gabarit
// obligatoire, seule la fiche patient fait foi). Sans document (bilan hérité), rien à résoudre.
function resolveDocumentSections(document, identity) {
  if (!document) return null;
  return { ...document, sections: document.sections.map((s) => ({ ...s, text: resolveIdentity(s.text, identity) })) };
}

// Vrai si la résolution ne change le texte d'aucune section (déjà posée, ou éditée à la main) :
// évite d'écrire un document identique à celui déjà en base.
const sectionsUnchanged = (document, resolved) => document.sections.every((s, i) => s.text === resolved.sections[i].text);

async function attachPatient({ kineId, bilanId, patientId }) {
  const prisma = prismaService.getInstance();
  const bilan = await findOwnedBilan(prisma, kineId, bilanId);
  const patient = await findOwnedPatient(prisma, kineId, patientId);
  const kine = await loadIdentity(prisma, kineId);
  // Au rattachement, le document reste littéral (gabarit) jusqu'ici : la résolution est toujours écrite.
  const document = resolveDocumentSections(bilan.document, { patient, kine, at: bilan.createdAt });
  const data = document ? { patientId, document } : { patientId };
  return prisma.bilanKine.update({
    where: { id: bilanId },
    data,
    include: { patient: { select: PATIENT_SELECT } },
  });
}

async function finalizeBilan({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const bilan = await findOwnedBilan(prisma, kineId, bilanId);
  if (bilan.status === 'ENREGISTRE') throw new DraftError('ALREADY_FINALIZED', 409, 'Ce bilan est déjà enregistré');
  if (!bilan.patientId) throw new DraftError('PATIENT_REQUIRED', 400, 'Associe un patient avant d’enregistrer');
  if (isDocumentEmpty(bilan.document)) throw new DraftError('DOCUMENT_EMPTY', 400, 'Le bilan est vide');
  // Filet de sécurité avant de figer : la plupart du temps déjà résolu par attachPatient, donc
  // sans effet — on n'écrit le document que s'il reste quelque chose à résoudre.
  const kine = await loadIdentity(prisma, kineId);
  const resolved = resolveDocumentSections(bilan.document, { patient: bilan.patient, kine, at: bilan.createdAt });
  const document = resolved && !sectionsUnchanged(bilan.document, resolved) ? resolved : null;
  const data = document ? { status: 'ENREGISTRE', document } : { status: 'ENREGISTRE' };
  const updated = await prisma.bilanKine.update({
    where: { id: bilanId },
    data,
    include: { patient: { select: PATIENT_SELECT } },
  });
  logger.info(`Bilan ${bilanId} enregistré (kiné ${kineId})`);
  return updated;
}

// Un brouillon naît au clic sur un mode de saisie, avant toute frappe : celui qui reste vide
// — rien tapé, rien enregistré, aucun traitement — n'a aucune valeur de récupération et
// encombre la liste. Suppression en dur, comme le fait déjà `removeBilan` sur un BROUILLON.
const EMPTY_DRAFT_DAYS = Number(process.env.BILAN_EMPTY_DRAFT_DAYS) || 7;
const EMPTY_DRAFT_BATCH = 500;

/** Supprime les brouillons restés vides au-delà du délai. @returns {Promise<number>} nombre supprimé */
async function purgeEmptyDrafts() {
  const prisma = prismaService.getInstance();
  const before = new Date(Date.now() - EMPTY_DRAFT_DAYS * 24 * 60 * 60 * 1000);
  // `job: null` écarte tout bilan qui porte un traitement, même échoué : il est repris, pas vide.
  const candidates = await prisma.bilanKine.findMany({
    where: { status: 'BROUILLON', isActive: true, updatedAt: { lt: before }, job: null },
    select: { id: true, rawNotes: true, bilanHtml: true, document: true },
    take: EMPTY_DRAFT_BATCH,
  });
  // Le vide se juge en JS : les espaces seuls comptent comme vide, et un document JSON
  // ne se teste pas depuis une clause `where`.
  const ids = candidates
    .filter((b) => !String(b.rawNotes || '').trim() && !b.bilanHtml && isDocumentEmpty(b.document))
    .map((b) => b.id);
  if (ids.length === 0) return 0;
  const { count } = await prisma.bilanKine.deleteMany({ where: { id: { in: ids } } });
  logger.info(`Brouillons vides purgés : ${count} (sans activité depuis ${EMPTY_DRAFT_DAYS} jours)`);
  return count;
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
  PATIENT_SELECT,
  BILAN_TYPES,
  DRAFT_STATUSES,
  loadIdentity,
  createDraft,
  listMyBilans,
  getForEditor,
  updateDraft,
  attachPatient,
  finalizeBilan,
  removeBilan,
  purgeEmptyDrafts,
};
