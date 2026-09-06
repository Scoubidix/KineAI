const { SECTION_KEYS, SECTION_TITLES } = require('../bilanDocument');
const { escapeHtml, formatDateFr, formatDateLongFr, formatValue, getMeasurements, BILAN_TYPE_LABELS } = require('./format');
const { renderExamenHtml } = require('./examen');
const { renderEvolutionHtml } = require('./evolution');
const { PRINT_CSS } = require('./printCss');

// Texte brut → paragraphes (une ligne vide = nouveau paragraphe, un saut simple = <br>)
function textToParagraphs(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// logoUrl : URL absolue du logo (fournie par le service, ex. FRONTEND_URL/logo.png) ; absente → pas d'image
function renderHeader(kineProfile, bilanDate, logoUrl) {
  if (!kineProfile) return '';
  const name = `${kineProfile.firstName || ''} ${(kineProfile.lastName || '').toUpperCase()}`.trim();
  const logo = logoUrl ? `<img class="bilan-logo" src="${escapeHtml(logoUrl)}" alt="">` : '';
  return `<header class="bilan-header">
<div class="bilan-header-left">
<div class="bilan-header-name">${escapeHtml(name)}</div>
<div>Masseur-Kinésithérapeute D.E.</div>
${kineProfile.rpps ? `<div>RPPS : ${escapeHtml(kineProfile.rpps)}</div>` : ''}
${kineProfile.adresseCabinet ? `<div>${escapeHtml(kineProfile.adresseCabinet)}</div>` : ''}
</div>
<div class="bilan-header-right">${logo}<div class="bilan-brand">Mon Assistant Kiné</div><div>Le ${escapeHtml(formatDateLongFr(bilanDate))}</div></div>
</header>`;
}

/**
 * Rend le corps HTML d'un bilan (fragment, classes bilan-*, sans style inline).
 * Bilan hérité : document nul → legacyHtml inséré tel quel (à sanitizer côté client).
 */
function renderBilanHtml({ document, legacyHtml, catalog, kineProfile, patient, bilanType, bilanDate, previousBilans = [], includeEvolution = false, logoUrl = null }) {
  const parts = [renderHeader(kineProfile, bilanDate, logoUrl)];

  if (!document) {
    const legacyBody = legacyHtml || '<p class="bilan-empty">Ce bilan n\'a pas encore de compte-rendu.</p>';
    parts.push(`<div class="bilan-legacy">${legacyBody}</div>`);
    return `<article class="bilan">${parts.join('')}</article>`;
  }

  const typeLabel = (BILAN_TYPE_LABELS[bilanType] || '').toUpperCase();
  parts.push(`<h1 class="bilan-title">BILAN KINÉSITHÉRAPIQUE${typeLabel ? ` ${escapeHtml(typeLabel)}` : ''}</h1>`);

  if (patient) {
    const name = `${patient.firstName || ''} ${(patient.lastName || '').toUpperCase()}`.trim();
    const born = patient.birthDate ? ` · né(e) le ${formatDateFr(patient.birthDate)}` : '';
    parts.push(`<div class="bilan-patient">Patient : <strong>${escapeHtml(name)}</strong>${born}</div>`);
  }

  const sectionsByKey = new Map((document.sections || []).map((s) => [s.key, s.text]));
  const measurements = getMeasurements({ document });
  const examenHtml = renderExamenHtml(measurements, catalog);

  for (const key of SECTION_KEYS) {
    const text = (sectionsByKey.get(key) || '').trim();
    if (key === 'examen') {
      // Les tableaux d'abord, puis la synthèse libre de l'examen
      if (examenHtml) parts.push(examenHtml);
      if (text) parts.push(`<section class="bilan-section">${examenHtml ? '' : `<h2 class="bilan-h2">${escapeHtml(SECTION_TITLES[key])}</h2>`}${textToParagraphs(text)}</section>`);
      continue;
    }
    if (!text) continue;
    parts.push(`<section class="bilan-section"><h2 class="bilan-h2">${escapeHtml(SECTION_TITLES[key])}</h2>${textToParagraphs(text)}</section>`);
  }

  if (includeEvolution && previousBilans.length > 0) {
    parts.push(renderEvolutionHtml({ type: bilanType, createdAt: bilanDate, measurements }, previousBilans, catalog));
  }

  parts.push(`<div class="bilan-sign">Fait le ${escapeHtml(formatDateLongFr(bilanDate))}<br><br>Signature</div>`);
  return `<article class="bilan">${parts.join('')}</article>`;
}

function wrapPrintDocument({ bodyHtml, title }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

module.exports = { renderBilanHtml, wrapPrintDocument, getMeasurements, formatValue, PRINT_CSS };
