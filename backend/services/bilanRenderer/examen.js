const { escapeHtml, formatValue, isFilled } = require('./format');

const CUSTOM_CATEGORY = 'Mesures libres';
const UNKNOWN_CATEGORY = 'Autres';

/**
 * Tableaux de l'examen clinique, une table par catégorie (ordre d'apparition des mesures).
 * Colonnes D/G dès qu'une mesure latéralisée est présente dans la catégorie.
 * Ignore les mesures narratives et les valeurs non saisies. Retourne '' si rien à afficher.
 */
function renderExamenHtml(measurements, catalog) {
  const fieldsByKey = new Map(catalog.map((f) => [f.key, f]));
  const groups = new Map(); // category → { lateral: boolean, rows: Map<rowKey, { label, byside: {D,G}, single }> }

  for (const m of measurements) {
    if (m.presentation === 'narrative') continue;
    if (!isFilled(m.value)) continue;

    if (m.kind === 'custom') {
      const g = groups.get(CUSTOM_CATEGORY) || { lateral: false, rows: new Map() };
      g.rows.set(`x:${m.label}`, { label: m.label, single: m.value });
      groups.set(CUSTOM_CATEGORY, g);
      continue;
    }

    const field = fieldsByKey.get(m.key);
    if (!field) continue;
    const category = field.category || UNKNOWN_CATEGORY;
    const g = groups.get(category) || { lateral: false, rows: new Map() };
    const row = g.rows.get(m.key) || { label: field.label, byside: {}, single: null };
    if (field.lateralized && m.side) {
      row.byside[m.side] = formatValue(field, m.value);
      g.lateral = true;
    } else {
      row.single = formatValue(field, m.value);
    }
    g.rows.set(m.key, row);
    groups.set(category, g);
  }

  // Mesures libres toujours en dernier
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === CUSTOM_CATEGORY) - (b[0] === CUSTOM_CATEGORY));
  if (ordered.length === 0) return '';

  const sections = ordered.map(([category, g]) => {
    const header = g.lateral
      ? '<thead><tr><th>Mesure</th><th class="bilan-side">D</th><th class="bilan-side">G</th></tr></thead>'
      : '<thead><tr><th>Mesure</th><th class="bilan-side">Valeur</th></tr></thead>';
    const rows = [...g.rows.values()].map((r) => {
      const label = `<td>${escapeHtml(r.label)}</td>`;
      if (g.lateral) {
        // Une mesure non latéralisée dans une catégorie latérale s'affiche sur la colonne D (valeur unique)
        const d = r.byside && r.byside.D ? r.byside.D : r.single;
        const gauche = r.byside && r.byside.G ? r.byside.G : null;
        return `<tr>${label}<td class="bilan-val">${d ? escapeHtml(d) : '—'}</td><td class="bilan-val">${gauche ? escapeHtml(gauche) : '—'}</td></tr>`;
      }
      return `<tr>${label}<td class="bilan-val">${escapeHtml(r.single ?? '—')}</td></tr>`;
    }).join('');
    return `<h3 class="bilan-cat">${escapeHtml(category)}</h3><table class="bilan-table">${header}<tbody>${rows}</tbody></table>`;
  });

  return `<section class="bilan-examen"><h2 class="bilan-h2">Examen clinique</h2>${sections.join('')}</section>`;
}

module.exports = { renderExamenHtml, CUSTOM_CATEGORY };
