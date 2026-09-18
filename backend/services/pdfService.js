// Génération PDF partagée (contrats, bilans) via Puppeteer.
// PUPPETEER_ENABLED=false → PUPPETEER_DISABLED (staging Pico 256 Mo) ; le contrôleur répond 503.
const logger = require('../utils/logger');

const PDF_ERROR_CODES = {
  PUPPETEER_DISABLED: 'PUPPETEER_DISABLED',
  RENDER_FAILED: 'RENDER_FAILED',
};

function isPuppeteerEnabled() {
  // Défaut : true. Désactivable uniquement par valeur explicite 'false'.
  return String(process.env.PUPPETEER_ENABLED ?? 'true').toLowerCase() !== 'false';
}

// Liste blanche de sortie du navigateur serveur. Le HTML rendu peut contenir du contenu utilisateur
// (bilans hérités) : sans filtre, une balise <img>/<iframe> ferait charger n'importe quelle adresse
// — y compris le réseau interne — depuis le serveur (SSRF). Seule ressource distante légitime des
// rendus (bilans, contrats) : le logo du site. Les données embarquées (data:) restent permises.
function isAllowedRequest(url) {
  if (url.startsWith('data:') || url === 'about:blank') return true;
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  return Boolean(base) && url === `${base}/logo.png`;
}

/**
 * Rend un document HTML complet en PDF A4 (marges 2 cm, fonds imprimés).
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
async function generatePdfBuffer(html) {
  if (!isPuppeteerEnabled()) {
    const err = new Error('Génération PDF désactivée sur cet environnement (PUPPETEER_ENABLED=false)');
    err.code = PDF_ERROR_CODES.PUPPETEER_DISABLED;
    throw err;
  }

  const puppeteer = require('puppeteer');
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false); // Le HTML rendu (contrats, bilans hérités) ne doit jamais exécuter de script côté serveur
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (isAllowedRequest(req.url())) req.continue(); else req.abort(); });
    // networkidle0 attend que toutes les ressources (dont logo) soient chargées
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
    });
  } catch (err) {
    logger.error('Erreur génération PDF Puppeteer :', err);
    const e = new Error('Échec de la génération du PDF');
    e.code = PDF_ERROR_CODES.RENDER_FAILED;
    throw e;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) { /* noop */ }
    }
  }
}

module.exports = { generatePdfBuffer, isPuppeteerEnabled, PDF_ERROR_CODES };
