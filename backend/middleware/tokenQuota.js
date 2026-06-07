// middleware/tokenQuota.js
// Quota de tokens/jour du chat unifié. Bloque en 429 AVANT d'ouvrir le SSE.
// Ne concerne PAS l'IA admin/bilan ni adminAiService (paywall requireAssistant classique).
const prismaService = require('../services/prismaService');
const tokenUsageService = require('../services/tokenUsageService');
const { getQuotaForPlan } = require('../config/tokenQuotas');
const logger = require('../utils/logger');

const checkTokenQuota = async (req, res, next) => {
  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid: req.uid }
    });

    if (!kine) {
      return res.status(404).json({ success: false, error: 'Kinésithérapeute non trouvé', code: 'KINE_NOT_FOUND' });
    }

    const planType = kine.planType || 'FREE';
    const limit = getQuotaForPlan(planType);
    const tokensUsed = await tokenUsageService.getDailyUsage(kine.id);

    if (tokensUsed >= limit) {
      logger.info(`🚫 Quota tokens atteint — kiné ${kine.id} (${planType}) : ${tokensUsed}/${limit}`);
      return res.status(429).json({
        success: false,
        error: 'Quota quotidien de tokens atteint',
        code: 'QUOTA_EXCEEDED',
        planType,
        usage: { tokensUsed, limit, remaining: 0 }
      });
    }

    // Évite un second lookup dans le contrôleur
    req.kine = kine;
    req.planType = planType;
    next();
  } catch (error) {
    logger.error('Erreur vérification quota tokens:', error);
    res.status(500).json({ success: false, error: 'Erreur interne du serveur', code: 'QUOTA_CHECK_ERROR' });
  }
};

module.exports = { checkTokenQuota };
