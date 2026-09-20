// Lectures pour le monitoring admin du worker ASR : état live (proxy de /healthz) et agrégats
// historiques calculés à la volée depuis bilan_job_segments / bilan_jobs. N'écrit jamais rien.
const prismaService = require('./prismaService');
const asrService = require('./asrService');
const logger = require('../utils/logger');

const HEALTH_TIMEOUT_MS = 3_000;

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const getSafeBreakerState = () => {
  try {
    return asrService.getBreakerState();
  } catch (err) {
    // Si le disjoncteur est illisible, renvoyer une valeur par défaut sûre (non ouvert)
    logger.warn(`Monitoring ASR : impossible de lire l'etat du disjoncteur (${err?.name || 'Error'})`);
    return { open: false, failures: 0, openUntil: null };
  }
};

/**
 * État live du worker, sans passer par le cache 30 s de asrService (fait pour la dictée, pas pour
 * un écran d'admin). Ne lève jamais : un worker tombé doit s'afficher, pas faire planter la page.
 * ⚠️ `breaker` est l'état de l'instance backend qui répond, pas une vérité globale.
 */
async function getWorkerHealth() {
  const url = (process.env.ASR_WORKER_URL || '').replace(/\/+$/, '');
  const configured = Boolean(url && process.env.ASR_WORKER_TOKEN);
  const base = {
    configured, reachable: false, status: null, model: null,
    slots: null, busy: null, queued: null,
    breaker: getSafeBreakerState(),
  };
  if (!configured) return base;
  try {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    // Le worker renvoie son diagnostic dans le corps même quand le code HTTP n'est pas 2xx
    let body = {};
    try { body = await res.json(); } catch { body = {}; }
    return {
      ...base,
      reachable: true,
      status: body.status ?? (res.ok ? null : 'error'),
      model: body.model ?? null,
      slots: numOrNull(body.slots),
      busy: numOrNull(body.busy),
      queued: numOrNull(body.queued),
    };
  } catch (err) {
    logger.warn(`Monitoring ASR : worker injoignable (${err?.name || 'Error'})`);
    return base;
  }
}

module.exports = { getWorkerHealth };
