// Relais vers le worker ASR (asr-worker/) : un segment audio entre, un texte sort. Rien n'est
// écrit ni conservé ; les logs ne contiennent jamais le texte ni le prompt.
const logger = require('../utils/logger');
const { DraftError } = require('./bilanDraftService');
const { DICTATION_VOCABULARY } = require('../data/dictationVocabulary');

const HEALTH_CACHE_MS = 30_000;
const HEALTH_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 60_000;
const PREV_TEXT_MAX_WORDS = 80;
const PROMPT_MAX_WORDS = 200;

let healthCache = { at: 0, ok: false };

const config = () => ({ url: (process.env.ASR_WORKER_URL || '').replace(/\/+$/, ''), token: process.env.ASR_WORKER_TOKEN || '' });
const isConfigured = () => { const c = config(); return Boolean(c.url && c.token); };
const resetHealthCache = () => { healthCache = { at: 0, ok: false }; };

// Vocabulaire d'abord, contexte ensuite : si l'ensemble dépasse 200 mots, c'est le vocabulaire qui est rogné.
function buildPrompt(prevText) {
  const prev = String(prevText || '').split(/\s+/).filter(Boolean).slice(-PREV_TEXT_MAX_WORDS);
  return [...DICTATION_VOCABULARY.split(/\s+/), ...prev].slice(-PROMPT_MAX_WORDS).join(' ');
}

async function checkHealth() {
  if (!isConfigured()) return false;
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

const unavailable = () => new DraftError('ASR_UNAVAILABLE', 502, 'Transcription indisponible, reessaie dans un instant');

/**
 * Transcrit un segment. @throws {DraftError} DICTATION_DISABLED | ASR_BUSY | AUDIO_INVALID | ASR_MISCONFIGURED | ASR_UNAVAILABLE
 */
async function transcribeSegment({ buffer, mimeType, prompt, priority = 'interactive' }) {
  if (!isConfigured()) throw new DraftError('DICTATION_DISABLED', 503, 'La dictee n\'est pas disponible pour le moment');
  const { url, token } = config();
  const form = new FormData();
  form.append('audio', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), 'segment');
  form.append('language', 'fr');
  form.append('prompt', prompt || '');
  form.append('priority', priority);
  let res;
  try {
    res = await fetch(`${url}/v1/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    logger.warn(`ASR injoignable (${err && err.name})`);
    throw unavailable();
  }
  if (res.status === 503) {
    const retryAfter = Number(res.headers.get('retry-after')) || 5;
    throw new DraftError('ASR_BUSY', 503, 'Transcription saturee, reessaie dans un instant', { retryAfter });
  }
  if (res.status === 413 || res.status === 422) throw new DraftError('AUDIO_INVALID', 422, 'Segment audio invalide');
  if (res.status === 401) { logger.error('ASR : jeton refuse par le worker (ASR_WORKER_TOKEN)'); throw new DraftError('ASR_MISCONFIGURED', 500, 'Transcription indisponible'); }
  if (!res.ok) { logger.error(`ASR : reponse ${res.status}`); throw unavailable(); }
  const body = await res.json();
  return { text: String(body.text ?? ''), audioSeconds: Number(body.audio_seconds) || 0, processingSeconds: Number(body.processing_seconds) || 0 };
}

module.exports = { isConfigured, checkHealth, resetHealthCache, buildPrompt, transcribeSegment };
