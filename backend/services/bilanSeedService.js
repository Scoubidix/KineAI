const fs = require('fs');
const path = require('path');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');

const DEFAULT_SEED_PATH = path.join(__dirname, '..', 'data', 'bilanSeed.json');

const FIELD_TYPES = ['NUMERIC', 'BOOLEAN', 'TEXT', 'ENUM'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;
const PRESENTATIONS = ['TABLE', 'NARRATIVE'];
const ALIAS_MAX_LEN = 60;
const ALIASES_MAX = 10;
const DESCRIPTION_MAX_LEN = 300;

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
    if (f.aliases !== undefined) {
      const ok = Array.isArray(f.aliases)
        && f.aliases.length <= ALIASES_MAX
        && f.aliases.every((a) => typeof a === 'string' && a.trim() && a.length <= ALIAS_MAX_LEN);
      if (!ok) errors.push(`field.aliases invalide (tableau de ≤ ${ALIASES_MAX} chaînes ≤ ${ALIAS_MAX_LEN}) pour ${f.key}`);
    }
    if (f.lateralized !== undefined && typeof f.lateralized !== 'boolean') {
      errors.push(`field.lateralized doit être un booléen pour ${f.key}`);
    }
    if (f.presentation !== undefined && !PRESENTATIONS.includes(f.presentation)) {
      errors.push(`field.presentation invalide (TABLE|NARRATIVE) pour ${f.key}`);
    }
    if (f.description !== undefined && f.description !== null && (typeof f.description !== 'string' || f.description.length > DESCRIPTION_MAX_LEN)) {
      errors.push(`field.description invalide (chaîne ≤ ${DESCRIPTION_MAX_LEN}) pour ${f.key}`);
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
 * Amorce le catalogue (champs + templates publics) quand il est VIDE : base neuve, base locale
 * remise à zéro. Le catalogue se gère ensuite dans l'admin, seule source de vérité : ce fichier
 * n'écrase jamais rien (il effaçait et recréait tout à chaque montée de version, admin compris).
 * Best-effort : ne throw jamais pour un JSON absent/invalide ou un catalogue déjà présent.
 * @param {{ prisma?: object, data?: object }} [opts] injection pour les tests
 */
async function runBilanSeed({ prisma, data } = {}) {
  prisma = prisma || prismaService.getInstance();

  const existing = await prisma.bilanCanonicalField.count();
  if (existing > 0) {
    logger.info(`Seed bilan : catalogue déjà présent (${existing} champs, géré dans l'admin), ignoré`);
    return;
  }

  data = data !== undefined ? data : loadSeedFile();
  if (!data) {
    logger.warn('Seed bilan : catalogue vide et fichier absent ou illisible, rien à amorcer');
    return;
  }
  const errors = validateSeed(data);
  if (errors.length) {
    logger.error(`Seed bilan : JSON invalide (${errors.length} erreurs), ignoré`, errors);
    return;
  }

  // Templates publics déjà là (champs effacés à la main) : on ne les double pas
  const withTemplates = (await prisma.bilanTemplate.count({ where: { isPublic: true, kineId: null } })) === 0;
  await prisma.$transaction(async (tx) => {
    await tx.bilanCanonicalField.createMany({
      data: data.fields.map((f) => ({ ...f, description: f.description ?? null })),
    });
    if (!withTemplates) return;
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
  });

  logger.info(`Seed bilan : catalogue amorcé (${data.fields.length} champs${withTemplates ? `, ${data.templates.length} templates` : ''})`);
  // require paresseux : évite un import circulaire au chargement du module
  require('./bilanRenderService').invalidateCatalogCache();
}

// Attributs optionnels d'un champ : omis de l'export quand ils sont vides, comme dans le fichier
const OPTIONAL_FIELD_ATTRS = ['unit', 'rangeMin', 'rangeMax', 'options'];

/**
 * Photo du catalogue géré dans l'admin, au format de bilanSeed.json : elle remplace le fichier du
 * repo (amorçage d'une base vide, harnais eval:* qui tournent sans base). Champs désactivés
 * compris (isActive: false), templates publics actifs seulement.
 * @param {{ prisma?: object }} [opts] injection pour les tests
 */
async function exportCatalog({ prisma } = {}) {
  prisma = prisma || prismaService.getInstance();
  const [rows, templates] = await Promise.all([
    prisma.bilanCanonicalField.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }, { id: 'asc' }] }),
    prisma.bilanTemplate.findMany({
      where: { isPublic: true, kineId: null, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { name: true, description: true, category: true, items: true },
    }),
  ]);
  const fields = rows.map((f) => {
    const out = { key: f.key, label: f.label, type: f.type, category: f.category, order: f.order };
    for (const a of OPTIONAL_FIELD_ATTRS) if (f[a] !== null && f[a] !== undefined) out[a] = f[a];
    Object.assign(out, { aliases: f.aliases, lateralized: f.lateralized, presentation: f.presentation });
    if (f.description) out.description = f.description;
    if (f.isActive === false) out.isActive = false;
    return out;
  });
  return {
    fields,
    templates: templates.map((t) => ({ name: t.name, ...(t.description ? { description: t.description } : {}), category: t.category, items: t.items })),
  };
}

module.exports = { loadSeedFile, validateSeed, runBilanSeed, exportCatalog, DEFAULT_SEED_PATH };
