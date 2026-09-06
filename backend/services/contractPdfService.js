const crypto = require('crypto');
const { renderRemplacementLiberalHtml } = require('../templates/contrats/remplacement-liberal');
const { generatePdfBuffer, isPuppeteerEnabled, PDF_ERROR_CODES } = require('./pdfService');

/**
 * Service de génération PDF pour les contrats remplacement/assistanat.
 *
 * Toggle env :
 *   PUPPETEER_ENABLED=true  (défaut)  → génération réelle via Chromium headless
 *   PUPPETEER_ENABLED=false           → endpoint renvoie 503 (cas staging Pico 256MB)
 *
 * Puppeteer (isPuppeteerEnabled / generatePdfBuffer) est mutualisé dans pdfService.js
 * (réutilisé par les bilans). En tests, Puppeteer est mocké via jest.mock.
 */

const ERROR_CODES = {
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  ...PDF_ERROR_CODES,
};

// Formate les dates en français : ISO (2026-06-01) ou Date → "01/06/2026"
function formatDateFr(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return null;
  }
}

// Extrait les infos d'un kiné inscrit pour les coller dans le PDF (côté remplacé OU remplaçant)
function extractKineFields(kine) {
  if (!kine) return {};
  return {
    civilite: kine.civilite || null,
    firstName: kine.firstName || null,
    lastName: kine.lastName || null,
    birthDate: formatDateFr(kine.birthDate),
    birthPlace: kine.birthPlace || null,
    departementOrdre: kine.departementOrdre || null,
    numeroOrdinal: kine.numeroOrdinal || null,
    adresseCabinet: kine.adresseCabinet || null,
    adresseDomicile: kine.adresseDomicile || null,
    email: kine.email || null,
  };
}

/**
 * Assemble les données passées au template à partir du contrat + des kinés.
 *
 * @param {object} contract            Contract Prisma (avec data JSON)
 * @param {object} kineInitiateur      Kine Prisma (initiateur, toujours fourni)
 * @param {object} [kineDestinataire]  Kine Prisma (destinataire si compte détecté). Sinon snapshot lu dans contract.data.destinataireSnapshot
 * @returns {object} pdfData
 */
function buildPdfData(contract, kineInitiateur, kineDestinataire = null) {
  if (!contract) throw new Error('Contract manquant');
  if (!kineInitiateur) throw new Error('Kine initiateur manquant');

  const initiateurFields = extractKineFields(kineInitiateur);

  // Infos destinataire : 3 sources possibles (priorité décroissante)
  let destinataireFields;
  if (kineDestinataire) {
    destinataireFields = extractKineFields(kineDestinataire);
  } else if (contract.data && contract.data.destinataireSnapshot) {
    // Snapshot rempli par le destinataire invité lors de sa signature (étape ultérieure)
    destinataireFields = { ...contract.data.destinataireSnapshot };
    if (destinataireFields.birthDate) destinataireFields.birthDate = formatDateFr(destinataireFields.birthDate);
  } else {
    // Preview avant complétion → uniquement les infos minimales du Contract
    destinataireFields = {
      firstName: contract.destinataireFirstName,
      lastName: contract.destinataireLastName,
      email: contract.destinataireEmail,
    };
  }

  const isInitiateurTitulaire = contract.roleInitiateur === 'TITULAIRE';
  const remplace = isInitiateurTitulaire ? initiateurFields : destinataireFields;
  const remplacant = isInitiateurTitulaire ? destinataireFields : initiateurFields;

  const d = contract.data || {};
  const contratFields = {
    dateDebut: formatDateFr(d.dateDebut),
    dateFin: formatDateFr(d.dateFin),
    retrocessionPercent: d.retrocessionPercent ?? null,
    indemnitesDeplacementRemplacantPercent: d.indemnitesDeplacementRemplacantPercent ?? null,
    supplementsBalneoRemplacePercent: d.supplementsBalneoRemplacePercent ?? null,
    nonInstallationRadiusKm: d.nonInstallationRadiusKm ?? null,
    departementConciliation: d.departementConciliation ?? remplace?.departementOrdre ?? null,
    signatureLieu: d.signatureLieu ?? null,
    signatureDate: formatDateFr(d.signatureDate),
  };

  return {
    remplace,
    remplacant,
    contrat: contratFields,
    signatures: {
      remplace: d.signatures?.remplace ?? null,
      remplacant: d.signatures?.remplacant ?? null,
    },
    meta: {
      logoUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/logo.png` : '',
      todayLabel: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    },
  };
}

/**
 * Render HTML brut (pas de Puppeteer) — utile pour tests + preview HTML en interne
 */
function renderContractHtml(contract, kineInitiateur, kineDestinataire = null) {
  if (contract.type !== 'REMPLACEMENT_LIBERAL') {
    const err = new Error(`Type de contrat non supporté pour le moment : ${contract.type}`);
    err.code = ERROR_CODES.UNSUPPORTED_TYPE;
    throw err;
  }
  const pdfData = buildPdfData(contract, kineInitiateur, kineDestinataire);
  return renderRemplacementLiberalHtml(pdfData);
}

/**
 * Génère le PDF d'un contrat (HTML → buffer). Combine renderContractHtml + generatePdfBuffer.
 */
async function generateContractPdf(contract, kineInitiateur, kineDestinataire = null) {
  const html = renderContractHtml(contract, kineInitiateur, kineDestinataire);
  return generatePdfBuffer(html);
}

/**
 * Génère le PDF final scellé incluant les signatures cursives des 2 parties.
 * Lit les ContractSignature pour associer le texte de signature au bon rôle (remplace/remplaçant).
 *
 * @param {object} contract        Contract Prisma (avec data JSON et signatures incluses)
 * @param {object} kineInitiateur  Kine Prisma
 * @param {object} [kineDestinataire]  Kine OU objet { firstName, lastName, civilite, ... } pour invité
 * @returns {Promise<{ buffer: Buffer, hash: string }>}
 */
async function generateFinalPdf(contract, kineInitiateur, kineDestinataire = null) {
  const signatures = Array.isArray(contract.signatures) ? contract.signatures : [];
  const initiatorSig = signatures.find(s => s.signerRole === 'INITIATEUR');
  const destSig = signatures.find(s => s.signerRole === 'DESTINATAIRE');

  // L'initiateur est-il "remplacé" (TITULAIRE) ou "remplaçant" ?
  const initIsTitulaire = contract.roleInitiateur === 'TITULAIRE';
  const remplaceSignText = initIsTitulaire
    ? (initiatorSig?.signatureText || null)
    : (destSig?.signatureText || null);
  const remplacantSignText = initIsTitulaire
    ? (destSig?.signatureText || null)
    : (initiatorSig?.signatureText || null);

  // On override .data.signatures pour le template (qui les lit là)
  const contractForRender = {
    ...contract,
    data: {
      ...(contract.data || {}),
      signatures: { remplace: remplaceSignText, remplacant: remplacantSignText },
    },
  };

  const buffer = await generateContractPdf(contractForRender, kineInitiateur, kineDestinataire);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { buffer, hash };
}

module.exports = {
  ERROR_CODES,
  isPuppeteerEnabled,
  buildPdfData,
  renderContractHtml,
  generatePdfBuffer,
  generateContractPdf,
  generateFinalPdf,
};
