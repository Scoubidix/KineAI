const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const visioService = require('../services/visioService');

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
    const seances = await visioService.listSeances(kine.id);
    return res.status(200).json(seances);
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
    return res.status(200).json(seance);
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
  createSeance, listSeances, getSeance, setConsent, cancelSeance,
  getSession, ackInfo,
};
