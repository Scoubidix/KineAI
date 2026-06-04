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

// Coût blended estimé par million de tokens (EUR) pour les projections du dashboard admin.
// Mistral Medium 3.5 : 1,5 $/M input + 7,5 $/M output ; le compteur stocke input+output
// confondus, avec un ratio observé ~85% input (RAG + historique) → ~2,4 $/M ≈ 2,2 €/M.
// À ajuster avec les données réelles de facturation Mistral.
const BLENDED_COST_EUR_PER_MILLION = 2.2;

module.exports = { TOKEN_QUOTAS, getQuotaForPlan, BLENDED_COST_EUR_PER_MILLION };
