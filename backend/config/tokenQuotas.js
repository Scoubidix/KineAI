// config/tokenQuotas.js
// Quotas de tokens/jour par plan pour le chat unifié (input + output des appels de génération).
// VALEURS PLACEHOLDER — à calibrer avec les tokensUsed réels (cf. spec chat unifié §3).
// L'IA admin/bilan et adminAiService ne sont PAS concernées (paywall requireAssistant classique).

const TOKEN_QUOTAS = {
  FREE: 10000, // découverte : ~2-3 questions légères
  DECLIC: 60000,
  PRATIQUE: 150000,
  PIONNIER: 500000,
  EXPERT: 500000,
};

/**
 * Quota quotidien du plan (FREE par défaut, cohérent avec authorization.js).
 */
const getQuotaForPlan = (planType) => TOKEN_QUOTAS[planType] ?? TOKEN_QUOTAS.FREE;

module.exports = { TOKEN_QUOTAS, getQuotaForPlan };
