// controllers/nouveautesController.js
const fs = require('fs');
const nouveauteService = require('../services/nouveauteService');
const prismaService = require('../services/prismaService');
const {
  validateImageBuffer,
  uploadNouveauteImage,
  deleteNouveauteImage,
  generateSignedUrl,
} = require('../services/gcsStorageService');
const logger = require('../utils/logger');

const VALID_PLANS = ['FREE', 'DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];
const VALID_CATEGORIES = ['NOUVEAUTE', 'AMELIORATION', 'OFFRE'];
const VALID_CANAUX = ['NOUVEAUTE', 'NEWS'];
const NEWS_PAGE_MAX = 20;

/** Charge le kiné (champs nécessaires au plan effectif + date de création). */
async function loadKine(uid) {
  const prisma = prismaService.getInstance();
  return prisma.kine.findUnique({
    where: { uid },
    select: { id: true, createdAt: true, planType: true, trialEndDate: true },
  });
}

// ===================== KINÉ =====================

async function getNouveautes(req, res) {
  try {
    const kine = await loadKine(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné non trouvé' });
    const nouveautes = await nouveauteService.getNouveautesForKine(kine);
    res.json({ success: true, nouveautes });
  } catch (error) {
    logger.error('Erreur getNouveautes:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des nouveautés', code: 'NOUVEAUTES_ERROR' });
  }
}

async function getUnreadCount(req, res) {
  try {
    const kine = await loadKine(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné non trouvé' });
    const count = await nouveauteService.getUnreadCount(kine);
    res.json({ success: true, count });
  } catch (error) {
    logger.error('Erreur getUnreadCount nouveautés:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du comptage', code: 'NOUVEAUTES_COUNT_ERROR' });
  }
}

async function markSeen(req, res) {
  try {
    const kine = await loadKine(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné non trouvé' });
    const result = await nouveauteService.markSeen(kine);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Erreur markSeen nouveautés:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du marquage', code: 'NOUVEAUTES_SEEN_ERROR' });
  }
}

// ===================== KINÉ — NEWS =====================

async function getNews(req, res) {
  try {
    const kine = await loadKine(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné non trouvé' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), NEWS_PAGE_MAX);
    let before = null;
    let beforeId = null;
    if (req.query.before) {
      before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ success: false, error: 'Curseur invalide', code: 'VALIDATION' });
      }
      const id = parseInt(req.query.beforeId, 10);
      beforeId = Number.isNaN(id) ? null : id;
    }
    const page = await nouveauteService.getNewsPage(kine, { before, beforeId, limit });
    res.json({ success: true, ...page });
  } catch (error) {
    logger.error('Erreur getNews:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des news', code: 'NEWS_ERROR' });
  }
}

async function markNewsSeen(req, res) {
  try {
    const kine = await loadKine(req.uid);
    if (!kine) return res.status(404).json({ success: false, error: 'Kiné non trouvé' });
    const result = await nouveauteService.markSeen(kine, new Date(), 'NEWS');
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Erreur markSeen news:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du marquage', code: 'NEWS_SEEN_ERROR' });
  }
}

// ===================== ADMIN =====================

/** Nettoie/valide le corps d'une nouveauté (create/update). `canal` : celui du contenu, jamais lu dans le corps. */
function parseBody(body, canal = 'NOUVEAUTE') {
  const data = {};
  if (typeof body.titre === 'string') data.titre = body.titre.trim();
  if (typeof body.description === 'string') data.description = body.description.trim();
  if (body.categorie !== undefined) {
    if (!VALID_CATEGORIES.includes(body.categorie)) throw new Error('Catégorie invalide');
    data.categorie = body.categorie;
  }
  if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel ? String(body.ctaLabel).trim() : null;
  if (body.ctaHref !== undefined) data.ctaHref = body.ctaHref ? String(body.ctaHref).trim() : null;
  if (body.imagePaths !== undefined) {
    data.imagePaths = Array.isArray(body.imagePaths)
      ? body.imagePaths.filter((p) => typeof p === 'string' && p.length > 0)
      : [];
  }
  if (body.ciblePlans !== undefined) {
    const plans = Array.isArray(body.ciblePlans) ? body.ciblePlans : [];
    if (!plans.every((p) => VALID_PLANS.includes(p))) throw new Error('Plan ciblé invalide');
    data.ciblePlans = plans;
  }
  if (body.publishedAt !== undefined && body.publishedAt) data.publishedAt = new Date(body.publishedAt);
  if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  // News : pour tous, sans expiration ni catégorie (spec 2026-10-01 §1)
  if (canal === 'NEWS') {
    data.ciblePlans = [];
    data.expiresAt = null;
    delete data.categorie;
  }
  return data;
}

async function adminList(req, res) {
  const canal = req.query.canal ?? 'NOUVEAUTE';
  if (!VALID_CANAUX.includes(canal)) {
    return res.status(400).json({ success: false, error: 'Canal invalide', code: 'VALIDATION' });
  }
  try {
    const nouveautes = await nouveauteService.listAllForAdmin(canal);
    res.json({ success: true, nouveautes });
  } catch (error) {
    logger.error('Erreur adminList nouveautés:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération', code: 'NOUVEAUTES_ADMIN_ERROR' });
  }
}

async function adminCreate(req, res) {
  try {
    const canal = req.body.canal ?? 'NOUVEAUTE';
    if (!VALID_CANAUX.includes(canal)) {
      return res.status(400).json({ success: false, error: 'Canal invalide', code: 'VALIDATION' });
    }
    const data = { ...parseBody(req.body, canal), canal };
    if (!data.titre || !data.description) {
      return res.status(400).json({ success: false, error: 'Titre et description obligatoires', code: 'VALIDATION' });
    }
    const created = await nouveauteService.createNouveaute(data);
    res.status(201).json({ success: true, nouveaute: created });
  } catch (error) {
    logger.error('Erreur adminCreate nouveauté:', error);
    res.status(400).json({ success: false, error: error.message || 'Erreur lors de la création', code: 'NOUVEAUTES_CREATE_ERROR' });
  }
}

async function adminUpdate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalide' });
    const existing = await nouveauteService.getById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Nouveauté non trouvée' });

    // Le canal d'un contenu existant ne change jamais : il n'est pas lu dans le corps
    const data = parseBody(req.body, existing.canal);
    // Supprimer de GCS les images retirées du carrousel
    if (data.imagePaths !== undefined) {
      const removed = (existing.imagePaths || []).filter((p) => !data.imagePaths.includes(p));
      for (const p of removed) {
        try { await deleteNouveauteImage(p); } catch (e) { logger.warn('Image nouveauté non supprimée:', e.message); }
      }
    }
    const updated = await nouveauteService.updateNouveaute(id, data);
    res.json({ success: true, nouveaute: updated });
  } catch (error) {
    logger.error('Erreur adminUpdate nouveauté:', error);
    res.status(400).json({ success: false, error: error.message || 'Erreur lors de la mise à jour', code: 'NOUVEAUTES_UPDATE_ERROR' });
  }
}

async function adminDelete(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalide' });
    const existing = await nouveauteService.getById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Nouveauté non trouvée' });

    for (const p of existing.imagePaths || []) {
      try { await deleteNouveauteImage(p); } catch (e) { logger.warn('Image nouveauté non supprimée:', e.message); }
    }
    await nouveauteService.deleteNouveaute(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Erreur adminDelete nouveauté:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la suppression', code: 'NOUVEAUTES_DELETE_ERROR' });
  }
}

async function adminUploadImage(req, res) {
  if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier fourni' });
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const { valid, detectedType } = validateImageBuffer(fileBuffer);
    if (!valid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: "Fichier invalide (formats: GIF, PNG, JPEG, WebP)" });
    }
    const imagePath = await uploadNouveauteImage(fileBuffer, req.file.originalname, detectedType);
    fs.unlinkSync(req.file.path);
    const imageUrl = await generateSignedUrl(imagePath);
    res.json({ success: true, imagePath, imageUrl });
  } catch (error) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    logger.error('Erreur upload image nouveauté:', error);
    res.status(500).json({ success: false, error: "Erreur lors de l'upload de l'image", code: 'NOUVEAUTES_UPLOAD_ERROR' });
  }
}

module.exports = {
  getNouveautes,
  getUnreadCount,
  markSeen,
  getNews,
  markNewsSeen,
  adminList,
  adminCreate,
  adminUpdate,
  adminDelete,
  adminUploadImage,
};
