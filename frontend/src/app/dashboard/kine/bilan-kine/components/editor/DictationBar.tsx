'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Mic, Square, Loader2, AlertTriangle } from 'lucide-react';
import type { DictationState } from './useDictation';

interface DictationBarProps {
  state: DictationState;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onIgnore: () => void;
  /** Action posée en fin de barre (l'ouverture du panneau des mesures) */
  trailing?: React.ReactNode;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// Barre sous les notes, centrée sur leur colonne de lecture : Dicter/Arrêter, chrono, vumètre,
// état des segments, plus l'action passée en `trailing` par l'écran.
export default function DictationBar({ state, disabled, onStart, onStop, onRetry, onIgnore, trailing }: DictationBarProps) {
  const recording = state.phase === 'recording';
  const unavailable = !state.available || !state.supported;
  const tooltip = !state.supported ? 'Ton navigateur ne permet pas l’enregistrement audio'
    : !state.available ? 'Dictée indisponible pour le moment'
    : null;
  const bars = [0.15, 0.3, 0.5, 0.7, 0.9];
  const dictateButton = (
    <Button type="button" size="sm" variant={recording ? 'destructive' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={recording ? onStop : onStart} disabled={disabled || unavailable || state.starting} aria-pressed={recording} className={`h-9 rounded-full px-4 text-sm ${recording ? '' : 'btn-teal'}`}>
      {recording ? <Square className="h-4 w-4 mr-1.5" /> : <Mic className="h-4 w-4 mr-1.5" />}{recording ? `Arrêter · ${mmss(state.elapsedMs)}` : 'Dicter mes notes'}
    </Button>
  );
  return (
    <div className="mx-auto w-full max-w-[68ch] flex items-center justify-center gap-3 px-1 flex-wrap" aria-live="polite">
{/* Empêche le mousedown de déplacer le focus hors du textarea avant le clic : sinon caretPos() ne peut plus lire la sélection */}
      {tooltip === null ? dictateButton : (
        <Tooltip>
          <TooltipTrigger asChild><span>{dictateButton}</span></TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )}
      {trailing}
      {recording && (
        <div className="flex items-end gap-0.5 h-4" aria-hidden>
          {bars.map((b) => <span key={b} className={`w-1 rounded-sm transition-colors ${state.level >= b ? 'bg-[#3899aa]' : 'bg-border'}`} style={{ height: `${4 + b * 12}px` }} />)}
        </div>
      )}
      {recording && state.inFlight > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Transcription… ({state.inFlight})</span>}
      {state.phase === 'transcribing' && state.inFlight > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Transcription… {state.segmentsTotal === null ? `(${state.segmentsDone})` : `${state.segmentsDone} sur ${state.segmentsTotal}`}</span>}
      {state.phase === 'correcting' && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Correction des termes…</span>}
      {state.permissionDenied && <span className="text-[11px] text-destructive">Autorise le micro dans ton navigateur pour dicter</span>}
      {state.failed > 0 && (
        <span className="inline-flex items-center gap-2 text-[11px] text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />{state.failed > 1 ? `${state.failed} passages n’ont pas pu être transcrits` : 'Un passage n’a pas pu être transcrit'}
          <Button type="button" variant="link" size="sm" onClick={onRetry} className="h-5 px-1 text-[11px]">Réessayer</Button>
          <Button type="button" variant="link" size="sm" onClick={onIgnore} className="h-5 px-1 text-[11px] text-muted-foreground">Ignorer</Button>
        </span>
      )}
    </div>
  );
}
