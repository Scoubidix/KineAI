const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const visioService = require('../services/visioService');
const { isPatientPresent } = require('../services/visioSignaling');
const { generateCompteRenduPdf, ERROR_CODES: PDF_ERRORS } = require('../services/visioComptePdfService');
const { sendTransactionalEmail } = require('../services/brevoMailService');

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 Mo

// Résout le kiné authentifié à partir de req.uid
async function resolveKine(req) {
  const prisma = prismaService.getInstance();
  return prisma.kine.findUnique({ where: { uid: req.uid } });
}

function handleError(res, error, context) {
  if (error && error.httpStatus) {
    return res.status(error.httpStatus).json({ success: false, error: error.message, code: error.code });
  }
  logger.error(`Erreur visio (${context}):`, error.message);
  return res.status(500).json({ success: false, error: 'Erreur serveur', code: 'SERVER_ERROR' });
}

// ---- Kiné ----
async function createSeance(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const result = await visioService.createSeance(kine.id, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, 'createSeance');
  }
}

async function listSeances(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const archived = req.query.archived === '1' || req.query.archived === 'true';
    const seances = await visioService.listSeances(kine.id, { archived });
    // Annoter chaque séance avec la présence live du patient dans la room
    const withPresence = seances.map((s) => ({
      ...s,
      patientPresent: isPatientPresent(s.roomId),
    }));
    return res.status(200).json(withPresence);
  } catch (error) {
    return handleError(res, error, 'listSeances');
  }
}

async function getSeance(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.getSeanceForKine(kine.id, req.params.id);
    if (!seance) return res.status(404).json({ success: false, error: 'Seance introuvable', code: 'SEANCE_NOT_FOUND' });
    return res.status(200).json({ ...seance, patientPresent: isPatientPresent(seance.roomId) });
  } catch (error) {
    return handleError(res, error, 'getSeance');
  }
}

async function setConsent(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.setConsent(kine.id, req.params.id);
    return res.status(200).json(seance);
  } catch (error) {
    return handleError(res, error, 'setConsent');
  }
}

async function cancelSeance(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.cancelSeance(kine.id, req.params.id);
    return res.status(200).json(seance);
  } catch (error) {
    return handleError(res, error, 'cancelSeance');
  }
}

async function rescheduleSeance(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.rescheduleSeance(kine.id, req.params.id, req.body.scheduledAt);
    return res.status(200).json({ ...seance, patientPresent: isPatientPresent(seance.roomId) });
  } catch (error) {
    return handleError(res, error, 'rescheduleSeance');
  }
}

async function resendLink(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.resendLink(kine.id, req.params.id, req.body.deliveryChannel);
    return res.status(200).json({ ...seance, patientPresent: isPatientPresent(seance.roomId) });
  } catch (error) {
    return handleError(res, error, 'resendLink');
  }
}

async function archiveSeances(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const result = await visioService.archiveSeances(kine.id, req.body.ids);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, 'archiveSeances');
  }
}

async function unarchiveSeance(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.unarchiveSeance(kine.id, req.params.id);
    return res.status(200).json(seance);
  } catch (error) {
    return handleError(res, error, 'unarchiveSeance');
  }
}

async function saveCompteRendu(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.setCompteRendu(kine.id, req.params.id, req.body.compteRendu);
    return res.status(200).json(seance);
  } catch (error) {
    return handleError(res, error, 'saveCompteRendu');
  }
}

async function compteRenduPdf(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });
    const seance = await visioService.getSeanceFull(kine.id, req.params.id);
    const buffer = await generateCompteRenduPdf({
      compteRendu: seance.compteRendu || '',
      scheduledAt: seance.scheduledAt,
      kine: seance.kine,
      patient: seance.patient,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="compte-rendu-seance-${seance.id}.pdf"`);
    return res.status(200).send(buffer);
  } catch (error) {
    if (error && error.code === PDF_ERRORS.PUPPETEER_DISABLED) {
      return res.status(503).json({ success: false, error: 'Export PDF indisponible sur cet environnement', code: 'PDF_UNAVAILABLE' });
    }
    return handleError(res, error, 'compteRenduPdf');
  }
}

async function sendDocument(req, res) {
  try {
    const kine = await resolveKine(req);
    if (!kine) return res.status(404).json({ success: false, error: 'Kine introuvable', code: 'KINE_NOT_FOUND' });

    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'Aucun fichier fourni', code: 'NO_FILE' });
    if (!ALLOWED_DOC_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Type de fichier non autorisé (PDF ou image uniquement)', code: 'INVALID_TYPE' });
    }
    if (file.size > MAX_DOC_BYTES) {
      return res.status(400).json({ success: false, error: 'Fichier trop volumineux (10 Mo maximum)', code: 'FILE_TOO_LARGE' });
    }

    const seance = await visioService.getSeanceFull(kine.id, req.params.id);
    if (!seance.patient?.email) {
      return res.status(400).json({ success: false, error: 'Le patient n\'a pas d\'adresse email', code: 'NO_EMAIL' });
    }

    const message = (req.body.message || '').toString().slice(0, 2000);
    const htmlContent = `<p>Bonjour,</p>
<p>Votre praticien vous transmet un document suite à votre séance de télésoin.</p>
${message ? `<p>${message.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : ''}
<p>Vous trouverez le document en pièce jointe.</p>`;

    await sendTransactionalEmail({
      toEmail: seance.patient.email,
      subject: 'Un document de votre praticien',
      htmlContent,
      textContent: 'Votre praticien vous transmet un document suite à votre séance de télésoin (en pièce jointe).',
      attachment: [{ name: file.originalname, content: file.buffer.toString('base64') }],
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return handleError(res, error, 'sendDocument');
  }
}

// ---- Patient (req.visioSeance posé par le middleware) ----
function getSession(req, res) {
  const s = req.visioSeance;
  return res.status(200).json({
    scheduledAt: s.scheduledAt,
    status: s.status,
    patientInfoAcknowledged: !!s.patientInfoAckAt,
    seanceId: s.id,
  });
}

async function ackInfo(req, res) {
  try {
    const prisma = prismaService.getInstance();
    await prisma.visioSeance.update({
      where: { id: req.visioSeance.id },
      data: { patientInfoAckAt: new Date() },
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return handleError(res, error, 'ackInfo');
  }
}

module.exports = {
  createSeance, listSeances, getSeance, setConsent, cancelSeance, rescheduleSeance, resendLink,
  archiveSeances, unarchiveSeance,
  saveCompteRendu, compteRenduPdf, sendDocument,
  getSession, ackInfo,
};
