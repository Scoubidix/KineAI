// Règles pures du traitement de dictée côté serveur (plan 7a) : aucun effet, aucune dépendance.
// Consommées par bilanJobService (effets) et bilanDraftService (liste des brouillons).

const KINDS = ['DICTATION', 'SESSION'];
// Statuts pendant lesquels un nouveau traitement ne peut pas démarrer sur le même bilan
const ACTIVE_STATUSES = ['TRANSCRIBING', 'CORRECTING', 'COMPOSING'];
// Poids de la barre par kind : en séance, à Stop presque tout est transcrit, la queue pèse plus
const PROGRESS = {
  DICTATION: { TRANSCRIBING: 0.7, CORRECTING: 0.72, COMPOSING: 0.85 },
  SESSION: { TRANSCRIBING: 0.5, CORRECTING: 0.55, COMPOSING: 0.8 },
};
// Borne des index et du total : ~8 h de dictée par segments d'une minute, au-delà c'est une anomalie
const MAX_SEGMENTS = 500;

const cleanSegment = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** Texte de la prise : segments DONE par index, joints par un espace. */
function assembleSegments(segments) {
  return cleanSegment(segments.filter((s) => s.status === 'DONE').sort((a, b) => a.index - b.index).map((s) => s.text || '').join(' '));
}

/** Notes existantes (bords droits nettoyés) + saut de ligne + texte, ou le texte seul. */
function appendNotes(existing, text) {
  const base = String(existing || '').replace(/\s+$/, '');
  return base.trim() ? `${base}\n${text}` : text;
}

/** Index < total sans ligne de segment (segment jamais reçu). Vide si le total est inconnu. */
function missingIndexes(segmentsTotal, segments) {
  if (segmentsTotal === null || segmentsTotal === undefined) return [];
  const present = new Set(segments.map((s) => s.index));
  const missing = [];
  for (let i = 0; i < segmentsTotal; i += 1) if (!present.has(i)) missing.push(i);
  return missing;
}

/** Total connu, aucun QUEUED ni FAILED, chaque index présent en DONE ou SKIPPED. */
function isTranscriptionComplete({ segmentsTotal, segments }) {
  if (segmentsTotal === null || segmentsTotal === undefined) return false;
  if (segments.some((s) => s.status === 'QUEUED' || s.status === 'FAILED')) return false;
  return missingIndexes(segmentsTotal, segments).length === 0;
}

/** 0..1, ou null quand la barre n'a pas de sens (enregistrement, échec). */
function computeProgress(status, done, total, kind = 'DICTATION') {
  const weights = PROGRESS[kind] || PROGRESS.DICTATION;
  if (status === 'TRANSCRIBING') return total ? weights.TRANSCRIBING * Math.min(done / total, 1) : 0;
  if (status === 'CORRECTING' || status === 'COMPOSING') return weights[status] ?? null;
  if (status === 'DONE') return 1;
  return null;
}

/** Vue renvoyée au front : compteurs et progression, sans texte. */
function toView(job, segments) {
  const count = (st) => segments.filter((s) => s.status === st).length;
  const done = count('DONE') + count('SKIPPED');
  const missing = job.status === 'RECORDING' ? 0 : missingIndexes(job.segmentsTotal, segments).length;
  return {
    id: job.id,
    bilanId: job.bilanId,
    kind: job.kind,
    status: job.status,
    segmentsTotal: job.segmentsTotal,
    segmentsDone: done,
    segmentsFailed: count('FAILED') + missing,
    segmentsQueued: count('QUEUED'),
    // Prochain index libre : permet de « Dicter la suite » après un rechargement sans écraser un segment
    nextIndex: segments.length ? Math.max(...segments.map((s) => s.index)) + 1 : 0,
    progress: computeProgress(job.status, done, job.segmentsTotal, job.kind),
    error: job.error,
    errorDetail: job.errorDetail,
    result: job.status === 'DONE' ? (job.result ?? null) : null,
    consentAt: job.consentAt instanceof Date ? job.consentAt.toISOString() : (job.consentAt ?? null),
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
    finishedAt: job.finishedAt instanceof Date ? job.finishedAt.toISOString() : job.finishedAt,
  };
}

module.exports = { KINDS, ACTIVE_STATUSES, PROGRESS, MAX_SEGMENTS, cleanSegment, assembleSegments, appendNotes, missingIndexes, isTranscriptionComplete, computeProgress, toView };
