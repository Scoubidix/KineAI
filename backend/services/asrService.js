// Relais vers le worker ASR (asr-worker/) : un segment audio entre, un texte sort. Rien n'est
// écrit ni conservé ; les logs ne contiennent jamais le texte ni le prompt.
const logger = require('../utils/logger');
const { DraftError } = require('./bilanDraftService');
const { DICTATION_VOCABULARY } = require('../data/dictationVocabulary');
const telegramService = require('./telegramService');
const prismaService = require('./prismaService');

const HEALTH_CACHE_MS = 30_000;
const HEALTH_TIMEOUT_MS = 3_000;
// Sur un flavor CPU partagé, un segment de 45 s peut demander 30 s de file + 45 s de calcul
const REQUEST_TIMEOUT_MS = Number(process.env.ASR_REQUEST_TIMEOUT_MS) || 90_000;
const PREV_TEXT_MAX_WORDS = 80;
const PROMPT_MAX_WORDS = 200;

let healthCache = { at: 0, ok: false };

// Disjoncteur : après BREAKER_THRESHOLD pannes d'affilée (injoignable, délai dépassé, réponse
// inattendue), on n'appelle plus le worker pendant BREAKER_COOLDOWN_MS et on échoue tout de suite,
// au lieu de bloquer chaque segment jusqu'à REQUEST_TIMEOUT_MS. Passé le délai, un appel d'essai
// passe : succès → refermé, échec → rouvert. « Occupé » (503) et audio invalide ne sont pas des pannes.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;
let breaker = { failures: 0, openUntil: 0 };
const breakerOpen = () => Date.now() < breaker.openUntil;

// Alertes de panne : on notifie à la bascule d'état, jamais par segment. État propre à cette
// instance — avec plusieurs instances backend, chacune peut alerter une fois. Acceptable pour
// un signal de panne.
const MISCONFIGURED_ALERT_INTERVAL_MS = 60 * 60 * 1000;
let alerted = { down: false, misconfiguredAt: 0 };

/** Notifie sans jamais faire échouer une transcription (Telegram absent = silence). */
function notifyIncident(message) {
  // Appel synchrone (pas de .then différé) : l'envoi part immédiatement, seul l'échec est absorbé
  Promise.resolve(telegramService.sendNotification(message)).catch(() => {});
}

function recordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    logger.warn(`ASR : disjoncteur ouvert ${BREAKER_COOLDOWN_MS / 1000} s après ${breaker.failures} panne(s) d'affilée`);
    if (!alerted.down) {
      alerted.down = true;
      notifyIncident(`🔴 Worker ASR injoignable après ${breaker.failures} échecs d'affilée — la dictée et la séance sont en panne.`);
    }
  }
}

function recordSuccess() {
  if (alerted.down) {
    alerted.down = false;
    notifyIncident('🟢 Worker ASR de nouveau joignable — la dictée est rétablie.');
  }
  breaker = { failures: 0, openUntil: 0 };
}

/** État du disjoncteur pour le monitoring admin. Lecture seule, propre à cette instance. */
const getBreakerState = () => ({ open: breakerOpen(), failures: breaker.failures, openUntil: breaker.openUntil || null });

const config = () => ({ url: (process.env.ASR_WORKER_URL || '').replace(/\/+$/, ''), token: process.env.ASR_WORKER_TOKEN || '' });
const isConfigured = () => { const c = config(); return Boolean(c.url && c.token); };
/** Oublie l'état mémorisé du worker (cache de santé et disjoncteur). */
const resetHealthCache = () => { healthCache = { at: 0, ok: false }; breaker = { failures: 0, openUntil: 0 }; alerted = { down: false, misconfiguredAt: 0 }; };

// Vocabulaire d'abord, contexte ensuite : si l'ensemble dépasse 200 mots, c'est le vocabulaire qui est rogné.
function buildPrompt(prevText) {
  const prev = String(prevText || '').split(/\s+/).filter(Boolean).slice(-PREV_TEXT_MAX_WORDS);
  return [...DICTATION_VOCABULARY.split(/\s+/), ...prev].slice(-PROMPT_MAX_WORDS).join(' ');
}

async function checkHealth() {
  if (!isConfigured() || breakerOpen()) return false;
  const now = Date.now();
  if (now - healthCache.at < HEALTH_CACHE_MS) return healthCache.ok;
  let ok = false;
  try {
    const res = await fetch(`${config().url}/healthz`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    ok = res.ok && (await res.json()).status === 'ok';
  } catch { ok = false; }
  healthCache = { at: now, ok };
  return ok;
}

const unavailable = () => new DraftError('ASR_UNAVAILABLE', 502, 'Transcription indisponible, réessaie dans un instant');

/**
 * Écrit une ligne `asr_calls` (une tentative = une ligne) sans jamais bloquer le chemin de
 * réponse : l'appelant ne l'attend pas, et une panne d'écriture est absorbée (log `warn`).
 */
function recordCall({ source, kineId, waitSeconds, audioSeconds = null, processingSeconds = null, error = null }) {
  prismaService.getInstance().asrCall.create({ data: { source, kineId, waitSeconds, audioSeconds, processingSeconds, error } })
    .catch((err) => logger.warn(`ASR : échec écriture métrique asr_calls (${err && err.message})`));
}

/**
 * Transcrit un segment. @throws {DraftError} DICTATION_DISABLED | ASR_BUSY | AUDIO_INVALID | ASR_MISCONFIGURED | ASR_UNAVAILABLE
 */
async function transcribeSegment({ buffer, mimeType, prompt, priority = 'interactive', source, kineId }) {
  if (!isConfigured()) throw new DraftError('DICTATION_DISABLED', 503, 'La dictée n\'est pas disponible pour le moment');
  if (breakerOpen()) throw unavailable();
  const { url, token } = config();
  const form = new FormData();
  form.append('audio', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), 'segment');
  form.append('language', 'fr');
  form.append('prompt', prompt || '');
  form.append('priority', priority);
  // Chronométré ici, sur l'appel réel — jamais déduit d'un horodatage écrit ailleurs.
  const startedAt = Date.now();
  const record = (error, audioSeconds, processingSeconds) => recordCall({ source, kineId, waitSeconds: (Date.now() - startedAt) / 1000, audioSeconds, processingSeconds, error });
  let res;
  try {
    res = await fetch(`${url}/v1/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    logger.warn(`ASR injoignable (${err && err.name})`);
    recordFailure();
    record('ASR_UNAVAILABLE');
    throw unavailable();
  }
  if (res.status === 503) {
    const retryAfter = Number(res.headers.get('retry-after')) || 5;
    record('ASR_BUSY');
    throw new DraftError('ASR_BUSY', 503, 'Transcription saturée, réessaie dans un instant', { retryAfter });
  }
  if (res.status === 413 || res.status === 422) {
    record('AUDIO_INVALID');
    throw new DraftError('AUDIO_INVALID', 422, 'Segment audio invalide');
  }
  if (res.status === 401) {
    logger.error('ASR : jeton refusé par le worker (ASR_WORKER_TOKEN)');
    const now = Date.now();
    if (now - alerted.misconfiguredAt >= MISCONFIGURED_ALERT_INTERVAL_MS) {
      alerted.misconfiguredAt = now;
      notifyIncident('🔴 Worker ASR : jeton refusé (ASR_WORKER_TOKEN) — la dictée est en panne.');
    }
    record('ASR_MISCONFIGURED');
    throw new DraftError('ASR_MISCONFIGURED', 500, 'Transcription indisponible');
  }
  if (!res.ok) {
    logger.error(`ASR : réponse ${res.status}`);
    recordFailure();
    record('ASR_UNAVAILABLE');
    throw unavailable();
  }
  let body;
  try {
    body = await res.json();
  } catch (err) {
    logger.error('ASR : réponse illisible');
    recordFailure();
    record('ASR_UNAVAILABLE');
    throw unavailable();
  }
  recordSuccess();
  const audioSeconds = Number(body.audio_seconds) || 0;
  const processingSeconds = Number(body.processing_seconds) || 0;
  record(null, audioSeconds, processingSeconds);
  return { text: String(body.text ?? ''), audioSeconds, processingSeconds };
}

module.exports = { isConfigured, checkHealth, resetHealthCache, buildPrompt, transcribeSegment, getBreakerState };
