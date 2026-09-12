'use client';
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, PenLine, Sparkles, Square, Upload } from 'lucide-react';
import type { BilanJobKind } from '@/types/bilan';
import type { DictationJobState, StartError } from './useDictationJob';

interface RecordingScreenProps {
  state: DictationJobState;
  kind: BilanJobKind;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onGenerate: () => void;
  onImport: (file: File) => void;
  onRetryUploads: () => void;
  onWrite: () => void;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

const START_ERRORS: Record<StartError, string> = {
  done: 'Ce bilan est déjà rédigé : ouvre-le pour le vérifier',
  busy: 'Un traitement est déjà en cours pour ce bilan',
  finalized: 'Ce bilan est enregistré, il ne peut plus être dicté',
  limit: 'Limite de la dictée atteinte : génère le bilan',
  network: 'Impossible de démarrer, vérifie ta connexion',
  consent: 'Confirme avoir informé le patient avant d’enregistrer',
};
// La borne d'une prise dépend du type de traitement (10 min en dictée, 90 min en séance)
const startErrorLabel = (error: StartError, session: boolean) =>
  session && error === 'limit' ? 'Limite de 90 minutes atteinte : génère le bilan' : START_ERRORS[error];

// Écran d'enregistrement plein cadre : bouton central, chrono, vumètre, puis Stop → « Générer le bilan ».
export default function RecordingScreen({ state, kind, consent, onConsentChange, onStart, onStop, onGenerate, onImport, onRetryUploads, onWrite }: RecordingScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recording = state.phase === 'recording';
  const stopped = state.phase === 'stopped';
  const session = kind === 'SESSION';
  // Le consentement n'est demandé qu'avant la création du traitement : après un rechargement il est déjà tracé
  const needsConsent = session && state.job === null;
  const blocked = needsConsent && !consent;
  const unavailable = !state.available || !state.supported;
  const canGenerate = stopped && state.uploading === 0 && state.uploadFailed === 0 && state.segmentsSent > 0 && !state.generating;
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); };
  const bars = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];
  const plural = state.segmentsSent > 1 ? 's' : '';
  const passages = `${state.segmentsSent} passage${plural} enregistré${plural}`;
  // Après une interruption, le chrono ne reflète plus la prise : le compteur prend sa place
  const countInstead = state.interrupted && stopped;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {needsConsent && (
        <div className="max-w-md rounded-xl border border-border/60 bg-muted/40 p-4 text-left space-y-3">
          <p className="text-sm">Tu vas enregistrer la séance. L’audio n’est jamais conservé ; le texte transcrit sert à rédiger le bilan. Informe ton patient avant de commencer.</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => onConsentChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#3899aa]" />
            <span>J’ai informé le patient que la séance est enregistrée</span>
          </label>
        </div>
      )}
      {state.interrupted && stopped && (
        <p className="text-sm text-amber-700">
          {session
            ? 'Enregistrement interrompu : tu peux enregistrer la suite ou générer le bilan avec ce qui a été enregistré.'
            : 'Enregistrement interrompu : tu peux dicter la suite ou générer le bilan avec ce qui a été dicté.'}
        </p>
      )}
      {countInstead ? (
        <div className="text-lg text-muted-foreground">{passages}</div>
      ) : (
        <div className="text-4xl font-mono tabular-nums text-foreground" aria-hidden>{mmss(recording ? state.elapsedMs : state.totalMs)}</div>
      )}
      {/* En séance, le nombre de passages envoyés rassure sur ce qui est déjà acquis */}
      {session && !countInstead && (recording || stopped) && <div className="text-xs text-muted-foreground">{passages}</div>}
      {recording ? (
        <div className="flex items-end gap-1 h-8" aria-hidden>
          {bars.map((b) => <span key={b} className={`w-1.5 rounded-sm transition-colors ${state.level >= b ? 'bg-[#3899aa]' : 'bg-border'}`} style={{ height: `${8 + b * 24}px` }} />)}
        </div>
      ) : <div className="h-8" />}
      <button
        type="button"
        onClick={recording ? onStop : () => onStart()}
        disabled={unavailable || blocked || state.starting || state.importing || state.generating}
        aria-pressed={recording}
        aria-label={session
          ? (recording ? 'Arrêter' : stopped ? 'Enregistrer la suite' : 'Enregistrer la séance')
          : (recording ? 'Arrêter' : stopped ? 'Dicter la suite' : 'Dicter')}
        className={`h-24 w-24 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-50 ${recording ? 'bg-destructive text-white' : 'bg-[#3899aa] text-white hover:bg-[#2f8191]'}`}
      >
        {state.starting ? <Loader2 className="h-9 w-9 animate-spin" /> : recording ? <Square className="h-9 w-9" /> : <Mic className="h-9 w-9" />}
      </button>
      <p className="text-sm text-muted-foreground" role="status">
        {!state.supported ? 'Ton navigateur ne permet pas l’enregistrement audio'
          : !state.available ? 'Dictée indisponible pour le moment'
          : state.permissionDenied ? 'Autorise le micro dans ton navigateur pour dicter'
          : session
            ? (recording ? 'La séance est enregistrée, appuie sur Stop à la fin'
              : stopped ? 'Enregistrer la suite, ou générer le bilan'
              : blocked ? 'Coche la case pour pouvoir enregistrer'
              : 'Appuie pour enregistrer la séance')
            : (recording ? 'Parle naturellement, appuie sur Stop quand tu as fini'
              : stopped ? 'Dicter la suite, ou générer le bilan'
              : 'Appuie pour dicter ton bilan')}
      </p>
      {state.startError && <p className="text-xs text-destructive">{startErrorLabel(state.startError, session)}</p>}
      {stopped && (
        <div className="flex flex-col items-center gap-2">
          <Button onClick={onGenerate} disabled={!canGenerate} className="btn-teal rounded-full px-6 h-11 text-base">
            {state.generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}Générer le bilan
          </Button>
          {state.uploading > 0 && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Envoi… ({state.uploading})</span>}
          {state.uploadFailed > 0 && (
            <span className="text-xs text-amber-700">
              {state.uploadFailed > 1 ? `${state.uploadFailed} passages n’ont pas pu être envoyés` : 'Un passage n’a pas pu être envoyé'}
              <Button type="button" variant="link" size="sm" onClick={onRetryUploads} className="h-5 px-1 text-xs">Réessayer l’envoi</Button>
            </span>
          )}
          {state.generateError && <span className="text-xs text-destructive">La génération n’a pas pu démarrer, réessaie dans un instant</span>}
        </div>
      )}
      <div className="flex items-center gap-2 mt-4">
        <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" onChange={handleFile} className="hidden" aria-hidden tabIndex={-1} />
        <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={unavailable || blocked || recording || state.starting || state.importing} className="h-8 rounded-full text-xs">
          {state.importing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}Importer un audio
        </Button>
        {/* Quitter pendant un envoi perdrait les passages en vol : le choix n'apparaît qu'une fois tout acquitté */}
        {!recording && state.uploading === 0 && <Button type="button" variant="ghost" size="sm" onClick={onWrite} className="h-8 rounded-full text-xs"><PenLine className="h-3.5 w-3.5 mr-1" />Écrire plutôt</Button>}
      </div>
    </div>
  );
}
