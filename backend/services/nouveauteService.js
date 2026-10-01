// services/nouveauteService.js
// Logique métier des « Nouveautés » (annonces produit in-app).
// Contenu global (Nouveaute) + accusés de lecture par kiné (NouveauteVue).

const prismaService = require('./prismaService');
const { getEffectivePlan } = require('./planService');
const { generateSignedUrl } = require('./gcsStorageService');
const logger = require('../utils/logger');

/**
 * Construit le filtre Prisma des contenus VISIBLES par un kiné sur un canal :
 * actifs, déjà publiés (une date future = programmé, invisible jusque-là), non expirés,
 * et — pour les nouveautés seulement — ciblés sur son plan (ou sans ciblage). Les news
 * sont pour tous. La borne de publication vit dans AND : getUnreadCount pose son propre
 * `publishedAt` au premier niveau et l'écraserait sinon.
 */
function buildVisibleWhere(kine, now = new Date(), canal = 'NOUVEAUTE') {
  const and = [
    { publishedAt: { lte: now } },
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  ];
  if (canal === 'NOUVEAUTE') {
    const plan = getEffectivePlan(kine, now);
    and.push({ OR: [{ ciblePlans: { isEmpty: true } }, { ciblePlans: { has: plan } }] });
  }
  return { isActive: true, canal, AND: and };
}

/**
 * Contenu tel que le kiné le reçoit. « vue » : déjà ouvert, OU publié avant la création du
 * compte (pas de faux « Nouveau » à l'inscription).
 */
async function toKineView(n, kine) {
  return {
    id: n.id,
    titre: n.titre,
    description: n.description,
    imageUrls: await signAll(n.imagePaths),
    categorie: n.categorie,
    ctaLabel: n.ctaLabel,
    ctaHref: n.ctaHref,
    publishedAt: n.publishedAt,
    vue: n.vues.length > 0 || new Date(n.publishedAt) <= new Date(kine.createdAt),
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
  return Promise.all(rows.map((n) => toKineView(n, kine)));
}

/**
 * Une page de news, de la plus récente à la plus ancienne. Curseur composite (date de la
 * dernière news reçue + son id) : deux news publiées à la même seconde ne se perdent pas.
 * On lit une ligne de plus que la page pour savoir s'il en reste.
 */
async function getNewsPage(kine, { before = null, beforeId = null, limit = 10 } = {}, now = new Date()) {
  const prisma = prismaService.getInstance();
  const where = buildVisibleWhere(kine, now, 'NEWS');
  if (before) {
    where.AND.push(
      beforeId !== null
        ? { OR: [{ publishedAt: { lt: before } }, { publishedAt: before, id: { lt: beforeId } }] }
        : { publishedAt: { lt: before } },
    );
  }
  const rows = await prisma.nouveaute.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { vues: { where: { kineId: kine.id }, select: { id: true } } },
  });
  const items = await Promise.all(rows.slice(0, limit).map((n) => toKineView(n, kine)));
  return { items, hasMore: rows.length > limit };
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

/** Marque tous les contenus visibles du canal comme vus pour ce kiné (idempotent). */
async function markSeen(kine, now = new Date(), canal = 'NOUVEAUTE') {
  const prisma = prismaService.getInstance();
  const visibles = await prisma.nouveaute.findMany({
    where: buildVisibleWhere(kine, now, canal),
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

/** Liste complète (actives + inactives, programmées comprises) d'un canal, pour l'admin. */
async function listAllForAdmin(canal = 'NOUVEAUTE') {
  const prisma = prismaService.getInstance();
  const rows = await prisma.nouveaute.findMany({ where: { canal }, orderBy: { publishedAt: 'desc' } });
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
  getNewsPage,
  getUnreadCount,
  markSeen,
  listAllForAdmin,
  createNouveaute,
  updateNouveaute,
  getById,
  deleteNouveaute,
};
