const { generatePdfBuffer, ERROR_CODES } = require('./contractPdfService');
const { escapeHtml } = require('../utils/escapeHtml');

/**
 * Génération du PDF de compte-rendu de séance visio.
 * Réutilise la brique Puppeteer des contrats (generatePdfBuffer).
 * Le texte du compte-rendu vient de la DB (HDS) ; le PDF est produit à la volée
 * et jamais stocké.
 */

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
  const kineName = kine
    ? escapeHtml(`${kine.firstName || ''} ${(kine.lastName || '').toUpperCase()}`.trim())
    : '';
  const rpps = kine && kine.rpps ? escapeHtml(kine.rpps) : '';
  const adresseCabinet = kine && kine.adresseCabinet ? escapeHtml(kine.adresseCabinet) : '';
  const patientName = patient ? escapeHtml(`${patient.firstName || ''} ${patient.lastName || ''}`.trim()) : '';
  const dateStr = escapeHtml(formatDateFr(scheduledAt));
  const bodyHtml = escapeHtml(compteRendu).replace(/\r?\n/g, '<br>');

  // Le logo est servi par le frontend (public/logo.png), pas le backend.
  const frontendOrigin = (process.env.FRONTEND_URL || '').split(',')[0].trim();
  const logoUrl = frontendOrigin ? `${frontendOrigin}/logo.png` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5em; }
  .header-left { font-size: 11pt; line-height: 1.4; }
  .header-name { font-weight: bold; font-size: 13pt; }
  .header-right { display: flex; align-items: center; gap: 10px; }
  .header-logo { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
  .header-app-name { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; font-weight: bold; color: #1a1a1a; }
  .header-app-name .brand { color: #3899aa; }
  .header-separator { height: 3px; background: linear-gradient(to right, #4db3c5, #1f5c6a); border: none; border-radius: 2px; margin: 0.6em 0 1.2em 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-title { font-size: 15pt; font-weight: bold; color: #1f5c6a; margin: 0 0 6px; }
  .meta { font-size: 10.5pt; color: #555; margin-bottom: 16px; }
  .meta strong { color: #1a1a1a; }
  .content { margin-top: 8px; }
  .footer { margin-top: 40px; font-size: 9pt; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="header-name">${kineName}</div>
      <div>Masseur-Kinésithérapeute D.E.</div>
      ${rpps ? `<div>RPPS : ${rpps}</div>` : ''}
      ${adresseCabinet ? `<div>${adresseCabinet}</div>` : ''}
    </div>
    <div class="header-right">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="header-logo" />` : ''}
      <div class="header-app-name"><span class="brand">M</span>on <span class="brand">A</span>ssistant <span class="brand">K</span>iné</div>
    </div>
  </div>
  <div class="header-separator"></div>

  <div class="doc-title">Compte-rendu de séance de télésoin</div>
  <div class="meta">
    ${patientName ? `<div>Patient : <strong>${patientName}</strong></div>` : ''}
    ${dateStr ? `<div>Séance du : <strong>${dateStr}</strong></div>` : ''}
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
