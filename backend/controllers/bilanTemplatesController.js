const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

const MAX_NAME = 150;
const MAX_DESCRIPTION = 500;
const MAX_CATEGORY = 80;
const MAX_ITEMS = 100;
const MAX_LABEL = 200;
const KEY_REGEX = /^[a-z][a-z0-9_]*$/;

// Helper : récupère le kineId depuis req.uid (404 si introuvable)
const resolveKineId = async (req, res) => {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid: req.uid }, select: { id: true } });
  if (!kine) {
    res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    return null;
  }
  return kine.id;
};

// Validation et normalisation de la liste d'items.
// Retourne { items } si OK, sinon { error, code }.
function validateItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return { error: 'items doit être un tableau', code: 'INVALID_ITEMS' };
  }
  if (rawItems.length === 0) {
    return { error: 'items doit contenir au moins un élément', code: 'EMPTY_ITEMS' };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { error: `Maximum ${MAX_ITEMS} items par template`, code: 'TOO_MANY_ITEMS' };
  }

  const seenKeys = new Set();
  const seenLabels = new Set();
  const items = [];

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    if (!it || typeof it !== 'object') {
      return { error: `Item #${i + 1} invalide`, code: 'INVALID_ITEM' };
    }
    if (it.kind === 'canonical') {
      if (typeof it.key !== 'string' || !KEY_REGEX.test(it.key) || it.key.length > 80) {
        return { error: `Item #${i + 1} : key invalide (snake_case)`, code: 'INVALID_ITEM_KEY' };
      }
      if (seenKeys.has(it.key)) continue; // dédup silencieuse
      seenKeys.add(it.key);
      items.push({ kind: 'canonical', key: it.key });
    } else if (it.kind === 'custom') {
      const label = typeof it.label === 'string' ? it.label.trim() : '';
      if (!label || label.length > MAX_LABEL) {
        return { error: `Item #${i + 1} : label requis (${MAX_LABEL} chars max)`, code: 'INVALID_ITEM_LABEL' };
      }
      const key = label.toLowerCase();
      if (seenLabels.has(key)) continue;
      seenLabels.add(key);
      items.push({ kind: 'custom', label });
    } else {
      return { error: `Item #${i + 1} : kind doit être 'canonical' ou 'custom'`, code: 'INVALID_ITEM_KIND' };
    }
  }

  if (items.length === 0) {
    return { error: 'items vide après dédup', code: 'EMPTY_ITEMS' };
  }
  return { items };
}

// Validation des métadonnées (name/description/category)
function validateMeta(body, { isUpdate = false } = {}) {
  const { name, description, category } = body;
  if (!isUpdate || name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) {
      return { error: `name requis (${MAX_NAME} chars max)`, code: 'INVALID_NAME' };
    }
  }
  if (!isUpdate || category !== undefined) {
    if (typeof category !== 'string' || !category.trim() || category.length > MAX_CATEGORY) {
      return { error: `category requis (${MAX_CATEGORY} chars max)`, code: 'INVALID_CATEGORY' };
    }
  }
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) {
      return { error: `description max ${MAX_DESCRIPTION} chars`, code: 'INVALID_DESCRIPTION' };
    }
  }
  return null;
}

// Champs renvoyés au client
const SELECT_FIELDS = {
  id: true,
  name: true,
  description: true,
  category: true,
  items: true,
  isPublic: true,
  kineId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// ==================== KINÉ ====================

/**
 * GET /api/bilan-templates
 * Retourne les templates accessibles : publics actifs + privés du kiné connecté.
 */
exports.listAccessible = async (req, res) => {
  try {
    const kineId = await resolveKineId(req, res);
    if (kineId === null) return;

    const prisma = prismaService.getInstance();
    const templates = await prisma.bilanTemplate.findMany({
      where: {
        isActive: true,
        OR: [
          { isPublic: true },
          { kineId },
        ],
      },
      select: SELECT_FIELDS,
      orderBy: [{ isPublic: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, templates });
  } catch (err) {
    logger.error('Erreur récupération templates bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération templates', code: 'INTERNAL_ERROR' });
  }
};

/**
 * POST /api/bilan-templates
 * Création d'un template privé pour le kiné connecté.
 */
exports.create = async (req, res) => {
  try {
    const kineId = await resolveKineId(req, res);
    if (kineId === null) return;

    const metaErr = validateMeta(req.body);
    if (metaErr) return res.status(400).json({ success: false, ...metaErr });

    const itemsResult = validateItems(req.body.items);
    if (itemsResult.error) return res.status(400).json({ success: false, ...itemsResult });

    const { name, description, category } = req.body;

    const prisma = prismaService.getInstance();
    const template = await prisma.bilanTemplate.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        category: category.trim(),
        items: itemsResult.items,
        isPublic: false,
        kineId,
      },
      select: SELECT_FIELDS,
    });

    logger.info(`Template bilan créé (privé) : ${sanitizeId(template.id)} par kiné ${sanitizeId(kineId)}`);
    res.status(201).json({ success: true, template });
  } catch (err) {
    logger.error('Erreur création template bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur création template', code: 'INTERNAL_ERROR' });
  }
};

/**
 * PUT /api/bilan-templates/:id
 * Update du template. Le kiné ne peut modifier que ses propres templates privés.
 */
exports.update = async (req, res) => {
  try {
    const kineId = await resolveKineId(req, res);
    if (kineId === null) return;

    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const prisma = prismaService.getInstance();
    const existing = await prisma.bilanTemplate.findFirst({
      where: { id: templateId, kineId, isPublic: false, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template non trouvé', code: 'TEMPLATE_NOT_FOUND' });
    }

    const metaErr = validateMeta(req.body, { isUpdate: true });
    if (metaErr) return res.status(400).json({ success: false, ...metaErr });

    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name.trim();
    if (req.body.description !== undefined) {
      data.description = req.body.description ? req.body.description.trim() : null;
    }
    if (req.body.category !== undefined) data.category = req.body.category.trim();
    if (req.body.items !== undefined) {
      const itemsResult = validateItems(req.body.items);
      if (itemsResult.error) return res.status(400).json({ success: false, ...itemsResult });
      data.items = itemsResult.items;
    }

    const updated = await prisma.bilanTemplate.update({
      where: { id: templateId },
      data,
      select: SELECT_FIELDS,
    });

    logger.info(`Template bilan modifié : ${sanitizeId(templateId)} par kiné ${sanitizeId(kineId)}`);
    res.json({ success: true, template: updated });
  } catch (err) {
    logger.error('Erreur modification template bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur modification template', code: 'INTERNAL_ERROR' });
  }
};

/**
 * DELETE /api/bilan-templates/:id
 * Soft delete d'un template privé du kiné connecté.
 */
exports.softDelete = async (req, res) => {
  try {
    const kineId = await resolveKineId(req, res);
    if (kineId === null) return;

    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const prisma = prismaService.getInstance();
    const existing = await prisma.bilanTemplate.findFirst({
      where: { id: templateId, kineId, isPublic: false, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template non trouvé', code: 'TEMPLATE_NOT_FOUND' });
    }

    await prisma.bilanTemplate.update({
      where: { id: templateId },
      data: { isActive: false, deletedAt: new Date() },
    });

    logger.info(`Template bilan supprimé : ${sanitizeId(templateId)} par kiné ${sanitizeId(kineId)}`);
    res.json({ success: true, message: 'Template supprimé' });
  } catch (err) {
    logger.error('Erreur suppression template bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur suppression template', code: 'INTERNAL_ERROR' });
  }
};

// ==================== ADMIN ====================

/**
 * GET /api/admin/bilan-templates
 * Retourne tous les templates publics (actifs + désactivés) pour gestion.
 */
exports.adminList = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const templates = await prisma.bilanTemplate.findMany({
      where: { isPublic: true },
      select: SELECT_FIELDS,
      orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, templates });
  } catch (err) {
    logger.error('Erreur récupération templates admin :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération templates', code: 'INTERNAL_ERROR' });
  }
};

/**
 * POST /api/admin/bilan-templates
 * Création d'un template public (kineId null, isPublic true forcé).
 */
exports.adminCreate = async (req, res) => {
  try {
    const metaErr = validateMeta(req.body);
    if (metaErr) return res.status(400).json({ success: false, ...metaErr });

    const itemsResult = validateItems(req.body.items);
    if (itemsResult.error) return res.status(400).json({ success: false, ...itemsResult });

    const { name, description, category } = req.body;

    const prisma = prismaService.getInstance();
    const template = await prisma.bilanTemplate.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        category: category.trim(),
        items: itemsResult.items,
        isPublic: true,
        kineId: null,
      },
      select: SELECT_FIELDS,
    });

    logger.info(`Template bilan créé (public) : ${sanitizeId(template.id)}`);
    res.status(201).json({ success: true, template });
  } catch (err) {
    logger.error('Erreur création template admin :', err);
    res.status(500).json({ success: false, error: 'Erreur création template', code: 'INTERNAL_ERROR' });
  }
};

/**
 * PUT /api/admin/bilan-templates/:id
 * Update d'un template public (admin uniquement).
 */
exports.adminUpdate = async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const prisma = prismaService.getInstance();
    const existing = await prisma.bilanTemplate.findFirst({
      where: { id: templateId, isPublic: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template non trouvé', code: 'TEMPLATE_NOT_FOUND' });
    }

    const metaErr = validateMeta(req.body, { isUpdate: true });
    if (metaErr) return res.status(400).json({ success: false, ...metaErr });

    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name.trim();
    if (req.body.description !== undefined) {
      data.description = req.body.description ? req.body.description.trim() : null;
    }
    if (req.body.category !== undefined) data.category = req.body.category.trim();
    if (req.body.items !== undefined) {
      const itemsResult = validateItems(req.body.items);
      if (itemsResult.error) return res.status(400).json({ success: false, ...itemsResult });
      data.items = itemsResult.items;
    }
    if (req.body.isActive !== undefined && typeof req.body.isActive === 'boolean') {
      data.isActive = req.body.isActive;
      if (req.body.isActive === true) data.deletedAt = null;
    }

    const updated = await prisma.bilanTemplate.update({
      where: { id: templateId },
      data,
      select: SELECT_FIELDS,
    });

    logger.info(`Template bilan modifié (public) : ${sanitizeId(templateId)}`);
    res.json({ success: true, template: updated });
  } catch (err) {
    logger.error('Erreur modification template admin :', err);
    res.status(500).json({ success: false, error: 'Erreur modification template', code: 'INTERNAL_ERROR' });
  }
};

/**
 * DELETE /api/admin/bilan-templates/:id
 * Soft delete d'un template public.
 */
exports.adminDelete = async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const prisma = prismaService.getInstance();
    const existing = await prisma.bilanTemplate.findFirst({
      where: { id: templateId, isPublic: true, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template non trouvé', code: 'TEMPLATE_NOT_FOUND' });
    }

    await prisma.bilanTemplate.update({
      where: { id: templateId },
      data: { isActive: false, deletedAt: new Date() },
    });

    logger.info(`Template bilan désactivé (public) : ${sanitizeId(templateId)}`);
    res.json({ success: true, message: 'Template désactivé' });
  } catch (err) {
    logger.error('Erreur désactivation template admin :', err);
    res.status(500).json({ success: false, error: 'Erreur désactivation template', code: 'INTERNAL_ERROR' });
  }
};
