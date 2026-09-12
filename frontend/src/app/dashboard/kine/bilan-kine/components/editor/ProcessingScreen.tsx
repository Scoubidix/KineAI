'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Loader2, Mic, PenLine, RotateCcw } from 'lucide-react';
import type { DictationJobState } from './useDictationJob';
import { stageLabel } from './dictationJobProgress';

interface ProcessingScreenProps {
  state: DictationJobState;
  onSkipFailed: () => void;
  onRetryJob: () => void;
  onWrite: () => void;     // « Rédiger moi-même » : ouvre l'étape Notes (transcription déjà dans les notes)
  onRestart: () => void;   // « Dicter à nouveau » après « Rien n'a été entendu »
}

// Écran d'attente : une barre continue et le nom de l'étape ; les échecs suivent l'option A de la spec.
export default function ProcessingScreen({ state, onSkipFailed, onRetryJob, onWrite, onRestart }: ProcessingScreenProps) {
  const job = state.job;
  const failed = state.phase === 'failed';
  const lostSegments = job?.status === 'TRANSCRIBING' && job.segmentsFailed > 0 && job.segmentsQueued === 0;
  const nothingHeard = failed && job?.error === 'NOTES_REQUIRED';
  const measurementsSaved = failed && job?.error === 'COMPOSE_FAILED' && job.errorDetail?.measurementsSaved === true;
  const percent = Math.round(state.progress * 100);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {!failed && (
        <>
          <div className="text-5xl font-semibold tabular-nums text-[#3899aa]" aria-hidden>{percent} %</div>
          <Progress value={percent} className="w-full max-w-md h-2" />
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />{stageLabel(job)}</p>
          <p className="text-xs text-muted-foreground max-w-md">Tu peux quitter cette page : le bilan continue de se rédiger et t’attendra dans tes brouillons.</p>
        </>
      )}
      {lostSegments && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 max-w-md space-y-2">
          <p className="text-sm text-amber-800 inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />
            {job!.segmentsFailed > 1 ? `${job!.segmentsFailed} passages n’ont pas pu être transcrits` : 'Un passage n’a pas pu être transcrit'}
          </p>
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="ghost" onClick={onSkipFailed}>Continuer sans {job!.segmentsFailed > 1 ? 'ces passages' : 'ce passage'}</Button>
          </div>
        </div>
      )}
      {failed && (
        <div className="max-w-md space-y-4">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-600" />
          <p className="text-base font-medium">{nothingHeard ? 'Rien n’a été entendu' : 'La rédaction n’a pas abouti'}</p>
          {measurementsSaved && <p className="text-sm text-muted-foreground">Tes mesures ont été conservées.</p>}
          {nothingHeard ? (
            <Button onClick={onRestart} className="btn-teal rounded-full px-6 h-10"><Mic className="h-4 w-4 mr-2" />Recommencer</Button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Button onClick={onRetryJob} className="btn-teal rounded-full px-6 h-10"><RotateCcw className="h-4 w-4 mr-2" />Réessayer</Button>
              <Button variant="ghost" size="sm" onClick={onWrite}><PenLine className="h-3.5 w-3.5 mr-1" />Rédiger moi-même</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
