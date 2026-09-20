// routes/adminDashboard.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const adminStatsService = require('../services/adminStatsService');
const asrMonitoringService = require('../services/asrMonitoringService');
const admin = require('../firebase/firebase');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/logSanitizer');

/**
 * GET /admin/dashboard/stats
 * Statistiques globales pour le dashboard admin
 */
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await adminStatsService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Erreur récupération stats admin', { error: error.message });
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des statistiques', code: 'STATS_ERROR' });
  }
});

/**
 * GET /admin/dashboard/token-usage
 * Consommation tokens IA du chat unifié : aujourd'hui (en cours), hier,
 * moyenne 10 jours, détail par plan, coûts estimés (tarif blended Medium 3.5)
 */
router.get('/token-usage', authenticate, requireAdmin, async (req, res) => {
  try {
    const tokenUsageService = require('../services/tokenUsageService');
    const data = await tokenUsageService.getAdminUsageStats();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur récupération usage tokens admin', { error: error.message });
    res.status(500).json({ success: false, error: "Erreur lors de la récupération de l'usage tokens", code: 'TOKEN_USAGE_ERROR' });
  }
});

/**
 * GET /admin/dashboard/unverified-emails
 * Liste les kinés dont l'email n'est pas vérifié sur Firebase
 */
router.get('/unverified-emails', authenticate, requireAdmin, async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    // Récupérer tous les UIDs non vérifiés sur Firebase (1-2 appels au lieu de N)
    const unverifiedUids = new Set();
    let nextPageToken;
    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      for (const user of listResult.users) {
        if (!user.emailVerified) {
          unverifiedUids.add(user.uid);
        }
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    // Récupérer les kinés actifs dont l'UID est non vérifié
    const kines = await prisma.kine.findMany({
      where: {},
      select: { id: true, uid: true, email: true, firstName: true, lastName: true, planType: true, createdAt: true }
    });

    const unverified = kines
      .filter(kine => unverifiedUids.has(kine.uid))
      .map(kine => ({
        id: kine.id,
        uid: kine.uid,
        email: kine.email,
        firstName: kine.firstName,
        lastName: kine.lastName,
        planType: kine.planType,
        createdAt: kine.createdAt,
      }));

    logger.info(`Admin: ${kines.length} kinés en base, ${unverified.length} emails non vérifiés`);
    res.json({ success: true, data: unverified });
  } catch (error) {
    logger.error('Erreur récupération emails non vérifiés', { error: error.message });
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération', code: 'UNVERIFIED_ERROR' });
  }
});

/**
 * POST /admin/dashboard/verify-email/:uid
 * Valide manuellement l'email d'un kiné sur Firebase
 */
router.post('/verify-email/:uid', authenticate, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;

    // Vérifier que le kiné existe en base
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid },
      select: { id: true, email: true }
    });

    if (!kine) {
      return res.status(404).json({ success: false, error: 'Kiné non trouvé', code: 'NOT_FOUND' });
    }

    // Valider l'email sur Firebase
    await admin.auth().updateUser(uid, { emailVerified: true });

    logger.info(`Admin: email validé manuellement pour ${sanitizeEmail(kine.email)}`);
    res.json({ success: true, message: 'Email validé avec succès' });
  } catch (error) {
    logger.error('Erreur validation manuelle email', { error: error.message });
    res.status(500).json({ success: false, error: 'Erreur lors de la validation', code: 'VERIFY_ERROR' });
  }
});

/**
 * GET /admin/dashboard/asr/health
 * État live du worker ASR (proxy de son /healthz) + disjoncteur de l'instance qui répond.
 * Appelée en polling par l'onglet admin : aucune requête DB.
 */
router.get('/asr/health', authenticate, requireAdmin, async (req, res) => {
  try {
    const data = await asrMonitoringService.getWorkerHealth();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur état worker ASR', { error: error.message });
    res.status(500).json({ success: false, error: "Erreur lors de la lecture de l'état du worker", code: 'ASR_HEALTH_ERROR' });
  }
});

/**
 * GET /admin/dashboard/asr/stats?days=7|30
 * Usage, délai vécu, échecs et traitements bloqués, calculés à la volée depuis la base.
 */
router.get('/asr/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const days = req.query.days === '30' ? 30 : 7;
    const data = await asrMonitoringService.getStats({ days });
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur stats worker ASR', { error: error.message });
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des statistiques ASR', code: 'ASR_STATS_ERROR' });
  }
});

module.exports = router;
