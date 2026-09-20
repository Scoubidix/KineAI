// Lectures pour le monitoring admin du worker ASR : état live (proxy de /healthz) et agrégats
// historiques calculés à la volée depuis bilan_job_segments / bilan_jobs. N'écrit jamais rien.
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

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Percentile par interpolation linéaire. null si la série est vide. */
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return round(sorted[0], 1);
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
 * Agrégats du worker sur les `days` derniers jours (7 ou 30), en heure de Paris.
 * Une seule lecture de segments sert usage, totals et latency ; failures et stuck sont des
 * agrégats SQL. Rien n'est écrit.
 */
async function getStats({ days } = {}) {
  const window = days === 30 ? 30 : 7;
  const now = new Date(Date.now());
  const keys = dayKeys(window, now);
  const [startY, startM, startD] = keys[0].split('-').map(Number);
  const from = parisMidnightUtc(startY, startM, startD);
  const prisma = prismaService.getInstance();

  const [rows, segErrors, jobErrors, stuckTranscribing, stuckTail] = await Promise.all([
    prisma.bilanJobSegment.findMany({
      where: { createdAt: { gte: from } },
      select: {
        status: true, error: true, attempts: true,
        audioSeconds: true, processingSeconds: true,
        createdAt: true, updatedAt: true,
        job: { select: { kind: true, kineId: true } },
      },
      take: MAX_ROWS,
    }),
    prisma.bilanJobSegment.groupBy({
      by: ['error'],
      where: { createdAt: { gte: from }, status: { in: ['FAILED', 'SKIPPED'] } },
      _count: { _all: true },
    }),
    prisma.bilanJob.groupBy({
      by: ['error'],
      where: { createdAt: { gte: from }, status: 'FAILED' },
      _count: { _all: true },
    }),
    // RECORDING est volontairement exclu : un onglet fermé laisse un job RECORDING pour toujours,
    // c'est un abandon utilisateur et non une panne — le compter rendrait l'alarme inutile.
    prisma.bilanJob.count({
      where: { status: { in: ['TRANSCRIBING'] }, updatedAt: { lt: new Date(Date.now() - SEGMENT_TIMEOUT_MS) } },
    }),
    prisma.bilanJob.count({
      where: { status: { in: ['CORRECTING', 'COMPOSING'] }, updatedAt: { lt: new Date(Date.now() - TAIL_TIMEOUT_MS) } },
    }),
  ]);

  // --- usage et latency, jour par jour ---
  const empty = () => ({ segments: 0, segmentsDictation: 0, segmentsSession: 0, audioSeconds: 0, kines: new Set(), waitsDictation: [], waitsSession: [] });
  const byDay = new Map(keys.map((k) => [k, empty()]));

  const kineCounts = new Map();
  let totalAudio = 0;
  let totalProcessing = 0;
  let processingKnown = 0;
  let retried = 0;

  for (const row of rows) {
    const key = parisDayKey(row.createdAt);
    const bucket = byDay.get(key);
    if (!bucket) continue; // segment hors fenêtre (bord de requête), ignoré

    const kind = row.job?.kind === 'SESSION' ? 'SESSION' : 'DICTATION';
    bucket.segments += 1;
    if (kind === 'SESSION') bucket.segmentsSession += 1; else bucket.segmentsDictation += 1;
    bucket.audioSeconds += row.audioSeconds || 0;
    if (row.job?.kineId != null) bucket.kines.add(row.job.kineId);

    if (row.status === 'DONE') {
      const wait = (row.updatedAt.getTime() - row.createdAt.getTime()) / 1000;
      if (kind === 'SESSION') bucket.waitsSession.push(wait); else bucket.waitsDictation.push(wait);
    }

    if (row.job?.kineId != null) kineCounts.set(row.job.kineId, (kineCounts.get(row.job.kineId) || 0) + 1);
    totalAudio += row.audioSeconds || 0;
    if (typeof row.processingSeconds === 'number') { totalProcessing += row.processingSeconds; processingKnown += 1; }
    if ((row.attempts || 0) > 1) retried += 1;
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
    retryRate: rows.length ? round(retried / rows.length, 3) : 0,
    // null tant que la colonne n'est pas alimentée (segments antérieurs au déploiement)
    rtf: processingKnown > 0 && totalAudio > 0 ? round(totalProcessing / totalAudio, 2) : null,
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
    failures: { segments: toFailures(segErrors), jobs: toFailures(jobErrors) },
    stuck: { transcribing: stuckTranscribing, tail: stuckTail },
  };
}

module.exports = { getWorkerHealth, getStats };
