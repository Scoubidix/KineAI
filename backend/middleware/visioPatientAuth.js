const { validateVisioToken } = require('../services/visioTokenService');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeIP } = require('../utils/logSanitizer');

const CLOSED_STATUSES = ['CANCELLED', 'ENDED'];

async function authenticateVisioPatient(req, res, next) {
  try {
    let token = null;
    if (req.params.token) token = req.params.token;
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token requis', code: 'TOKEN_MISSING' });
    }

    const validation = validateVisioToken(token);
    if (!validation.success) {
      const ip = req.ip || req.connection?.remoteAddress;
      logger.warn(`🚨 VISIO_AUTH: token invalide - IP: ${sanitizeIP(ip)} - Code: ${validation.code}`);
      return res.status(401).json({ success: false, error: validation.error, code: validation.code || 'TOKEN_INVALID' });
    }

    const prisma = prismaService.getInstance();
    const seance = await prisma.visioSeance.findUnique({ where: { id: validation.seanceId } });
    if (!seance || !seance.isActive || seance.patientId !== validation.patientId) {
      return res.status(403).json({ success: false, error: 'Acces refuse', code: 'SEANCE_INVALID' });
    }
    if (CLOSED_STATUSES.includes(seance.status)) {
      return res.status(403).json({ success: false, error: 'Seance close', code: 'SEANCE_CLOSED' });
    }

    req.visioSeance = seance;
    req.visioPatientId = validation.patientId;
    next();
  } catch (error) {
    logger.error('Erreur visioPatientAuth:', error.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur', code: 'AUTH_ERROR' });
  }
}

module.exports = { authenticateVisioPatient };
