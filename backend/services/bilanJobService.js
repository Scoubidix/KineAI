// Traitement de dictée côté serveur (plan 7a) : le navigateur envoie les segments et n'attend pas.
// L'instance qui reçoit un segment le transcrit en mémoire (file locale) et n'écrit que le texte ;
// l'audio ne touche jamais le disque ni la base. La fin de transcription se décide en base
// (transition atomique), puis la queue enchaîne correction → notes → extraction + rédaction.
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const asrService = require('./asrService');
const dictationCorrectionService = require('./dictationCorrectionService');
const composeService = require('./bilanComposeService');
const { getCatalog } = require('./bilanRenderService');
const { DraftError } = require('./bilanDraftService');
const rules = require('./bilanJobRules');

const CONCURRENCY = Number(process.env.DICTATION_JOB_CONCURRENCY) || 2;
// Un QUEUED sans mise à jour depuis ce délai n'a plus d'audio nulle part (instance arrêtée) : perdu
const SEGMENT_TIMEOUT_MS = Number(process.env.JOB_SEGMENT_TIMEOUT_MS) || 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;
const RETRYABLE = new Set(['ASR_BUSY', 'ASR_UNAVAILABLE']);
// Un CORRECTING/COMPOSING sans mise à jour depuis ce délai n'a plus de processus qui le porte : perdu
const TAIL_TIMEOUT_MS = Number(process.env.JOB_TAIL_TIMEOUT_MS) || 10 * 60 * 1000;

/** File locale à concurrence bornée ; une tâche en erreur n'arrête jamais la file. */
class LocalQueue {
  constructor(max) { this.max = max; this.running = 0; this.items = []; }
  push(fn) { this.items.push(fn); this._next(); }
  _next() {
    while (this.running < this.max && this.items.length > 0) {
      const fn = this.items.shift();
      this.running += 1;
      Promise.resolve().then(fn)
        .catch((err) => logger.error('File de dictée : tâche en erreur', err))
        .finally(() => { this.running -= 1; this._next(); });
    }
  }
}

let queue = new LocalQueue(CONCURRENCY);
const __setQueueForTests = (q) => { queue = q; };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const segmentKey = (jobId, index) => ({ jobId_index: { jobId, index } });

async function loadOwnedBilan(prisma, kineId, bilanId) {
  const bilan = await prisma.bilanKine.findFirst({ where: { id: bilanId, kineId, isActive: true }, select: { id: true, status: true, document: true, rawNotes: true } });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');
  if (!bilan.document) throw new DraftError('LEGACY_BILAN', 400, 'Les anciens bilans ne peuvent pas être dictés');
  if (bilan.status === 'ENREGISTRE') throw new DraftError('ALREADY_FINALIZED', 409, 'Ce bilan est déjà enregistré');
  return bilan;
}

async function loadOwnedJob(prisma, kineId, bilanId) {
  const job = await prisma.bilanJob.findUnique({ where: { bilanId } });
  if (!job || job.kineId !== kineId) throw new DraftError('JOB_NOT_FOUND', 404, 'Aucun traitement pour ce bilan');
  return job;
}

/** Crée le traitement du bilan, le renvoie s'il enregistre encore, le remet à zéro s'il est terminé. */
async function createOrResetJob({ kineId, bilanId, kind = 'DICTATION' }) {
  if (!rules.KINDS.includes(kind)) throw new DraftError('INVALID_KIND', 400, 'Type de traitement invalide');
  const prisma = prismaService.getInstance();
  await loadOwnedBilan(prisma, kineId, bilanId);
  const existing = await prisma.bilanJob.findUnique({ where: { bilanId } });
  if (existing && rules.ACTIVE_STATUSES.includes(existing.status)) throw new DraftError('JOB_BUSY', 409, 'Un traitement est déjà en cours pour ce bilan');
  let job;
  if (!existing) {
    job = await prisma.bilanJob.create({ data: { bilanId, kineId, kind, status: 'RECORDING' } });
    logger.info(`Traitement dictée ${job.id} créé (bilan ${bilanId}, ${kind})`);
  } else if (existing.status === 'RECORDING') {
    job = existing;
  } else {
    await prisma.bilanJobSegment.deleteMany({ where: { jobId: existing.id } });
    job = await prisma.bilanJob.update({ where: { id: existing.id }, data: { status: 'RECORDING', kind, segmentsTotal: null, error: null, errorDetail: null, result: null, finishedAt: null } });
    logger.info(`Traitement dictée ${job.id} remis à zéro (bilan ${bilanId})`);
  }
  return rules.toView(job, []);
}

/** Enregistre le segment (QUEUED) et le met en file locale ; répond sans attendre la transcription. */
async function receiveSegment({ kineId, bilanId, index, buffer, mimeType }) {
  const prisma = prismaService.getInstance();
  const job = await loadOwnedJob(prisma, kineId, bilanId);
  const lateOk = job.status === 'TRANSCRIBING' && job.segmentsTotal !== null && index < job.segmentsTotal;
  if (job.status !== 'RECORDING' && !lateOk) throw new DraftError('JOB_NOT_RECORDING', 409, 'Ce traitement n’accepte plus de segments');
  await prisma.bilanJobSegment.upsert({ where: segmentKey(job.id, index), create: { jobId: job.id, index, status: 'QUEUED' }, update: { status: 'QUEUED', text: null, error: null } });
  queue.push(() => transcribeQueued({ jobId: job.id, kind: job.kind, index, buffer, mimeType }));
  return { index };
}

// Transcrit un segment reçu par cette instance ; le tampon est libéré à la sortie.
async function transcribeQueued({ jobId, kind, index, buffer, mimeType }) {
  const prisma = prismaService.getInstance();
  const prev = index > 0 ? await prisma.bilanJobSegment.findUnique({ where: segmentKey(jobId, index - 1), select: { status: true, text: true } }) : null;
  const prompt = asrService.buildPrompt(prev && prev.status === 'DONE' ? String(prev.text || '').slice(0, 600) : '');
  const priority = kind === 'SESSION' ? 'batch' : 'interactive';
  let attempt = 0;
  for (;;) {
    attempt += 1;
    // Chaque tentative rafraîchit updatedAt : le segment n'est pas « perdu », il attend
    await prisma.bilanJobSegment.update({ where: segmentKey(jobId, index), data: { attempts: { increment: 1 } } });
    try {
      const r = await asrService.transcribeSegment({ buffer, mimeType, prompt, priority });
      await prisma.bilanJobSegment.update({ where: segmentKey(jobId, index), data: { status: 'DONE', text: r.text, audioSeconds: r.audioSeconds, error: null } });
      logger.info(`Traitement dictée ${jobId} segment ${index} : ${r.audioSeconds}s audio, ${r.processingSeconds}s calcul, essai ${attempt}`);
      break;
    } catch (err) {
      const code = err instanceof DraftError ? err.code : 'INTERNAL_ERROR';
      if (code === 'AUDIO_INVALID') {   // silence ou fichier indécodable : segment vide, pas un échec
        await prisma.bilanJobSegment.update({ where: segmentKey(jobId, index), data: { status: 'DONE', text: '', audioSeconds: null, error: null } });
        break;
      }
      if (RETRYABLE.has(code) && attempt < MAX_ATTEMPTS) {
        await sleep(((err.extra && err.extra.retryAfter) || RETRY_DELAY_MS / 1000) * 1000);
        continue;
      }
      if (!(err instanceof DraftError)) logger.error(`Traitement dictée ${jobId} segment ${index} : erreur inattendue`, err);
      else logger.warn(`Traitement dictée ${jobId} segment ${index} : échec ${code} après ${attempt} essai(s)`);
      await prisma.bilanJobSegment.update({ where: segmentKey(jobId, index), data: { status: 'FAILED', error: code } });
      break;
    }
  }
  // Ne bloque pas le créneau ASR : la suite (correction, notes, rédaction) continue en tâche de fond
  detach(evaluate(jobId));
}

/** QUEUED sans mise à jour depuis SEGMENT_TIMEOUT_MS → FAILED TRANSCRIPTION_LOST. Renvoie le nombre marqué. */
async function markLostSegments(jobId) {
  const prisma = prismaService.getInstance();
  const r = await prisma.bilanJobSegment.updateMany({ where: { jobId, status: 'QUEUED', updatedAt: { lt: new Date(Date.now() - SEGMENT_TIMEOUT_MS) } }, data: { status: 'FAILED', error: 'TRANSCRIPTION_LOST' } });
  if (r.count > 0) logger.warn(`Traitement dictée ${jobId} : ${r.count} segment(s) perdu(s)`);
  return r.count;
}

/** Vue pour le front (compteurs, progression) ; détecte les segments perdus et la queue périmée au passage. */
async function getJobView({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  let job = await loadOwnedJob(prisma, kineId, bilanId);
  if (job.status === 'RECORDING' || job.status === 'TRANSCRIBING') await markLostSegments(job.id);
  if (await markStaleTail(job)) job = await prisma.bilanJob.findUnique({ where: { id: job.id } });
  const segments = await prisma.bilanJobSegment.findMany({ where: { jobId: job.id }, select: { index: true, status: true } });
  return rules.toView(job, segments);
}

// ---- Task 4 : fin de transcription et queue ----

// Tâches de fond (évaluation, queue) : la requête HTTP n'attend pas dessus, mais on garde une
// référence pour que les tests puissent les vider avant d'observer leurs effets.
const inFlight = new Set();
function detach(promise) {
  const p = promise.catch((err) => logger.error('Traitement dictée : tâche détachée en erreur', err)).finally(() => inFlight.delete(p));
  inFlight.add(p);
  return p;
}
const __drainForTests = () => Promise.all([...inFlight]);

/** Un processus arrêté en pleine queue laisserait le traitement coincé ; passé ce délai il est déclaré
 * perdu et « Réessayer » reprend à la bonne étape. */
async function markStaleTail(job) {
  if ((job.status !== 'CORRECTING' && job.status !== 'COMPOSING') || job.updatedAt >= new Date(Date.now() - TAIL_TIMEOUT_MS)) return false;
  const prisma = prismaService.getInstance();
  await prisma.bilanJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: 'FAILED', error: 'TAIL_LOST', errorDetail: null } });
  logger.warn(`Traitement dictée ${job.id} : queue périmée, déclarée perdue`);
  return true;
}

/** « Générer » : pose le total, passe en TRANSCRIBING, évalue. Total 0 → FAILED NOTES_REQUIRED. */
async function finishRecording({ kineId, bilanId, segmentsTotal }) {
  const prisma = prismaService.getInstance();
  const job = await loadOwnedJob(prisma, kineId, bilanId);
  if (job.status !== 'RECORDING') throw new DraftError('JOB_NOT_RECORDING', 409, 'Ce traitement n’est plus en enregistrement');
  if (segmentsTotal === 0) {
    const failed = await prisma.bilanJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'NOTES_REQUIRED', errorDetail: null, segmentsTotal: 0 } });
    return rules.toView(failed, []);
  }
  await prisma.bilanJob.update({ where: { id: job.id }, data: { status: 'TRANSCRIBING', segmentsTotal } });
  logger.info(`Traitement dictée ${job.id} : enregistrement terminé, ${segmentsTotal} segment(s)`);
  detach(evaluate(job.id));
  return getJobView({ kineId, bilanId });
}

const JOB_INCLUDE = { segments: true, kine: { select: { uid: true } }, bilan: { select: { rawNotes: true, status: true, document: true } } };

/** Si la transcription est complète, tente la transition atomique TRANSCRIBING → CORRECTING et lance la queue. */
async function evaluate(jobId) {
  const prisma = prismaService.getInstance();
  // Appelé après chaque segment : pas besoin des textes ni du document, juste de quoi juger la complétude
  const job = await prisma.bilanJob.findUnique({ where: { id: jobId }, select: { id: true, status: true, segmentsTotal: true, segments: { select: { index: true, status: true } } } });
  if (!job || job.status !== 'TRANSCRIBING') return;
  await markLostSegments(jobId);
  if (!rules.isTranscriptionComplete({ segmentsTotal: job.segmentsTotal, segments: job.segments })) return;
  // Plusieurs instances peuvent évaluer en même temps : une seule gagne la transition
  const r = await prisma.bilanJob.updateMany({ where: { id: jobId, status: 'TRANSCRIBING' }, data: { status: 'CORRECTING' } });
  if (r.count !== 1) return;
  await runTail(jobId, 'CORRECTING');
}

/**
 * Queue du traitement à partir de `stage` (CORRECTING ou COMPOSING). Toute erreur → FAILED avec le
 * code DraftError (INTERNAL_ERROR sinon) ; jamais de texte dans les logs.
 */
async function runTail(jobId, stage) {
  const prisma = prismaService.getInstance();
  const job = await prisma.bilanJob.findUnique({ where: { id: jobId }, include: JOB_INCLUDE });
  if (!job) return;
  try {
    if (stage === 'CORRECTING') {
      // Un bilan enregistré pendant le traitement ne doit pas être modifié
      if (job.bilan.status === 'ENREGISTRE') throw new DraftError('ALREADY_FINALIZED', 409, 'Ce bilan est déjà enregistré');
      const raw = rules.assembleSegments(job.segments);
      if (!raw) throw new DraftError('NOTES_REQUIRED', 400, 'Rien n’a été entendu');
      const catalog = await getCatalog();
      const { text, applied, ignored } = await dictationCorrectionService.correct({ text: raw, mode: job.kind === 'SESSION' ? 'session' : 'dictation', catalog });
      // Les trois écritures (notes, segments, statut) doivent réussir ou échouer ensemble
      await prisma.$transaction([
        prisma.bilanKine.update({ where: { id: job.bilanId }, data: { rawNotes: rules.appendNotes(job.bilan.rawNotes, text) } }),
        // Le texte vit désormais dans les notes : les copies par segment n'ont plus de raison d'être
        prisma.bilanJobSegment.updateMany({ where: { jobId }, data: { text: null } }),
        prisma.bilanJob.update({ where: { id: jobId }, data: { status: 'COMPOSING' } }),
      ]);
      logger.info(`Traitement dictée ${jobId} : notes écrites (${applied} correction(s), ${ignored} ignorée(s))`);
    }
    const r = await composeService.composeFromNotesForBilan({ kineId: job.kineId, bilanId: job.bilanId, uid: job.kine.uid });
    // Ce que le front recevait d'un « Rédiger avec l'IA » direct, gardé pour rouvrir le tiroir « à vérifier »
    const result = { accepted: (r.accepted || []).map((a) => ({ id: a.id, quote: a.quote })), pending: r.pending || [], rejected: r.rejected || 0, warnings: r.warnings || {} };
    await prisma.bilanJob.update({ where: { id: jobId }, data: { status: 'DONE', error: null, errorDetail: null, result, finishedAt: new Date() } });
    logger.info(`Traitement dictée ${jobId} : bilan ${job.bilanId} rédigé`);
  } catch (err) {
    const isDraft = err instanceof DraftError;
    const code = isDraft ? err.code : 'INTERNAL_ERROR';
    const detail = isDraft && err.extra && Object.keys(err.extra).length > 0 ? err.extra : null;
    if (isDraft) logger.warn(`Traitement dictée ${jobId} : queue en échec (${code})`);
    else logger.error(`Traitement dictée ${jobId} : erreur inattendue dans la queue`, err);
    await prisma.bilanJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: code, errorDetail: detail } });
  }
}

/** « Continuer sans ces passages » : FAILED → SKIPPED, index jamais reçus créés SKIPPED, puis évaluation. */
async function skipFailed({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const job = await loadOwnedJob(prisma, kineId, bilanId);
  if (job.status !== 'TRANSCRIBING') throw new DraftError('JOB_NOT_TRANSCRIBING', 409, 'Ce traitement n’est pas en transcription');
  await prisma.bilanJobSegment.updateMany({ where: { jobId: job.id, status: 'FAILED' }, data: { status: 'SKIPPED' } });
  const present = await prisma.bilanJobSegment.findMany({ where: { jobId: job.id }, select: { index: true, status: true } });
  const missing = rules.missingIndexes(job.segmentsTotal, present);
  if (missing.length > 0) await prisma.bilanJobSegment.createMany({ data: missing.map((index) => ({ jobId: job.id, index, status: 'SKIPPED' })), skipDuplicates: true });
  logger.info(`Traitement dictée ${job.id} : passages ignorés (${missing.length} jamais reçu(s))`);
  detach(evaluate(job.id));
  return getJobView({ kineId, bilanId });
}

/** « Réessayer » après un échec de la queue : reprend à l'étape échouée (textes encore là → CORRECTING, sinon COMPOSING). */
async function retryJob({ kineId, bilanId }) {
  const prisma = prismaService.getInstance();
  const job = await prisma.bilanJob.findUnique({ where: { bilanId }, include: JOB_INCLUDE });
  if (!job || job.kineId !== kineId) throw new DraftError('JOB_NOT_FOUND', 404, 'Aucun traitement pour ce bilan');
  if (job.status !== 'FAILED') throw new DraftError('JOB_NOT_FAILED', 409, 'Ce traitement n’est pas en échec');
  const stage = job.segments.some((s) => s.status === 'DONE' && s.text !== null) ? 'CORRECTING' : 'COMPOSING';
  // Concurrence : si une autre requête a déjà repris ce job, on ne relance pas une deuxième queue
  const r = await prisma.bilanJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: stage, error: null, errorDetail: null } });
  if (r.count !== 1) return getJobView({ kineId, bilanId });
  logger.info(`Traitement dictée ${job.id} : reprise en ${stage}`);
  detach(runTail(job.id, stage));
  return getJobView({ kineId, bilanId });
}

module.exports = { LocalQueue, __setQueueForTests, createOrResetJob, receiveSegment, getJobView, markLostSegments, evaluate, finishRecording, skipFailed, retryJob, runTail, __drainForTests };
