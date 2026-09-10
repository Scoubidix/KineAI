'use client';
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Mic, Square, Loader2, AlertTriangle, Upload } from 'lucide-react';
import type { DictationState } from './useDictation';

interface DictationBarProps {
  state: DictationState;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  /** Fichier audio (mémo vocal, enregistrement) à transcrire par la même chaîne que le micro */
  onImport: (file: File) => void;
  onRetry: () => void;
  onIgnore: () => void;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// Barre de dictée sous les notes : un bouton Dicter/Arrêter, chrono, vumètre, état des segments.
export default function DictationBar({ state, disabled, onStart, onStop, onImport, onRetry, onIgnore }: DictationBarProps) {
  const recording = state.phase === 'recording';
  const unavailable = !state.available || !state.supported;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // permet de réimporter le même fichier
    if (file) onImport(file);
  };
  const tooltip = !state.supported ? 'Ton navigateur ne permet pas l’enregistrement audio'
    : !state.available ? 'Dictée indisponible pour le moment'
    : recording ? 'Arrêter la dictée' : 'Dicter tes notes : le texte s’ajoute au fil de la dictée';
  const bars = [0.15, 0.3, 0.5, 0.7, 0.9];
  return (
    <div className="flex items-center gap-3 px-1 flex-wrap" aria-live="polite">
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            {/* Empêche le mousedown de déplacer le focus hors du textarea avant le clic : sinon caretPos() ne peut plus lire la sélection */}
            <Button type="button" size="sm" variant={recording ? 'destructive' : 'outline'} onMouseDown={(e) => e.preventDefault()} onClick={recording ? onStop : onStart} disabled={disabled || unavailable || state.starting} aria-pressed={recording} className="h-8 rounded-full text-xs">
              {recording ? <Square className="h-3.5 w-3.5 mr-1" /> : <Mic className="h-3.5 w-3.5 mr-1" />}{recording ? `Arrêter · ${mmss(state.elapsedMs)}` : 'Dicter'}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      {/* Import d'un fichier audio : mémo vocal du téléphone, ou enregistrement de test sans micro */}
      <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" onChange={handleFile} className="hidden" aria-hidden tabIndex={-1} />
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={disabled || !state.available || state.phase !== 'idle' || state.starting || state.importing} className="h-8 rounded-full text-xs">
              {state.importing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}Importer un audio
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{state.available ? 'Transcrit un fichier audio (mémo vocal, enregistrement) comme une dictée, 10 minutes max' : 'Dictée indisponible pour le moment'}</TooltipContent>
      </Tooltip>
      {recording && (
        <div className="flex items-end gap-0.5 h-4" aria-hidden>
          {bars.map((b) => <span key={b} className={`w-1 rounded-sm transition-colors ${state.level >= b ? 'bg-[#3899aa]' : 'bg-border'}`} style={{ height: `${4 + b * 12}px` }} />)}
        </div>
      )}
      {recording && state.inFlight > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Transcription… ({state.inFlight})</span>}
      {state.phase === 'transcribing' && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Transcription… {state.segmentsTotal === null ? `(${state.segmentsDone})` : `${state.segmentsDone} sur ${state.segmentsTotal}`}</span>}
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
