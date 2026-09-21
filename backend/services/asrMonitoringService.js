// Lectures pour le monitoring admin du worker ASR : état live (proxy de /healthz) et agrégats
// historiques calculés à la volée depuis asr_calls (charge du worker) et bilan_jobs (santé des
// traitements de bilan). N'écrit jamais rien, sauf purgeOldCalls (purge périodique par le cron).
const prismaService = require('./prismaService');
const asrService = require('./asrService');
const logger = require('../utils/logger');
const { parisMidnightUtc, parisYmd, parisDayKey, addDays } = require('../utils/parisDate');

const HEALTH_TIMEOUT_MS = 3_000;

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

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
    // getBreakerState est une lecture d'état mémoire ; elle ne lève pas. Avertissement si elle le devient.
    breaker: asrService.getBreakerState(),
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

// Mêmes valeurs que bilanJobService : au-delà, le traitement est déclaré perdu
const SEGMENT_TIMEOUT_MS = Number(process.env.JOB_SEGMENT_TIMEOUT_MS) || 10 * 60 * 1000;
const TAIL_TIMEOUT_MS = Number(process.env.JOB_TAIL_TIMEOUT_MS) || 10 * 60 * 1000;
// Garde-fou : les agrégats se font en mémoire, on borne la lecture
const MAX_ROWS = 200_000;
// Purge quotidienne (cron) : fenêtre affichée par le monitoring, rien au-delà n'est jamais lu
const PURGE_DEFAULT_DAYS = 30;

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Percentile par interpolation linéaire. null si la série est vide. */
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo), 1);
}

/** Les `days` derniers jours calendaires Paris, du plus ancien à aujourd'hui. */
function dayKeys(days, now) {
  const today = parisYmd(now);
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const { year, month, day } = addDays(today, -i);
    keys.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Agrégats sur les `days` derniers jours (7 ou 30), en heure de Paris.
 * `usage`/`totals`/`latency` viennent d'`asr_calls` (une ligne par tentative, succès ou échec :
 * c'est la charge réelle du worker). `stuck` et `failures.jobs` restent sur `bilan_jobs` : c'est
 * la santé des traitements de bilan, pas la charge du worker. Rien n'est écrit.
 */
async function getStats({ days } = {}) {
  const window = days === 30 ? 30 : 7;
  const now = new Date(Date.now());
  const keys = dayKeys(window, now);
  const [startY, startM, startD] = keys[0].split('-').map(Number);
  const from = parisMidnightUtc(startY, startM, startD);
  const prisma = prismaService.getInstance();

  const [rows, callErrors, jobErrors, stuckTranscribing, stuckTail] = await Promise.all([
    prisma.asrCall.findMany({
      where: { createdAt: { gte: from } },
      select: { kineId: true, source: true, waitSeconds: true, audioSeconds: true, processingSeconds: true, error: true, createdAt: true },
      take: MAX_ROWS,
    }),
    prisma.asrCall.groupBy({
      by: ['error'],
      where: { createdAt: { gte: from }, error: { not: null } },
      _count: { _all: true },
    }),
    prisma.bilanJob.groupBy({
      by: ['error'],
      where: { createdAt: { gte: from }, status: 'FAILED' },
      _count: { _all: true },
    }),
    // RECORDING est volontairement exclu : un onglet fermé laisse un job RECORDING pour toujours,
    // c'est un abandon utilisateur et non une panne — le compter rendrait l'alarme inutile.
    // ⚠️ `updatedAt` n'est pas touché pendant la transcription (les écritures visent les segments,
    // pas le job) : ce compteur signifie « en TRANSCRIBING depuis plus de 10 min », pas « sans
    // progression depuis 10 min ».
    prisma.bilanJob.count({
      where: { status: { in: ['TRANSCRIBING'] }, updatedAt: { lt: new Date(Date.now() - SEGMENT_TIMEOUT_MS) } },
    }),
    prisma.bilanJob.count({
      where: { status: { in: ['CORRECTING', 'COMPOSING'] }, updatedAt: { lt: new Date(Date.now() - TAIL_TIMEOUT_MS) } },
    }),
  ]);
  if (rows.length === MAX_ROWS) logger.warn(`Monitoring ASR : lecture tronquée à ${MAX_ROWS} appels, agrégats partiels`);

  // --- usage et latency, jour par jour ---
  const empty = () => ({ segments: 0, segmentsDictation: 0, segmentsSession: 0, audioSeconds: 0, kines: new Set(), waitsDictation: [], waitsSession: [] });
  const byDay = new Map(keys.map((k) => [k, empty()]));

  const kineCounts = new Map();
  let totalAudio = 0;
  let totalProcessing = 0;
  let audioWithProcessing = 0;
  let failed = 0;

  for (const row of rows) {
    const key = parisDayKey(row.createdAt);
    const bucket = byDay.get(key);
    if (!bucket) continue; // ligne hors fenêtre (bord de requête), ignorée

    const isSession = row.source === 'SESSION';
    bucket.segments += 1;
    if (isSession) bucket.segmentsSession += 1; else bucket.segmentsDictation += 1;
    bucket.audioSeconds += row.audioSeconds || 0;
    if (row.kineId != null) bucket.kines.add(row.kineId);

    // `waitSeconds` est chronométré sur l'appel réel, non nullable : un échec a fait attendre le
    // kiné tout autant qu'un succès, il entre donc aussi dans la latence perçue.
    if (isSession) bucket.waitsSession.push(row.waitSeconds); else bucket.waitsDictation.push(row.waitSeconds);

    if (row.kineId != null) kineCounts.set(row.kineId, (kineCounts.get(row.kineId) || 0) + 1);
    totalAudio += row.audioSeconds || 0;
    // RTF : seules les lignes qui portent audio ET temps de calcul entrent au ratio — mélanger
    // l'audio d'une ligne non mesurée (échec, ou colonne pas encore alimentée) fausse le RTF.
    if (typeof row.processingSeconds === 'number' && typeof row.audioSeconds === 'number') {
      totalProcessing += row.processingSeconds;
      audioWithProcessing += row.audioSeconds;
    }
    if (row.error) failed += 1;
  }

  const usage = keys.map((date) => {
    const b = byDay.get(date);
    return {
      date,
      segments: b.segments,
      segmentsDictation: b.segmentsDictation,
      segmentsSession: b.segmentsSession,
      audioMinutes: round(b.audioSeconds / 60, 1),
      activeKines: b.kines.size,
    };
  });

  const latency = keys.map((date) => {
    const b = byDay.get(date);
    return {
      date,
      dictation: { p50: percentile(b.waitsDictation, 50), p95: percentile(b.waitsDictation, 95), count: b.waitsDictation.length },
      session: { p50: percentile(b.waitsSession, 50), p95: percentile(b.waitsSession, 95), count: b.waitsSession.length },
    };
  });

  const activeKines = kineCounts.size;
  const totals = {
    segments: rows.length,
    audioMinutes: round(totalAudio / 60, 1),
    activeKines,
    avgSegmentsPerActiveKine: activeKines ? round(rows.length / activeKines, 1) : 0,
    maxSegmentsPerKine: activeKines ? Math.max(...kineCounts.values()) : 0,
    failureRate: rows.length ? round(failed / rows.length, 3) : 0,
    // null tant qu'aucune ligne ne porte les deux mesures ; le dénominateur ne compte que l'audio
    // des lignes dont le temps de calcul est connu, sinon le ratio mélange deux populations et le
    // RTF affiché est artificiellement bas
    rtf: audioWithProcessing > 0 ? round(totalProcessing / audioWithProcessing, 2) : null,
  };

  const toFailures = (groups) => groups
    .map((g) => ({ error: g.error || 'INCONNU', count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    days: window,
    from: from.toISOString(),
    usage,
    totals,
    latency,
    failures: { segments: toFailures(callErrors), jobs: toFailures(jobErrors) },
    stuck: { transcribing: stuckTranscribing, tail: stuckTail },
  };
}

/**
 * Purge les lignes `asr_calls` antérieures à `olderThanDays` (30 par défaut — la fenêtre max
 * affichée par le monitoring, cf. PURGE_DEFAULT_DAYS). Renvoie le nombre de lignes supprimées ;
 * ne journalise que s'il est non nul, pour ne pas polluer les logs d'une purge quotidienne à vide.
 */
async function purgeOldCalls({ olderThanDays = PURGE_DEFAULT_DAYS } = {}) {
  const prisma = prismaService.getInstance();
  const before = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.asrCall.deleteMany({ where: { createdAt: { lt: before } } });
  if (count > 0) logger.info(`Monitoring ASR : purge de ${count} ligne(s) asr_calls (> ${olderThanDays} j)`);
  return count;
}

module.exports = { getWorkerHealth, getStats, purgeOldCalls };
