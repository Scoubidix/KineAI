const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');

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
        bilans: { some: { isActive: true } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        bilans: {
          where: { isActive: true },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { bilans: { where: { isActive: true } } },
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
