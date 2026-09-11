// Barre de progression du traitement (spec §5.2) : la transcription est mesurée, le reste estimé dans le temps.
import type { BilanJobStatus, BilanJobView } from '@/types/bilan';

export const STAGE_BOUNDS: Record<'TRANSCRIBING' | 'CORRECTING' | 'COMPOSING', [number, number]> = {
  TRANSCRIBING: [0, 0.7],
  CORRECTING: [0.7, 0.75],
  COMPOSING: [0.75, 1],
};
// Durées attendues des étapes non mesurables (à ajuster après mesure en usage)
export const EXPECTED_MS = { CORRECTING: 6_000, COMPOSING: 40_000 };

export const isProcessing = (status: BilanJobStatus | undefined | null): boolean =>
  status === 'TRANSCRIBING' || status === 'CORRECTING' || status === 'COMPOSING';

/**
 * Valeur affichée (0..1). Transcription : part des segments faits. Correction et rédaction : avance
 * dans le temps vers la borne haute sans l'atteindre. Jamais inférieure à la valeur précédente.
 */
export function displayProgress(job: BilanJobView | null, stageStartedAt: number, now: number, prev: number): number {
  if (!job) return prev;
  if (job.status === 'DONE') return 1;
  let p = prev;
  if (job.status === 'TRANSCRIBING') {
    p = job.segmentsTotal ? STAGE_BOUNDS.TRANSCRIBING[1] * Math.min(job.segmentsDone / job.segmentsTotal, 1) : 0;
  } else if (job.status === 'CORRECTING' || job.status === 'COMPOSING') {
    const [lo, hi] = STAGE_BOUNDS[job.status];
    const ratio = Math.min(Math.max(now - stageStartedAt, 0) / EXPECTED_MS[job.status], 1);
    p = Math.min(lo + (hi - lo) * ratio, hi - 0.01);
  }
  return Math.max(prev, p);
}

export function stageLabel(job: BilanJobView | null): string {
  if (!job) return '';
  switch (job.status) {
    case 'TRANSCRIBING': return job.segmentsTotal ? `Transcription… ${Math.min(job.segmentsDone, job.segmentsTotal)} sur ${job.segmentsTotal}` : 'Transcription…';
    case 'CORRECTING': return 'Correction des termes…';
    case 'COMPOSING': return 'Rédaction du bilan…';
    case 'DONE': return 'Bilan rédigé';
    case 'FAILED': return 'La rédaction n\'a pas abouti';
    default: return '';
  }
}
