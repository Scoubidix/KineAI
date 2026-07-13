const fs = require('fs');
const path = require('path');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');

const DEFAULT_SEED_PATH = path.join(__dirname, '..', 'data', 'bilanSeed.json');

const FIELD_TYPES = ['NUMERIC', 'BOOLEAN', 'TEXT', 'ENUM'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Lit et parse le fichier de seed. Renvoie null si absent/illisible/JSON invalide.
 */
function loadSeedFile(filePath = DEFAULT_SEED_PATH) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

/**
 * Valide la structure du seed. Renvoie un tableau d'erreurs (vide = valide).
 * Aucune écriture DB ici : la validation précède toute transaction.
 */
function validateSeed(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['Racine JSON invalide'];

  if (!Number.isInteger(data.version) || data.version < 1) {
    errors.push('version doit être un entier ≥ 1');
  }

  if (!Array.isArray(data.fields)) errors.push('fields doit être un tableau');
  if (!Array.isArray(data.templates)) errors.push('templates doit être un tableau');
  if (errors.length) return errors;

  const keys = new Set();
  for (const f of data.fields) {
    if (typeof f.key !== 'string' || !KEY_RE.test(f.key) || f.key.length > 80) {
      errors.push(`field.key invalide (snake_case, ≤80) : ${JSON.stringify(f.key)}`);
      continue;
    }
    if (keys.has(f.key)) errors.push(`field.key dupliquée : ${f.key}`);
    keys.add(f.key);
    if (typeof f.label !== 'string' || !f.label.trim() || f.label.length > 200) {
      errors.push(`field.label invalide pour ${f.key}`);
    }
    if (typeof f.category !== 'string' || !f.category.trim() || f.category.length > 80) {
      errors.push(`field.category invalide pour ${f.key}`);
    }
    if (!Number.isInteger(f.order)) errors.push(`field.order doit être un entier pour ${f.key}`);
    if (f.isActive !== undefined && typeof f.isActive !== 'boolean') {
      errors.push(`field.isActive doit être un booléen pour ${f.key}`);
    }
    if (!FIELD_TYPES.includes(f.type)) {
      errors.push(`field.type invalide pour ${f.key} : ${f.type}`);
    } else if (f.type === 'ENUM' && (!Array.isArray(f.options) || f.options.length === 0)) {
      errors.push(`field.options obligatoire (tableau non vide) pour ENUM ${f.key}`);
    }
  }

  for (const t of data.templates) {
    if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 150) {
      errors.push(`template.name invalide : ${JSON.stringify(t.name)}`);
    }
    if (typeof t.category !== 'string' || !t.category.trim() || t.category.length > 80) {
      errors.push(`template.category invalide pour ${t.name}`);
    }
    if (!Array.isArray(t.items) || t.items.length < 1 || t.items.length > 100) {
      errors.push(`template.items doit contenir 1 à 100 éléments (${t.name})`);
      continue;
    }
    for (const it of t.items) {
      if (it.kind === 'canonical') {
        if (!keys.has(it.key)) errors.push(`template "${t.name}" : key canonique inexistante : ${it.key}`);
      } else if (it.kind === 'custom') {
        if (typeof it.label !== 'string' || !it.label.trim()) {
          errors.push(`template "${t.name}" : item custom sans label`);
        }
      } else {
        errors.push(`template "${t.name}" : item.kind invalide : ${it.kind}`);
      }
    }
  }

  return errors;
}

/**
 * Applique le seed si la version du JSON dépasse celle déjà appliquée.
 * Best-effort : ne throw jamais pour un JSON absent/invalide/à jour.
 * @param {{ prisma?: object, data?: object }} [opts] injection pour les tests
 */
async function runBilanSeed({ prisma, data } = {}) {
  prisma = prisma || prismaService.getInstance();
  data = data !== undefined ? data : loadSeedFile();

  if (!data) {
    logger.warn('Seed bilan : fichier absent ou illisible, ignoré');
    return;
  }

  const errors = validateSeed(data);
  if (errors.length) {
    logger.error(`Seed bilan : JSON invalide (${errors.length} erreurs), ignoré`, errors);
    return;
  }

  const state = await prisma.bilanSeedState.findFirst();
  const applied = state ? state.version : 0;
  if (data.version <= applied) {
    logger.info(`Seed bilan : déjà à jour (v${applied})`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.bilanCanonicalField.deleteMany({});
    await tx.bilanTemplate.deleteMany({ where: { isPublic: true, kineId: null } });
    await tx.bilanCanonicalField.createMany({ data: data.fields });
    for (const t of data.templates) {
      await tx.bilanTemplate.create({
        data: {
          name: t.name,
          description: t.description ?? null,
          category: t.category,
          items: t.items,
          isPublic: true,
          kineId: null,
        },
      });
    }
    if (state) {
      await tx.bilanSeedState.update({ where: { id: state.id }, data: { version: data.version } });
    } else {
      await tx.bilanSeedState.create({ data: { version: data.version } });
    }
  });

  logger.info(
    `Seed bilan : appliqué v${applied} → v${data.version} (${data.fields.length} champs, ${data.templates.length} templates)`
  );
}

module.exports = { loadSeedFile, validateSeed, runBilanSeed, DEFAULT_SEED_PATH };
