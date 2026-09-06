const { escapeHtml } = require('../../utils/escapeHtml');

const BILAN_TYPE_LABELS = { INITIAL: 'Initial', INTERMEDIAIRE: 'Intermédiaire', FINAL: 'Final' };

function formatDateFr(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatDateLongFr(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Valeur affichable d'une mesure canonique (jamais null ici : filtré en amont)
function formatValue(field, value) {
  if (field.type === 'BOOLEAN') return value === true ? 'positif' : 'négatif';
  if (field.type === 'NUMERIC') return `${value}${field.unit ? ` ${field.unit}` : ''}`;
  return String(value);
}

// Une valeur est "saisie" si non null/undefined et non chaîne vide (0 et false sont saisis)
function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

// Mesures d'un bilan : document V1 en priorité, sinon structuredData hérité normalisé
function getMeasurements(bilanLike) {
  const doc = bilanLike && bilanLike.document;
  if (doc && Array.isArray(doc.measurements)) return doc.measurements;
  const legacy = bilanLike && bilanLike.structuredData;
  if (legacy && Array.isArray(legacy.measurements)) {
    return legacy.measurements.map((m) => ({ ...m, presentation: 'table', origin: 'manual' }));
  }
  return [];
}

module.exports = { escapeHtml, formatDateFr, formatDateLongFr, formatValue, isFilled, getMeasurements, BILAN_TYPE_LABELS };
