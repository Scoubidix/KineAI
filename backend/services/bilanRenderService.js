const prismaService = require('./prismaService');
const { renderBilanHtml, wrapPrintDocument } = require('./bilanRenderer');
const { BILAN_TYPE_LABELS } = require('./bilanRenderer/format');

const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache = { fields: null, loadedAt: 0 };

async function getCatalog() {
  if (catalogCache.fields && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) return catalogCache.fields;
  const prisma = prismaService.getInstance();
  const fields = await prisma.bilanCanonicalField.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { id: 'asc' }],
  });
  catalogCache = { fields, loadedAt: Date.now() };
  return fields;
}

// Appelé après application du seed (et disponible pour les tests)
function invalidateCatalogCache() {
  catalogCache = { fields: null, loadedAt: 0 };
}

function buildTitle(bilan) {
  const type = BILAN_TYPE_LABELS[bilan.type] || bilan.type;
  if (!bilan.patient) return `Bilan ${type}`;
  return `Bilan ${type} - ${bilan.patient.firstName} ${bilan.patient.lastName}`;
}

/**
 * Charge un bilan du kiné (ownership), le catalogue, le kiné et les bilans antérieurs
 * référencés par document.comparison si includeEvolution, puis rend le HTML.
 * @throws {Error} code BILAN_NOT_FOUND
 */
async function renderForKine({ kineId, bilanId, includeEvolution = false }) {
  const prisma = prismaService.getInstance();
  const bilan = await prisma.bilanKine.findFirst({
    where: { id: bilanId, kineId, isActive: true },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, birthDate: true } },
      kine: { select: { firstName: true, lastName: true, rpps: true, adresseCabinet: true } },
    },
  });
  if (!bilan) {
    const err = new Error('Bilan non trouvé ou accès refusé');
    err.code = 'BILAN_NOT_FOUND';
    throw err;
  }

  let previousBilans = [];
  const previousIds = bilan.document?.comparison?.previousBilanIds || [];
  if (includeEvolution && previousIds.length > 0 && bilan.patientId) {
    previousBilans = await prisma.bilanKine.findMany({
      where: { id: { in: previousIds }, patientId: bilan.patientId, kineId, isActive: true, status: { not: 'BROUILLON' } },
      select: { id: true, type: true, createdAt: true, document: true, structuredData: true },
    });
  }

  const catalog = await getCatalog();
  const html = renderBilanHtml({
    document: bilan.document,
    legacyHtml: bilan.bilanHtml,
    catalog,
    kineProfile: bilan.kine,
    patient: bilan.patient,
    bilanType: bilan.type,
    bilanDate: bilan.createdAt,
    previousBilans,
    includeEvolution,
  });
  return { html, title: buildTitle(bilan), bilan };
}

async function renderPrintDocumentForKine(args) {
  const { html, title, bilan } = await renderForKine(args);
  return { fullHtml: wrapPrintDocument({ bodyHtml: html, title }), title, bilan };
}

module.exports = { getCatalog, invalidateCatalogCache, renderForKine, renderPrintDocumentForKine, buildTitle };
