// services/roadmapService.js — Roadmap publique (cards) + boîte à idées des kinés
const prismaService = require('./prismaService');

/** Erreur métier portée jusqu'au controller (code API + statut HTTP). */
class RoadmapError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Champs exposés aux kinés : rien d'interne (isActive, updatedAt restent côté admin)
const PUBLIC_SELECT = {
  id: true,
  titre: true,
  description: true,
  horizon: true,
  statut: true,
  isObjectifPrincipal: true,
  createdAt: true,
};

const IDEE_KINE_SELECT = { id: true, firstName: true, lastName: true, email: true };
const IDEE_ITEM_SELECT = { id: true, titre: true };
const IDEE_INCLUDE = { kine: { select: IDEE_KINE_SELECT }, item: { select: IDEE_ITEM_SELECT } };

// Dans un groupe : ce qui est en cours d'abord, puis le prévu, puis par ancienneté
const STATUT_RANK = { EN_COURS: 0, PREVU: 1 };

function sortGroup(items) {
  return [...items].sort(
    (a, b) => (STATUT_RANK[a.statut] - STATUT_RANK[b.statut]) || (a.createdAt - b.createdAt)
  );
}

/**
 * Découpe une liste de cards en sections pour la page kiné.
 * Une card livrée va toujours dans `livrees`, même si elle porte encore le flag objectif n°1.
 */
function groupItems(items) {
  const livrees = items.filter((i) => i.statut === 'LIVRE');
  const ouvertes = items.filter((i) => i.statut !== 'LIVRE');
  const objectifPrincipal = ouvertes.find((i) => i.isObjectifPrincipal) || null;
  const reste = ouvertes.filter((i) => i !== objectifPrincipal);
  return {
    objectifPrincipal,
    courtTerme: sortGroup(reste.filter((i) => i.horizon === 'COURT_TERME')),
    moyenLongTerme: sortGroup(reste.filter((i) => i.horizon === 'MOYEN_LONG_TERME')),
    livrees: [...livrees].sort((a, b) => b.createdAt - a.createdAt),
  };
}

// ===================== KINÉ =====================

async function getRoadmapForKine() {
  const prisma = prismaService.getInstance();
  const items = await prisma.roadmapItem.findMany({
    where: { isActive: true },
    select: PUBLIC_SELECT,
    orderBy: { createdAt: 'asc' },
  });
  return groupItems(items);
}

/**
 * Le kiné est résolu par son uid Firebase : le corps ne peut pas imposer un kineId.
 * itemId (optionnel) doit pointer sur une card existante et active.
 */
async function createIdee(uid, { titre, description, itemId }) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new RoadmapError('KINE_NOT_FOUND', 404, 'Kiné non trouvé');
  if (itemId !== undefined) {
    const item = await prisma.roadmapItem.findUnique({ where: { id: itemId }, select: { id: true, isActive: true } });
    if (!item || !item.isActive) throw new RoadmapError('ROADMAP_ITEM_NOT_FOUND', 404, 'Card non trouvée');
  }
  return prisma.roadmapIdee.create({
    data: { kineId: kine.id, titre, description, itemId: itemId ?? null },
  });
}

// ===================== ADMIN — CARDS =====================

/** Liste admin : chaque card porte ideesCount (idées liées, tous statuts). */
async function listAllItems() {
  const prisma = prismaService.getInstance();
  const items = await prisma.roadmapItem.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { idees: true } } },
  });
  return items.map(({ _count, ...item }) => ({ ...item, ideesCount: _count.idees }));
}

async function getItemOrThrow(prisma, id) {
  const existing = await prisma.roadmapItem.findUnique({ where: { id } });
  if (!existing) throw new RoadmapError('ROADMAP_ITEM_NOT_FOUND', 404, 'Card non trouvée');
  return existing;
}

/**
 * Une seule card « Objectif n°1 » : poser le flag retire celui des autres,
 * dans la même transaction que l'écriture.
 */
async function createItem(data) {
  const prisma = prismaService.getInstance();
  if (!data.isObjectifPrincipal) return prisma.roadmapItem.create({ data });
  return prisma.$transaction(async (tx) => {
    await tx.roadmapItem.updateMany({ where: { isObjectifPrincipal: true }, data: { isObjectifPrincipal: false } });
    return tx.roadmapItem.create({ data });
  });
}

async function updateItem(id, data) {
  const prisma = prismaService.getInstance();
  await getItemOrThrow(prisma, id);
  if (!data.isObjectifPrincipal) return prisma.roadmapItem.update({ where: { id }, data });
  return prisma.$transaction(async (tx) => {
    await tx.roadmapItem.updateMany({
      where: { isObjectifPrincipal: true, id: { not: id } },
      data: { isObjectifPrincipal: false },
    });
    return tx.roadmapItem.update({ where: { id }, data });
  });
}

/** Hard delete assumé : contenu éditorial, aucune donnée de santé (cf. spec). */
async function deleteItem(id) {
  const prisma = prismaService.getInstance();
  await getItemOrThrow(prisma, id);
  await prisma.roadmapItem.delete({ where: { id } });
}

// ===================== ADMIN — IDÉES =====================

async function listIdees({ statut, itemId } = {}) {
  const prisma = prismaService.getInstance();
  const where = {};
  if (statut) where.statut = statut;
  if (itemId !== undefined) where.itemId = itemId;
  return prisma.roadmapIdee.findMany({
    where,
    include: IDEE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

async function setIdeeStatut(id, statut) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.roadmapIdee.findUnique({ where: { id } });
  if (!existing) throw new RoadmapError('ROADMAP_IDEE_NOT_FOUND', 404, 'Idée non trouvée');
  return prisma.roadmapIdee.update({ where: { id }, data: { statut }, include: IDEE_INCLUDE });
}

module.exports = {
  RoadmapError,
  groupItems,
  getRoadmapForKine,
  createIdee,
  listAllItems,
  createItem,
  updateItem,
  deleteItem,
  listIdees,
  setIdeeStatut,
};
