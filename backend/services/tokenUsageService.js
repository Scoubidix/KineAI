// services/tokenUsageService.js
// Compteur quotidien de tokens du chat unifié. Une ligne par (kineId, jour Europe/Paris) :
// le "reset à minuit" est implicite — la ligne d'hier cesse simplement d'être consultée.
const prismaService = require('./prismaService');
const logger = require('../utils/logger');

/**
 * Date calendaire du jour en Europe/Paris (gère l'heure d'été automatiquement).
 * Format 'YYYY-MM-DD' via fr-CA, converti en Date UTC minuit pour la colonne @db.Date.
 */
const getParisDate = () => {
  const dateString = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  return new Date(dateString);
};

/**
 * Tokens consommés aujourd'hui (0 si aucune ligne — le kiné n'a rien consommé).
 */
const getDailyUsage = async (kineId) => {
  const prisma = prismaService.getInstance();
  const usage = await prisma.dailyTokenUsage.findUnique({
    where: { kineId_date: { kineId, date: getParisDate() } }
  });
  return usage?.tokensUsed ?? 0;
};

/**
 * Incrémente le compteur du jour (upsert atomique sur [kineId, date]).
 * L'incrément se fait APRÈS la génération : un message en cours n'est jamais coupé,
 * un léger dépassement sur le dernier message est accepté (spec §7).
 */
const incrementDailyUsage = async (kineId, tokens) => {
  if (!tokens || tokens <= 0) return;

  const prisma = prismaService.getInstance();
  const date = getParisDate();

  await prisma.dailyTokenUsage.upsert({
    where: { kineId_date: { kineId, date } },
    update: { tokensUsed: { increment: tokens } },
    create: { kineId, date, tokensUsed: tokens }
  });

  logger.debug(`🧮 Usage tokens kiné ${kineId} : +${tokens} (jour ${date.toISOString().substring(0, 10)})`);
};

module.exports = { getParisDate, getDailyUsage, incrementDailyUsage };
