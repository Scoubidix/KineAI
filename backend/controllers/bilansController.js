const prismaService = require('../services/prismaService');
const { sanitizeId } = require('../utils/logSanitizer');
const logger = require('../utils/logger');

// Helper : récupère le kiné depuis req.uid et vérifie ownership du patient
const getKineAndPatient = async (req, res) => {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({ where: { uid: req.uid } });
  if (!kine) {
    res.status(404).json({ success: false, error: 'Kiné introuvable', code: 'KINE_NOT_FOUND' });
    return null;
  }

  const patientId = parseInt(req.params.patientId);
  if (isNaN(patientId)) {
    res.status(400).json({ success: false, error: 'ID patient invalide', code: 'INVALID_PATIENT_ID' });
    return null;
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, kineId: kine.id, isActive: true }
  });
  if (!patient) {
    res.status(404).json({ success: false, error: 'Patient non trouvé ou accès refusé', code: 'PATIENT_NOT_FOUND' });
    return null;
  }

  return { kine, patient, prisma };
};

// POST /api/patients/:patientId/bilans — Créer un bilan associé à un patient
exports.createBilan = async (req, res) => {
  try {
    const ctx = await getKineAndPatient(req, res);
    if (!ctx) return;
    const { kine, patient, prisma } = ctx;

    const { motif, rawNotes, bilanHtml } = req.body;

    const bilan = await prisma.bilanKine.create({
      data: {
        motif: motif || null,
        rawNotes,
        bilanHtml,
        kineId: kine.id,
        patientId: patient.id,
      }
    });

    logger.info(`Bilan créé pour patient ${sanitizeId(patient.id)} par kiné ${sanitizeId(kine.id)}`);
    res.status(201).json({ success: true, bilan });
  } catch (err) {
    logger.error('Erreur création bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur création bilan', code: 'INTERNAL_ERROR' });
  }
};

// GET /api/patients/:patientId/bilans — Lister les bilans d'un patient
exports.getBilans = async (req, res) => {
  try {
    const ctx = await getKineAndPatient(req, res);
    if (!ctx) return;
    const { patient, prisma } = ctx;

    const bilans = await prisma.bilanKine.findMany({
      where: { patientId: patient.id, isActive: true },
      select: {
        id: true,
        motif: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, bilans });
  } catch (err) {
    logger.error('Erreur récupération bilans :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération bilans', code: 'INTERNAL_ERROR' });
  }
};

// GET /api/patients/:patientId/bilans/:bilanId — Récupérer un bilan complet
exports.getBilanById = async (req, res) => {
  try {
    const ctx = await getKineAndPatient(req, res);
    if (!ctx) return;
    const { patient, prisma } = ctx;

    const bilanId = parseInt(req.params.bilanId);
    if (isNaN(bilanId)) {
      return res.status(400).json({ success: false, error: 'ID bilan invalide', code: 'INVALID_BILAN_ID' });
    }

    const bilan = await prisma.bilanKine.findFirst({
      where: { id: bilanId, patientId: patient.id, isActive: true },
    });

    if (!bilan) {
      return res.status(404).json({ success: false, error: 'Bilan non trouvé ou accès refusé', code: 'BILAN_NOT_FOUND' });
    }

    res.json({ success: true, bilan });
  } catch (err) {
    logger.error('Erreur récupération bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur récupération bilan', code: 'INTERNAL_ERROR' });
  }
};

// PUT /api/patients/:patientId/bilans/:bilanId — Modifier un bilan
exports.updateBilan = async (req, res) => {
  try {
    const ctx = await getKineAndPatient(req, res);
    if (!ctx) return;
    const { patient, prisma } = ctx;

    const bilanId = parseInt(req.params.bilanId);
    if (isNaN(bilanId)) {
      return res.status(400).json({ success: false, error: 'ID bilan invalide', code: 'INVALID_BILAN_ID' });
    }

    const existing = await prisma.bilanKine.findFirst({
      where: { id: bilanId, patientId: patient.id, isActive: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bilan non trouvé ou accès refusé', code: 'BILAN_NOT_FOUND' });
    }

    const { motif, rawNotes, bilanHtml } = req.body;

    const updated = await prisma.bilanKine.update({
      where: { id: bilanId },
      data: {
        ...(motif !== undefined && { motif }),
        ...(rawNotes !== undefined && { rawNotes }),
        ...(bilanHtml !== undefined && { bilanHtml }),
      }
    });

    logger.info(`Bilan ${sanitizeId(bilanId)} modifié par kiné`);
    res.json({ success: true, bilan: updated });
  } catch (err) {
    logger.error('Erreur modification bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur modification bilan', code: 'INTERNAL_ERROR' });
  }
};

// DELETE /api/patients/:patientId/bilans/:bilanId — Soft delete
exports.deleteBilan = async (req, res) => {
  try {
    const ctx = await getKineAndPatient(req, res);
    if (!ctx) return;
    const { patient, prisma } = ctx;

    const bilanId = parseInt(req.params.bilanId);
    if (isNaN(bilanId)) {
      return res.status(400).json({ success: false, error: 'ID bilan invalide', code: 'INVALID_BILAN_ID' });
    }

    const existing = await prisma.bilanKine.findFirst({
      where: { id: bilanId, patientId: patient.id, isActive: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bilan non trouvé ou accès refusé', code: 'BILAN_NOT_FOUND' });
    }

    await prisma.bilanKine.update({
      where: { id: bilanId },
      data: { isActive: false, deletedAt: new Date() }
    });

    logger.info(`Bilan ${sanitizeId(bilanId)} supprimé (soft delete)`);
    res.json({ success: true, message: 'Bilan supprimé' });
  } catch (err) {
    logger.error('Erreur suppression bilan :', err);
    res.status(500).json({ success: false, error: 'Erreur suppression bilan', code: 'INTERNAL_ERROR' });
  }
};
