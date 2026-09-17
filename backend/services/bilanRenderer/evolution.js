const { escapeHtml, formatValue, isFilled, formatDateFr, getMeasurements, BILAN_TYPE_LABELS, measurementId } = require('./format');
const { CUSTOM_CATEGORY } = require('./examen');

const UNKNOWN_CATEGORY = 'Autres';

function valueOf(measurements, id) {
  const m = measurements.find((x) => measurementId(x) === id);
  return m && isFilled(m.value) ? m.value : null;
}

/**
 * Tableau d'évolution : une colonne par bilan (chronologique, bilan courant en dernier) + colonne Évolution.
 * @param {{ type, createdAt, measurements }} current
 * @param {Array<{ type, createdAt, document?, structuredData? }>} previousBilans
 */
function renderEvolutionHtml(current, previousBilans, catalog) {
  if (!previousBilans || previousBilans.length === 0) return '';
  const fieldsByKey = new Map(catalog.map((f) => [f.key, f]));

  const all = [...previousBilans]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((b) => ({ type: b.type, createdAt: b.createdAt, measurements: getMeasurements(b) }))
    .concat([{ type: current.type, createdAt: current.createdAt, measurements: current.measurements }]);

  // Lignes présentes (avec valeur) dans au moins un bilan, ordre : bilan courant d'abord
  const ids = [];
  const meta = new Map();
  for (const b of [...all].reverse()) {
    for (const m of b.measurements) {
      if (m.presentation === 'narrative' || !isFilled(m.value)) continue;
      const id = measurementId(m);
      if (meta.has(id)) continue;
      if (m.kind === 'canonical') {
        const field = fieldsByKey.get(m.key);
        if (!field) continue;
        meta.set(id, { field, label: field.label + (m.side ? ` (${m.side})` : ''), category: field.category || UNKNOWN_CATEGORY });
      } else {
        meta.set(id, { field: null, label: m.label.trim(), category: CUSTOM_CATEGORY });
      }
      ids.push(id);
    }
  }
  if (ids.length === 0) return '';

  const groups = new Map();
  for (const id of ids) {
    const cat = meta.get(id).category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(id);
  }
  if (groups.has(CUSTOM_CATEGORY)) { const c = groups.get(CUSTOM_CATEGORY); groups.delete(CUSTOM_CATEGORY); groups.set(CUSTOM_CATEGORY, c); }

  const head = ['<th>Mesure</th>']
    .concat(all.map((b) => `<th>${escapeHtml(BILAN_TYPE_LABELS[b.type] || b.type)} (${formatDateFr(b.createdAt)})</th>`))
    .concat(['<th>Évolution</th>']).join('');

  const sections = [];
  for (const [category, rowIds] of groups.entries()) {
    const rows = rowIds.map((id) => {
      const { field, label } = meta.get(id);
      const cells = [];
      const numeric = [];
      const present = [];
      for (const b of all) {
        const v = valueOf(b.measurements, id);
        if (v === null) { cells.push('—'); continue; }
        const shown = field ? formatValue(field, v) : String(v);
        cells.push(shown);
        present.push(String(shown).trim().toLowerCase());
        if (field && field.type === 'NUMERIC' && typeof v === 'number') numeric.push(v);
      }
      let delta = '—';
      if (field && field.type === 'NUMERIC' && numeric.length >= 2) {
        const diff = numeric[numeric.length - 1] - numeric[0];
        delta = diff === 0 ? '=' : `${diff > 0 ? '+' : ''}${diff}${field.unit ? ` ${field.unit}` : ''}`;
      } else if (present.length >= 2) {
        delta = present.every((p) => p === present[0]) ? '=' : '→';
      }
      return `<tr><td>${escapeHtml(label)}</td>${cells.concat([delta]).map((c) => `<td class="bilan-val">${escapeHtml(c)}</td>`).join('')}</tr>`;
    }).join('');
    sections.push(`<h3 class="bilan-cat">${escapeHtml(category)}</h3><table class="bilan-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`);
  }

  return `<section class="bilan-evolution"><h2 class="bilan-h2">Évolution des mesures</h2>${sections.join('')}</section>`;
}

module.exports = { renderEvolutionHtml };
