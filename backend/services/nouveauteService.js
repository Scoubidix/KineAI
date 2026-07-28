// services/nouveauteService.js
// Logique métier des « Nouveautés » (annonces produit in-app).
// Contenu global (Nouveaute) + accusés de lecture par kiné (NouveauteVue).

const prismaService = require('./prismaService');
const { getEffectivePlan } = require('./planService');
const { generateSignedUrl } = require('./gcsStorageService');
const logger = require('../utils/logger');

/**
 * Construit le filtre Prisma des nouveautés VISIBLES par un kiné :
 * actives, non expirées, et ciblées sur son plan (ou sans ciblage).
 */
function buildVisibleWhere(kine, now = new Date()) {
  const plan = getEffectivePlan(kine, now);
  return {
    isActive: true,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { OR: [{ ciblePlans: { isEmpty: true } }, { ciblePlans: { has: plan } }] },
    ],
  };
}

/**
 * Liste des nouveautés visibles par le kiné, triées de la plus récente à la plus
 * ancienne, chacune avec une `imageUrl` signée et un flag `vue`.
 * Une carte est considérée « vue » si le kiné l'a déjà ouverte OU si elle a été
 * publiée avant la création de son compte (évite les fausses « nouveautés » à l'inscription).
 */
async function getNouveautesForKine(kine, now = new Date()) {
  const prisma = prismaService.getInstance();

  const rows = await prisma.nouveaute.findMany({
    where: buildVisibleWhere(kine, now),
    orderBy: { publishedAt: 'desc' },
    include: { vues: { where: { kineId: kine.id }, select: { id: true } } },
  });

  const createdAt = new Date(kine.createdAt);

  return Promise.all(
    rows.map(async (n) => ({
      id: n.id,
      titre: n.titre,
      description: n.description,
      imageUrls: await signAll(n.imagePaths),
      categorie: n.categorie,
      ctaLabel: n.ctaLabel,
      ctaHref: n.ctaHref,
      publishedAt: n.publishedAt,
      vue: n.vues.length > 0 || new Date(n.publishedAt) <= createdAt,
    }))
  );
}

/**
 * Nombre de nouveautés « à signaler » (point pulsant) :
 * visibles, publiées APRÈS la création du compte, et pas encore vues.
 */
async function getUnreadCount(kine, now = new Date()) {
  const prisma = prismaService.getInstance();
  const where = buildVisibleWhere(kine, now);
  return prisma.nouveaute.count({
    where: {
      ...where,
      publishedAt: { gt: new Date(kine.createdAt) },
      vues: { none: { kineId: kine.id } },
    },
  });
}

/**
 * Marque toutes les nouveautés visibles comme vues pour ce kiné (idempotent).
 */
async function markSeen(kine, now = new Date()) {
  const prisma = prismaService.getInstance();
  const visibles = await prisma.nouveaute.findMany({
    where: buildVisibleWhere(kine, now),
    select: { id: true },
  });
  if (visibles.length === 0) return { marked: 0 };

  const result = await prisma.nouveauteVue.createMany({
    data: visibles.map((n) => ({ kineId: kine.id, nouveauteId: n.id })),
    skipDuplicates: true,
  });
  return { marked: result.count };
}

/** Génère une URL signée sans faire échouer toute la liste si un fichier manque. */
async function safeSignedUrl(imagePath) {
  try {
    return await generateSignedUrl(imagePath);
  } catch (error) {
    logger.warn('URL signée nouveauté indisponible:', error.message);
    return null;
  }
}

/** Signe une liste de chemins GCS, en écartant ceux qui échouent. */
async function signAll(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const urls = await Promise.all(paths.map(safeSignedUrl));
  return urls.filter(Boolean);
}

// ===================== ADMIN =====================

/** Liste complète (actives + inactives) pour la gestion admin. */
async function listAllForAdmin() {
  const prisma = prismaService.getInstance();
  const rows = await prisma.nouveaute.findMany({ orderBy: { publishedAt: 'desc' } });
  return Promise.all(
    rows.map(async (n) => ({
      ...n,
      imageUrls: await signAll(n.imagePaths),
    }))
  );
}

async function createNouveaute(data) {
  const prisma = prismaService.getInstance();
  return prisma.nouveaute.create({ data });
}

async function updateNouveaute(id, data) {
  const prisma = prismaService.getInstance();
  return prisma.nouveaute.update({ where: { id }, data });
}

async function getById(id) {
  const prisma = prismaService.getInstance();
  return prisma.nouveaute.findUnique({ where: { id } });
}

async function deleteNouveaute(id) {
  const prisma = prismaService.getInstance();
  return prisma.nouveaute.delete({ where: { id } });
}

module.exports = {
  buildVisibleWhere,
  getNouveautesForKine,
  getUnreadCount,
  markSeen,
  listAllForAdmin,
  createNouveaute,
  updateNouveaute,
  getById,
  deleteNouveaute,
};
