// services/bilanGuideService.js — Fiches pratiques des tests du bilan (texte Markdown + vidéo YouTube)
const prismaService = require('./prismaService');
const { parseYouTubeUrl } = require('../utils/youtube');

/** Erreur métier portée jusqu'au controller (code API + statut HTTP). */
class BilanGuideError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const adminGuide = (g) => ({
  content: g.content,
  youtubeId: g.youtubeId,
  youtubeStart: g.youtubeStart,
  updatedAt: g.updatedAt,
  updatedBy: g.updatedBy,
});

/** Clés des tests qui ont une fiche avec description (le contenu est trimé à l'écriture). */
async function listGuideKeys() {
  const prisma = prismaService.getInstance();
  const rows = await prisma.bilanTestGuide.findMany({ where: { content: { not: '' } }, select: { fieldKey: true } });
  return new Set(rows.map((r) => r.fieldKey));
}

/** Fiche d'un test actif, pour le kiné. Pas de fiche, description vide ou test inactif → 404. */
async function getGuide(fieldKey) {
  const prisma = prismaService.getInstance();
  const [field, guide] = await Promise.all([
    prisma.bilanCanonicalField.findUnique({ where: { key: fieldKey } }),
    prisma.bilanTestGuide.findUnique({ where: { fieldKey } }),
  ]);
  if (!field || !field.isActive || !guide || !guide.content) {
    throw new BilanGuideError('BILAN_GUIDE_NOT_FOUND', 404, 'Fiche non trouvée');
  }
  return {
    fieldKey,
    label: field.label,
    category: field.category,
    content: guide.content,
    youtubeId: guide.youtubeId,
    youtubeStart: guide.youtubeStart,
  };
}

/** Tests actifs du catalogue, chacun avec sa fiche ou null (les fiches orphelines ne remontent pas). */
async function listForAdmin() {
  const prisma = prismaService.getInstance();
  const [fields, guides] = await Promise.all([
    prisma.bilanCanonicalField.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { id: 'asc' }],
      select: { key: true, label: true, category: true, order: true },
    }),
    prisma.bilanTestGuide.findMany(),
  ]);
  const byKey = new Map(guides.map((g) => [g.fieldKey, g]));
  return fields.map((f) => {
    const g = byKey.get(f.key);
    return { fieldKey: f.key, label: f.label, category: f.category, order: f.order, guide: g ? adminGuide(g) : null };
  });
}

/** Crée ou met à jour la fiche d'un test actif. `videoUrl` null = pas de vidéo. */
async function upsertGuide(fieldKey, { content, videoUrl }, updatedBy) {
  const prisma = prismaService.getInstance();
  const field = await prisma.bilanCanonicalField.findUnique({ where: { key: fieldKey } });
  if (!field || !field.isActive) throw new BilanGuideError('BILAN_FIELD_NOT_FOUND', 404, 'Test non trouvé');

  let youtubeId = null;
  let youtubeStart = null;
  if (videoUrl) {
    const video = parseYouTubeUrl(videoUrl);
    if (!video) throw new BilanGuideError('INVALID_YOUTUBE_URL', 400, 'Lien YouTube non reconnu');
    youtubeId = video.id;
    youtubeStart = video.start;
  }

  const data = { content, youtubeId, youtubeStart, updatedBy: updatedBy || null };
  const guide = await prisma.bilanTestGuide.upsert({
    where: { fieldKey },
    create: { fieldKey, ...data },
    update: data,
  });
  return adminGuide(guide);
}

module.exports = { BilanGuideError, listGuideKeys, getGuide, listForAdmin, upsertGuide };
