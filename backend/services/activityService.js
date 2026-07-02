const prismaService = require('./prismaService');
const logger = require('../utils/logger');

/**
 * Journalise une activité kiné pour le calcul du « temps gagné ».
 * NON-BLOQUANT : ne throw jamais, ne doit jamais casser l'action métier appelante.
 * Appeler sans `await` (fire-and-forget).
 * @param {string} uid  UID Firebase du kiné (req.uid)
 * @param {'IA_SEARCH'|'BILAN_GENERATED'|'PROGRAMME_CREATED'|'ADMIN_LETTER'|'CONTRACT_CREATED'} type
 */
async function logActivity(uid, type) {
  try {
    if (!uid) return;
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
    if (!kine) return;
    await prisma.kineActivityEvent.create({ data: { kineId: kine.id, type } });
  } catch (err) {
    logger.warn(`[activityService] échec log activité ${type}: ${err.message}`);
  }
}

module.exports = { logActivity };
