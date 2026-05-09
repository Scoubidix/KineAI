const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

const VALID_TYPES = ['NUMERIC', 'BOOLEAN', 'TEXT', 'ENUM'];

/**
 * GET /api/bilan-fields
 * Retourne les champs canoniques actifs, regroupés par catégorie.
 * Accessible à tout kiné authentifié (utilisé dans MeasurementsPanel).
 */
exports.getActiveFields = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const fields = await prisma.bilanCanonicalField.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { id: 'asc' }],
    });
    res.json({ success: true, fields });
  } catch (err) {
    logger.error('Erreur récupération champs canoniques :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération champs', code: 'INTERNAL_ERROR' });
  }
};

/**
 * GET /api/admin/bilan-fields
 * Retourne tous les champs canoniques (actifs + désactivés) pour l'admin.
 */
exports.adminGetAllFields = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const fields = await prisma.bilanCanonicalField.findMany({
      orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { order: 'asc' }, { id: 'asc' }],
    });
    res.json({ success: true, fields });
  } catch (err) {
    logger.error('Erreur récupération champs admin :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération champs', code: 'INTERNAL_ERROR' });
  }
};

/**
 * Validation manuelle des règles métier sur un champ canonique.
 * Retourne null si OK, sinon { error, code }.
 */
function validateFieldPayload(body, { isUpdate = false } = {}) {
  const { key, label, type, unit, rangeMin, rangeMax, options, category, order, isActive } = body;

  if (!isUpdate || key !== undefined) {
    if (!key || !/^[a-z][a-z0-9_]*$/.test(key) || key.length > 80) {
      return { error: 'Key invalide (snake_case requis, 80 chars max)', code: 'INVALID_KEY' };
    }
  }
  if (!isUpdate || label !== undefined) {
    if (!label || typeof label !== 'string' || label.length > 200) {
      return { error: 'Label requis (200 chars max)', code: 'INVALID_LABEL' };
    }
  }
  if (!isUpdate || type !== undefined) {
    if (!VALID_TYPES.includes(type)) {
      return { error: `Type invalide (NUMERIC, BOOLEAN, TEXT ou ENUM)`, code: 'INVALID_TYPE' };
    }
  }
  if (!isUpdate || category !== undefined) {
    if (!category || typeof category !== 'string' || category.length > 80) {
      return { error: 'Category requis (80 chars max)', code: 'INVALID_CATEGORY' };
    }
  }

  // Règles conditionnelles selon le type
  const effectiveType = type ?? (isUpdate ? null : 'NUMERIC');
  if (effectiveType === 'ENUM') {
    if (options !== undefined && (!Array.isArray(options) || options.length === 0)) {
      return { error: 'Options requises et non vides pour un champ ENUM', code: 'INVALID_OPTIONS' };
    }
  }
  if (effectiveType === 'NUMERIC') {
    if (rangeMin !== undefined && rangeMin !== null && typeof rangeMin !== 'number') {
      return { error: 'rangeMin doit être un nombre', code: 'INVALID_RANGE_MIN' };
    }
    if (rangeMax !== undefined && rangeMax !== null && typeof rangeMax !== 'number') {
      return { error: 'rangeMax doit être un nombre', code: 'INVALID_RANGE_MAX' };
    }
  }
  if (unit !== undefined && unit !== null && typeof unit !== 'string') {
    return { error: 'Unit doit être une chaîne', code: 'INVALID_UNIT' };
  }
  if (order !== undefined && (typeof order !== 'number' || !Number.isInteger(order))) {
    return { error: 'Order doit être un entier', code: 'INVALID_ORDER' };
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return { error: 'isActive doit être un booléen', code: 'INVALID_IS_ACTIVE' };
  }

  return null;
}

/**
 * POST /api/admin/bilan-fields
 */
exports.adminCreateField = async (req, res) => {
  try {
    const validation = validateFieldPayload(req.body);
    if (validation) return res.status(400).json({ success: false, ...validation });

    const prisma = prismaService.getInstance();
    const { key, label, type, unit, rangeMin, rangeMax, options, category, order } = req.body;

    const existing = await prisma.bilanCanonicalField.findUnique({ where: { key } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Une clé identique existe déjà', code: 'KEY_EXISTS' });
    }

    const field = await prisma.bilanCanonicalField.create({
      data: {
        key,
        label,
        type,
        unit: unit ?? null,
        rangeMin: rangeMin ?? null,
        rangeMax: rangeMax ?? null,
        options: options ?? null,
        category,
        order: order ?? 0,
        isActive: true,
      },
    });

    logger.info(`Champ canonique créé : ${sanitizeId(field.id)} (${key})`);
    res.status(201).json({ success: true, field });
  } catch (err) {
    logger.error('Erreur création champ canonique :', err);
    res.status(500).json({ success: false, error: 'Erreur création champ', code: 'INTERNAL_ERROR' });
  }
};

/**
 * PUT /api/admin/bilan-fields/:id
 * On ne permet PAS la modification de la `key` (stable pour cohérence des données existantes).
 */
exports.adminUpdateField = async (req, res) => {
  try {
    const fieldId = parseInt(req.params.id);
    if (isNaN(fieldId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const validation = validateFieldPayload(req.body, { isUpdate: true });
    if (validation) return res.status(400).json({ success: false, ...validation });

    const prisma = prismaService.getInstance();
    const existing = await prisma.bilanCanonicalField.findUnique({ where: { id: fieldId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Champ non trouvé', code: 'FIELD_NOT_FOUND' });
    }

    const { label, type, unit, rangeMin, rangeMax, options, category, order, isActive } = req.body;

    const updated = await prisma.bilanCanonicalField.update({
      where: { id: fieldId },
      data: {
        ...(label !== undefined && { label }),
        ...(type !== undefined && { type }),
        ...(unit !== undefined && { unit }),
        ...(rangeMin !== undefined && { rangeMin }),
        ...(rangeMax !== undefined && { rangeMax }),
        ...(options !== undefined && { options }),
        ...(category !== undefined && { category }),
        ...(order !== undefined && { order }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    logger.info(`Champ canonique modifié : ${sanitizeId(fieldId)}`);
    res.json({ success: true, field: updated });
  } catch (err) {
    logger.error('Erreur modification champ canonique :', err);
    res.status(500).json({ success: false, error: 'Erreur modification champ', code: 'INTERNAL_ERROR' });
  }
};

/**
 * DELETE /api/admin/bilan-fields/:id
 * Soft delete via isActive=false pour préserver les données existantes
 * dans les bilans qui référencent cette clé.
 */
exports.adminDeleteField = async (req, res) => {
  try {
    const fieldId = parseInt(req.params.id);
    if (isNaN(fieldId)) {
      return res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    }

    const prisma = prismaService.getInstance();
    const existing = await prisma.bilanCanonicalField.findUnique({ where: { id: fieldId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Champ non trouvé', code: 'FIELD_NOT_FOUND' });
    }

    await prisma.bilanCanonicalField.update({
      where: { id: fieldId },
      data: { isActive: false },
    });

    logger.info(`Champ canonique désactivé : ${sanitizeId(fieldId)}`);
    res.json({ success: true, message: 'Champ désactivé' });
  } catch (err) {
    logger.error('Erreur désactivation champ canonique :', err);
    res.status(500).json({ success: false, error: 'Erreur désactivation champ', code: 'INTERNAL_ERROR' });
  }
};
