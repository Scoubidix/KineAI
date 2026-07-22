const { generatePdfBuffer, ERROR_CODES } = require('./contractPdfService');

/**
 * Génération du PDF de compte-rendu de séance visio.
 * Réutilise la brique Puppeteer des contrats (generatePdfBuffer).
 * Le texte du compte-rendu vient de la DB (HDS) ; le PDF est produit à la volée
 * et jamais stocké.
 */

// Échappe le HTML d'une saisie utilisateur avant injection dans le template.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateFr(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
}

/**
 * Construit le HTML du compte-rendu.
 * @param {{ compteRendu: string, scheduledAt: Date|string, kine: object, patient: object }} p
 */
function renderCompteRenduHtml({ compteRendu, scheduledAt, kine, patient }) {
  const kineName = kine ? escapeHtml(`${kine.firstName || ''} ${kine.lastName || ''}`.trim()) : '';
  const patientName = patient ? escapeHtml(`${patient.firstName || ''} ${patient.lastName || ''}`.trim()) : '';
  const dateStr = escapeHtml(formatDateFr(scheduledAt));
  const bodyHtml = escapeHtml(compteRendu).replace(/\r?\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.6; }
  .header { border-bottom: 2px solid #3899aa; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { color: #3899aa; font-size: 20px; margin: 0 0 8px; }
  .meta { font-size: 12px; color: #555; }
  .meta strong { color: #1a1a1a; }
  .content { white-space: normal; margin-top: 16px; }
  .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <h1>Compte-rendu de séance de télésoin</h1>
    <div class="meta">
      ${kineName ? `<div>Praticien : <strong>${kineName}</strong></div>` : ''}
      ${patientName ? `<div>Patient : <strong>${patientName}</strong></div>` : ''}
      ${dateStr ? `<div>Séance du : <strong>${dateStr}</strong></div>` : ''}
    </div>
  </div>
  <div class="content">${bodyHtml || '<em>(compte-rendu vide)</em>'}</div>
  <div class="footer">Document généré par Mon Assistant Kiné — usage professionnel.</div>
</body>
</html>`;
}

/**
 * Génère le buffer PDF du compte-rendu (HTML → Puppeteer).
 * @throws err.code === ERROR_CODES.PUPPETEER_DISABLED si Puppeteer est off.
 */
async function generateCompteRenduPdf({ compteRendu, scheduledAt, kine, patient }) {
  const html = renderCompteRenduHtml({ compteRendu, scheduledAt, kine, patient });
  return generatePdfBuffer(html);
}

module.exports = { ERROR_CODES, renderCompteRenduHtml, generateCompteRenduPdf };
