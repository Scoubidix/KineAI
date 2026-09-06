const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const bilanRenderService = require('../services/bilanRenderService');
const { PRINT_CSS } = require('../services/bilanRenderer');
const { generatePdfBuffer, PDF_ERROR_CODES } = require('../services/pdfService');
const { sanitizeId } = require('../utils/logSanitizer');

/**
 * GET /api/bilans/patients-with-bilans
 * Retourne la liste des patients du kiné connecté ayant au moins 1 bilan actif.
 * Utilisé par la card "Bilans réalisés" du hub bilan.
 */
exports.getPatientsWithBilans = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: req.uid } });
    if (!kine) {
      return res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    }

    // Récupérer tous les patients du kiné ayant au moins 1 bilan actif,
    // avec le compte de bilans et la date du dernier bilan
    const patients = await prisma.patient.findMany({
      where: {
        kineId: kine.id,
        isActive: true,
        bilans: { some: { isActive: true, status: { not: 'BROUILLON' } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        bilans: {
          where: { isActive: true, status: { not: 'BROUILLON' } },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { bilans: { where: { isActive: true, status: { not: 'BROUILLON' } } } },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    const formatted = patients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      birthDate: p.birthDate,
      lastBilanDate: p.bilans[0]?.createdAt ?? null,
      bilanCount: p._count.bilans,
    }));

    res.json({ success: true, patients: formatted });
  } catch (err) {
    logger.error('Erreur récupération patients avec bilans :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération patients', code: 'INTERNAL_ERROR' });
  }
};

function parseBilanId(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ success: false, error: 'ID bilan invalide', code: 'INVALID_BILAN_ID' });
    return null;
  }
  return id;
}

async function getKineId(req, res) {
  if (req.kineId) return req.kineId;
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid: req.uid }, select: { id: true } });
  if (!kine) {
    res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    return null;
  }
  return kine.id;
}

// Nom de fichier ASCII sans accents : bilan-initial-durand-12.pdf
function pdfFileName(bilan) {
  const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const who = bilan.patient ? slug(bilan.patient.lastName) : 'sans-patient';
  return `bilan-${slug(bilan.type)}-${who}-${bilan.id}.pdf`;
}

/**
 * GET /api/bilans/:id/render?evolution=1
 */
exports.renderBilan = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { html, title } = await bilanRenderService.renderForKine({ kineId, bilanId, includeEvolution: req.query.evolution === '1' });
    // css : permet au front de reconstituer un document imprimable si le PDF serveur est indisponible
    res.json({ success: true, html, title, css: PRINT_CSS });
  } catch (err) {
    if (err.code === 'BILAN_NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message, code: 'BILAN_NOT_FOUND' });
    }
    logger.error('Erreur rendu bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur rendu bilan', code: 'INTERNAL_ERROR' });
  }
};

/**
 * GET /api/bilans/:id/pdf?evolution=1
 */
exports.downloadBilanPdf = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { fullHtml, bilan } = await bilanRenderService.renderPrintDocumentForKine({ kineId, bilanId, includeEvolution: req.query.evolution === '1' });
    const pdf = await generatePdfBuffer(fullHtml);
    logger.info(`PDF bilan ${sanitizeId(bilanId)} généré`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName(bilan)}"`);
    res.send(pdf);
  } catch (err) {
    if (err.code === 'BILAN_NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message, code: 'BILAN_NOT_FOUND' });
    }
    if (err.code === PDF_ERROR_CODES.PUPPETEER_DISABLED) {
      return res.status(503).json({ success: false, error: 'Génération PDF indisponible sur cet environnement', code: PDF_ERROR_CODES.PUPPETEER_DISABLED });
    }
    logger.error('Erreur PDF bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur génération PDF', code: err.code === PDF_ERROR_CODES.RENDER_FAILED ? PDF_ERROR_CODES.RENDER_FAILED : 'INTERNAL_ERROR' });
  }
};
