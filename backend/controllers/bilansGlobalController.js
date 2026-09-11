const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const bilanRenderService = require('../services/bilanRenderService');
const { PRINT_CSS } = require('../services/bilanRenderer');
const { generatePdfBuffer, PDF_ERROR_CODES } = require('../services/pdfService');
const { sanitizeId } = require('../utils/logSanitizer');
const draftService = require('../services/bilanDraftService');
const extractionService = require('../services/bilanExtractionService');
const composeService = require('../services/bilanComposeService');
const asrService = require('../services/asrService');
const dictationCorrectionService = require('../services/dictationCorrectionService');
const jobService = require('../services/bilanJobService');
const { MAX_SEGMENTS } = require('../services/bilanJobRules');

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
    const { html, examenHtml, title } = await bilanRenderService.renderForKine({ kineId, bilanId, includeEvolution: req.query.evolution === '1' });
    // css : permet au front de reconstituer un document imprimable si le PDF serveur est indisponible
    res.json({ success: true, html, title, css: PRINT_CSS, examenHtml });
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

// Traduit une DraftError en réponse HTTP ; toute autre erreur → 500
function sendDraftError(res, err, context) {
  if (err instanceof draftService.DraftError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code, ...err.extra });
  }
  logger.error(`Erreur ${context} :`, err);
  return res.status(500).json({ success: false, error: `Erreur ${context}`, code: 'INTERNAL_ERROR' });
}

const LIST_STATUSES = ['BROUILLON', 'GENERE', 'ENREGISTRE'];

/** POST /api/bilans */
exports.createBilanDraft = async (req, res) => {
  try {
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { type = 'INITIAL', patientId = null, motif = null } = req.body;
    const bilan = await draftService.createDraft({ kineId, type, patientId, motif });
    res.status(201).json({ success: true, bilan });
  } catch (err) {
    sendDraftError(res, err, 'création du brouillon');
  }
};

/** GET /api/bilans?status=BROUILLON,GENERE&limit=20 */
exports.listMyBilans = async (req, res) => {
  try {
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const statuses = req.query.status ? String(req.query.status).split(',').map((s) => s.trim()) : ['BROUILLON', 'GENERE'];
    if (statuses.some((s) => !LIST_STATUSES.includes(s))) {
      return res.status(400).json({ success: false, error: 'Statut invalide', code: 'INVALID_STATUS' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const bilans = await draftService.listMyBilans({ kineId, statuses, limit });
    res.json({ success: true, bilans });
  } catch (err) {
    sendDraftError(res, err, 'liste des bilans');
  }
};

/** GET /api/bilans/:id */
exports.getBilanForEditor = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const bilan = await draftService.getForEditor({ kineId, bilanId });
    res.json({ success: true, bilan });
  } catch (err) {
    sendDraftError(res, err, 'lecture du bilan');
  }
};

/** PATCH /api/bilans/:id — autosave */
exports.patchBilan = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { expectedUpdatedAt, ...patch } = req.body;
    const { updatedAt } = await draftService.updateDraft({ kineId, bilanId, patch, expectedUpdatedAt });
    res.json({ success: true, updatedAt });
  } catch (err) {
    sendDraftError(res, err, 'sauvegarde du bilan');
  }
};

/** POST /api/bilans/:id/attach */
exports.attachPatient = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const bilan = await draftService.attachPatient({ kineId, bilanId, patientId: req.body.patientId });
    res.json({ success: true, bilan });
  } catch (err) {
    sendDraftError(res, err, 'rattachement du patient');
  }
};

/** POST /api/bilans/:id/finalize */
exports.finalizeBilan = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const bilan = await draftService.finalizeBilan({ kineId, bilanId });
    res.json({ success: true, bilan });
  } catch (err) {
    sendDraftError(res, err, 'enregistrement du bilan');
  }
};

/** DELETE /api/bilans/:id */
exports.deleteBilan = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { deleted } = await draftService.removeBilan({ kineId, bilanId });
    res.json({ success: true, deleted });
  } catch (err) {
    sendDraftError(res, err, 'suppression du bilan');
  }
};

/** POST /api/bilans/:id/extract — candidats mesures depuis les notes (rien n'est écrit) */
exports.extractBilan = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { candidates, rejected } = await extractionService.extractForBilan({ kineId, bilanId });
    res.json({ success: true, candidates, rejected });
  } catch (err) {
    sendDraftError(res, err, 'analyse des notes');
  }
};

/** POST /api/bilans/:id/compose — rédaction des sections (toutes ou celles demandées) */
exports.composeBilan = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { bilan, warnings } = await composeService.composeForBilan({ kineId, bilanId, sections: req.body.sections, uid: req.uid });
    res.json({ success: true, bilan, warnings });
  } catch (err) {
    sendDraftError(res, err, 'rédaction du bilan');
  }
};

/** POST /api/bilans/:id/compose-from-notes — extraction + acceptation automatique + rédaction des 7 sections, une écriture */
exports.composeBilanFromNotes = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { bilan, warnings, accepted, pending, rejected } = await composeService.composeFromNotesForBilan({ kineId, bilanId, uid: req.uid });
    res.json({ success: true, bilan, warnings, accepted, pending, rejected });
  } catch (err) {
    sendDraftError(res, err, 'rédaction depuis les notes');
  }
};

const TAKE_ID_RE = /^[0-9a-f-]{8,64}$/i;

/** GET /api/bilans/dictation/status — le worker ASR est-il configuré et prêt ? */
exports.dictationStatus = async (req, res) => {
  res.json({ success: true, available: await asrService.checkHealth() });
};

/** POST /api/bilans/:id/dictation — transcrit un segment audio (multipart), rien n'est écrit */
exports.transcribeDictation = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { takeId, index, prevText, mimeType } = req.body || {};
    const idx = Number(index);
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0 || !TAKE_ID_RE.test(String(takeId || '')) || !Number.isInteger(idx) || idx < 0) {
      return res.status(400).json({ success: false, error: 'Segment invalide', code: 'INVALID_SEGMENT' });
    }
    const prisma = prismaService.getInstance();
    const bilan = await prisma.bilanKine.findFirst({ where: { id: bilanId, kineId, isActive: true }, select: { document: true } });
    if (!bilan) throw new draftService.DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
    if (!bilan.document) throw new draftService.DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être dictés');
    const prompt = asrService.buildPrompt(String(prevText || '').slice(0, 600));
    const r = await asrService.transcribeSegment({ buffer: req.file.buffer, mimeType: String(mimeType || req.file.mimetype || ''), prompt, priority: 'interactive' });
    logger.info(`Dictée bilan ${bilanId} prise ${sanitizeId(String(takeId))} segment ${idx} : ${r.audioSeconds}s audio, ${r.processingSeconds}s calcul`);
    res.json({ success: true, text: r.text, audioSeconds: r.audioSeconds, processingSeconds: r.processingSeconds });
  } catch (err) {
    if (err instanceof draftService.DraftError && err.code === 'ASR_BUSY') res.set('Retry-After', String((err.extra && err.extra.retryAfter) || 5));
    sendDraftError(res, err, 'transcription de la dictée');
  }
};

/** POST /api/bilans/:id/dictation/correct — corrige le texte d'une prise (termes, hésitations) ; rien n'est écrit */
exports.correctDictation = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    if (!asrService.isConfigured()) throw new draftService.DraftError('DICTATION_DISABLED', 503, 'La dictée n’est pas disponible pour le moment');
    const bilan = await prismaService.getInstance().bilanKine.findFirst({ where: { id: bilanId, kineId, isActive: true }, select: { document: true } });
    if (!bilan) throw new draftService.DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
    if (!bilan.document) throw new draftService.DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être dictés');
    try {
      const catalog = await bilanRenderService.getCatalog();
      const r = await dictationCorrectionService.correct({ text: req.body.text, mode: req.body.mode, catalog });
      return res.json({ success: true, text: r.text, applied: r.applied, ignored: r.ignored });
    } catch (err) {
      if (err instanceof draftService.DraftError) throw err;
      // Repli silencieux (spec correction §3) : toute panne de la passe de correction renvoie le texte brut, jamais d'erreur au kiné
      logger.warn(`Correction dictée : passe en échec (${err?.name}: ${err?.message})`);
      return res.json({ success: true, text: req.body.text, applied: 0, ignored: 0 });
    }
  } catch (err) {
    sendDraftError(res, err, 'correction de la dictée');
  }
};

/** POST /api/bilans/:id/job — crée (ou remet à zéro) le traitement de dictée du bilan */
exports.createJob = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const job = await jobService.createOrResetJob({ kineId, bilanId, kind: req.body.kind || 'DICTATION' });
    res.status(201).json({ success: true, job });
  } catch (err) {
    sendDraftError(res, err, 'création du traitement de dictée');
  }
};

/** POST /api/bilans/:id/job/segments — un segment audio, transcrit en arrière-plan ; 202 tout de suite */
exports.uploadJobSegment = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const { index, mimeType } = req.body || {};
    const idx = Number(index);
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0 || !Number.isInteger(idx) || idx < 0 || idx >= MAX_SEGMENTS) {
      return res.status(400).json({ success: false, error: 'Segment invalide', code: 'INVALID_SEGMENT' });
    }
    const r = await jobService.receiveSegment({ kineId, bilanId, index: idx, buffer: req.file.buffer, mimeType: String(mimeType || req.file.mimetype || '') });
    res.status(202).json({ success: true, index: r.index });
  } catch (err) {
    sendDraftError(res, err, 'réception d’un segment de dictée');
  }
};

/** POST /api/bilans/:id/job/finish — « Générer le bilan » */
exports.finishJob = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    const job = await jobService.finishRecording({ kineId, bilanId, segmentsTotal: req.body.segmentsTotal });
    res.json({ success: true, job });
  } catch (err) {
    sendDraftError(res, err, 'fin d’enregistrement de la dictée');
  }
};

/** GET /api/bilans/:id/job — avancement */
exports.getJob = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    res.json({ success: true, job: await jobService.getJobView({ kineId, bilanId }) });
  } catch (err) {
    sendDraftError(res, err, 'lecture du traitement de dictée');
  }
};

/** POST /api/bilans/:id/job/skip-failed — « Continuer sans ces passages » */
exports.skipFailedSegments = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    res.json({ success: true, job: await jobService.skipFailed({ kineId, bilanId }) });
  } catch (err) {
    sendDraftError(res, err, 'passages ignorés de la dictée');
  }
};

/** POST /api/bilans/:id/job/retry — « Réessayer » après un échec de la queue */
exports.retryJob = async (req, res) => {
  try {
    const bilanId = parseBilanId(req, res);
    if (bilanId === null) return;
    const kineId = await getKineId(req, res);
    if (!kineId) return;
    res.json({ success: true, job: await jobService.retryJob({ kineId, bilanId }) });
  } catch (err) {
    sendDraftError(res, err, 'reprise du traitement de dictée');
  }
};
