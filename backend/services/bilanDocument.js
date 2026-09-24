// Schéma du document de bilan V1 (source de vérité stockée dans BilanKine.document).
// Modèle inspiré de FHIR Composition (sections narratives) + Observation (mesures codées).
const { z } = require('zod');

const SCHEMA_VERSION = 1;

const SECTION_KEYS = ['anamnese', 'antecedents', 'examen', 'limitations', 'diagnostic', 'objectifs', 'traitement'];

const SECTION_TITLES = {
  anamnese: 'Identification & anamnèse',
  antecedents: 'Antécédents',
  examen: 'Examen clinique',
  limitations: 'Limitations fonctionnelles',
  diagnostic: 'Diagnostic kinésithérapique',
  objectifs: 'Objectifs',
  traitement: 'Traitement',
};

const SIDES = ['D', 'G'];
const PRESENTATIONS = ['table', 'narrative'];
const ORIGINS = ['manual', 'extracted', 'previous'];

const SECTION_TEXT_MAX = 5000;
const MEASUREMENTS_MAX = 200;
const TEXT_VALUE_MAX = 500;

function emptyDocument() {
  return {
    schemaVersion: SCHEMA_VERSION,
    sections: SECTION_KEYS.map((key) => ({ key, text: '' })),
    measurements: [],
  };
}

// Clé de dédoublonnage des mesures libres (insensible à la casse et aux espaces)
function normalizeLabel(label) {
  return String(label ?? '').trim().toLowerCase();
}

// Empreinte des mesures « en prose » renseignées : ce que le texte de l'examen est censé reprendre
// (spec 2026-09-23 §6). Posée quand l'examen est rédigé ; une différence avec l'empreinte courante
// signale au kiné une mesure en prose que le texte ne reprend pas. Même identifiant que la détection
// de doublons. Le front calcule la même empreinte (`frontend/src/types/bilan.ts`) : garder les deux
// identiques.
function proseSignatures(measurements) {
  return (measurements || [])
    .filter((m) => m.presentation === 'narrative' && m.value !== null && m.value !== undefined && !(typeof m.value === 'string' && m.value.trim() === ''))
    .map((m) => `${m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${normalizeLabel(m.label)}`}=${JSON.stringify(m.value)}`)
    .sort();
}

// Vérifie une valeur canonique selon le type du champ. Retourne un message d'erreur ou null.
function checkCanonicalValue(field, value) {
  if (value === null) return null; // ajoutée mais non saisie
  switch (field.type) {
    case 'NUMERIC': {
      if (typeof value !== 'number' || Number.isNaN(value)) return `valeur numérique attendue pour ${field.key}`;
      if (field.rangeMin != null && value < field.rangeMin) return `valeur < rangeMin pour ${field.key}`;
      if (field.rangeMax != null && value > field.rangeMax) return `valeur > rangeMax pour ${field.key}`;
      return null;
    }
    case 'BOOLEAN':
      return typeof value === 'boolean' ? null : `booléen attendu pour ${field.key}`;
    case 'ENUM': {
      const options = Array.isArray(field.options) ? field.options : [];
      return typeof value === 'string' && options.includes(value) ? null : `option invalide pour ${field.key}`;
    }
    case 'TEXT':
      return typeof value === 'string' && value.length <= TEXT_VALUE_MAX ? null : `texte <= ${TEXT_VALUE_MAX} attendu pour ${field.key}`;
    default:
      return `type de champ inconnu pour ${field.key}`;
  }
}

function buildDocumentSchema(fieldsByKey) {
  const sectionSchema = z.object({
    key: z.enum(SECTION_KEYS),
    text: z.string().max(SECTION_TEXT_MAX),
  });

  // canonicalSchema must be a plain z.object (no .superRefine) for discriminatedUnion to work
  const canonicalSchema = z.object({
    kind: z.literal('canonical'),
    key: z.string().trim().min(1).max(80),
    value: z.union([z.number(), z.boolean(), z.string().max(TEXT_VALUE_MAX), z.null()]),
    side: z.enum(SIDES).optional(),
    presentation: z.enum(PRESENTATIONS),
    origin: z.enum(ORIGINS),
  });

  const customSchema = z.object({
    kind: z.literal('custom'),
    label: z.string().trim().min(1).max(200),
    value: z.string().max(TEXT_VALUE_MAX),
    presentation: z.enum(PRESENTATIONS),
    origin: z.enum(ORIGINS),
  });

  return z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    sections: z
      .array(sectionSchema)
      .length(SECTION_KEYS.length)
      .superRefine((sections, ctx) => {
        const keys = sections.map((s) => s.key);
        if (new Set(keys).size !== SECTION_KEYS.length || SECTION_KEYS.some((k) => !keys.includes(k))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sections : chaque clé doit apparaître exactement une fois' });
        }
      }),
    measurements: z
      .array(z.discriminatedUnion('kind', [canonicalSchema, customSchema]))
      .max(MEASUREMENTS_MAX)
      .superRefine((items, ctx) => {
        const seen = new Set();
        for (let index = 0; index < items.length; index++) {
          const m = items[index];

          // Canonical-specific validation
          if (m.kind === 'canonical') {
            const field = fieldsByKey.get(m.key);
            if (!field) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `clé canonique inconnue : ${m.key}`,
                path: [index, 'key'],
              });
              continue;
            }
            if (m.side && !field.lateralized) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `côté interdit sur un champ non latéralisé : ${m.key}`,
                path: [index, 'side'],
              });
            }
            const err = checkCanonicalValue(field, m.value);
            if (err) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: err,
                path: [index, 'value'],
              });
            }
          }

          // Duplicate detection (works for both canonical and custom)
          const id = m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${normalizeLabel(m.label)}`;
          if (seen.has(id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `mesure en double : ${id}`,
              path: [index],
            });
          }
          seen.add(id);
        }
      }),
    comparison: z
      .object({ previousBilanIds: z.array(z.number().int().positive()).max(10) })
      .optional(),
    // Empreinte des mesures en prose à la dernière écriture de l'examen (cf. proseSignatures).
    // Déclarée ici sans quoi Zod la retirerait à chaque autosave.
    // Borne large : JSON.stringify peut porter un caractère de la valeur à 6 (\uXXXX), et une entrée
    // refusée bloquerait tous les autosaves du bilan.
    proseBasis: z.array(z.string().max(6 * TEXT_VALUE_MAX + 300)).max(MEASUREMENTS_MAX).optional(),
  });
}

function validateDocument(document, fields) {
  const fieldsByKey = new Map((fields || []).map((f) => [f.key, f]));
  const result = buildDocumentSchema(fieldsByKey).safeParse(document);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`),
  };
}

// Vrai si rien n'a été saisi : aucune section avec du texte, aucune mesure avec une valeur.
// Sert au refus de finalisation (un bilan enregistré doit avoir un contenu).
function isDocumentEmpty(document) {
  if (!document) return true;
  const hasSection = (document.sections || []).some((s) => typeof s.text === 'string' && s.text.trim() !== '');
  if (hasSection) return false;
  return !(document.measurements || []).some((m) => {
    if (m.value === null || m.value === undefined) return false;
    if (typeof m.value === 'string') return m.value.trim() !== '';
    return true;
  });
}

module.exports = {
  SCHEMA_VERSION,
  SECTION_KEYS,
  SECTION_TITLES,
  SIDES,
  PRESENTATIONS,
  ORIGINS,
  emptyDocument,
  normalizeLabel,
  proseSignatures,
  buildDocumentSchema,
  validateDocument,
  isDocumentEmpty,
};
