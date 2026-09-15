'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, PanelRightOpen, Sparkles, Square } from 'lucide-react';
import type { BilanJobKind } from '@/types/bilan';
import type { DictationJobState, StartError } from './useDictationJob';

interface RecordingScreenProps {
  state: DictationJobState;
  kind: BilanJobKind;
  onStart: () => void;
  onStop: () => void;
  onGenerate: () => void;
  onRetryUploads: () => void;
  /** Ouvre le panneau des mesures : le kiné peut suivre un template pendant la séance */
  onOpenMeasures: () => void;
  measuresOpen: boolean;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

const START_ERRORS: Record<StartError, string> = {
  done: 'Ce bilan est déjà rédigé : ouvre-le pour le vérifier',
  busy: 'Un traitement est déjà en cours pour ce bilan',
  finalized: 'Ce bilan est enregistré, il ne peut plus être modifié par la voix',
  limit: 'Limite d’enregistrement atteinte : génère le bilan',
  network: 'Impossible de démarrer, vérifie ta connexion',
  consent: 'Confirme avoir informé le patient avant d’enregistrer',
  mismatch: 'Un enregistrement d’un autre type est en cours pour ce bilan : recharge la page',
};

/** Halo du bouton : il respire avec le niveau du micro, de 112 à 160 px. */
const HALO_MIN = 112;
const HALO_MAX = 160;

/**
 * Écran d'enregistrement, en trois zones de hauteur fixe : titre et statut en haut, bouton et
 * chrono au centre, actions en bas. Les messages qui vont et viennent (interruption, erreur,
 * envois en cours) restent dans leur zone — sans ça, le bouton micro, seule chose qui compte,
 * remontait et descendait à chaque changement d'état.
 */
export default function RecordingScreen({ state, kind, onStart, onStop, onGenerate, onRetryUploads, onOpenMeasures, measuresOpen }: RecordingScreenProps) {
  const recording = state.phase === 'recording';
  const stopped = state.phase === 'stopped';
  const session = kind === 'SESSION';
  const unavailable = !state.available || !state.supported;
  const canGenerate = stopped && state.uploading === 0 && state.uploadFailed === 0 && state.segmentsSent > 0 && !state.generating;
  const plural = state.segmentsSent > 1 ? 's' : '';
  const passages = `${state.segmentsSent} passage${plural} enregistré${plural}`;
  // Après une interruption, le chrono ne reflète plus la prise : le compteur prend sa place
  const countInstead = state.interrupted && stopped;

  const title = recording
    ? (session ? 'Séance en cours d’enregistrement' : 'Dictée en cours')
    : stopped
    ? 'Prise terminée'
    : session ? 'Prêt à enregistrer ta séance ?' : 'Prêt à dicter ton bilan ?';

  // Une seule ligne de statut, par ordre de gravité : ce qui bloque d'abord, la consigne ensuite.
  const status = !state.supported ? { text: 'Ton navigateur ne permet pas l’enregistrement audio', tone: 'error' as const }
    : !state.available ? { text: 'Indisponible pour le moment', tone: 'error' as const }
    : state.startError ? { text: START_ERRORS[state.startError], tone: 'error' as const }
    : state.permissionDenied ? { text: 'Autorise le micro dans ton navigateur', tone: 'error' as const }
    : state.interrupted && stopped ? { text: session ? 'Enregistrement interrompu : enregistre la suite, ou génère le bilan avec ce qui est acquis.' : 'Enregistrement interrompu : dicte la suite, ou génère le bilan avec ce qui est acquis.', tone: 'warn' as const }
    : recording ? { text: session ? 'Appuie sur Stop à la fin de la séance' : 'Parle naturellement, appuie sur Stop quand tu as fini', tone: 'muted' as const }
    : stopped ? { text: session ? 'Enregistre la suite, ou génère le bilan' : 'Dicte la suite, ou génère le bilan', tone: 'muted' as const }
    : { text: '', tone: 'muted' as const };
  const statusClass = status.tone === 'error' ? 'text-destructive' : status.tone === 'warn' ? 'text-amber-700' : 'text-muted-foreground';

  const halo = HALO_MIN + (recording ? state.level : 0) * (HALO_MAX - HALO_MIN);

  return (
    <div className="flex flex-col px-4 py-6">
      <div className="h-24 shrink-0 flex flex-col items-center justify-center gap-1.5 text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p id="recording-hint" role="status" className={`text-sm max-w-md ${statusClass}`}>{status.text}</p>
      </div>

      <div className="h-72 shrink-0 flex flex-col items-center justify-center gap-4">
        {/* Le niveau vit dans le bouton : un halo qui respire, plutôt qu'un vumètre posé à côté
            qu'on ne relie pas au micro (Dictaphone iOS, WhatsApp, Otter). */}
        <div className="relative flex items-center justify-center" style={{ height: HALO_MAX, width: HALO_MAX }}>
          <span
            aria-hidden
            className={`absolute rounded-full transition-[width,height] duration-100 ease-out ${recording ? 'bg-destructive/20' : 'bg-[#3899aa]/15'}`}
            style={{ height: halo, width: halo }}
          />
          <button
            type="button"
            onClick={recording ? onStop : () => onStart()}
            disabled={unavailable || state.starting || state.importing || state.generating}
            aria-pressed={recording}
            aria-describedby="recording-hint"
            aria-label={session
              ? (recording ? 'Arrêter' : stopped ? 'Enregistrer la suite' : 'Enregistrer la séance')
              : (recording ? 'Arrêter' : stopped ? 'Dicter la suite' : 'Dicter')}
            className={`relative h-24 w-24 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-50 ${recording ? 'bg-destructive text-white' : 'bg-[#3899aa] text-white hover:bg-[#2f8191]'}`}
          >
            {state.starting ? <Loader2 className="h-9 w-9 animate-spin" /> : recording ? <Square className="h-9 w-9" /> : <Mic className="h-9 w-9" />}
          </button>
        </div>

        {/* Le chrono est la légende du bouton, pas son rival */}
        <div className="h-12 flex flex-col items-center justify-start gap-0.5">
          {countInstead ? (
            <span className="text-2xl font-mono tabular-nums text-muted-foreground">{passages}</span>
          ) : (
            <span className="text-2xl font-mono tabular-nums" aria-hidden>{mmss(recording ? state.elapsedMs : state.totalMs)}</span>
          )}
          {session && !countInstead && (recording || stopped) && <span className="text-xs text-muted-foreground">{passages}</span>}
        </div>
      </div>

      <div className="h-32 shrink-0 flex flex-col items-center justify-start gap-2">
        {stopped && (
          <>
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
          </>
        )}
        {!measuresOpen && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenMeasures} className="h-8 rounded-full text-xs border-[#3899aa]/50 text-[#3899aa] hover:bg-[#3899aa]/10 mt-auto">
            <PanelRightOpen className="h-3.5 w-3.5 mr-1" />Tests et mesures
          </Button>
        )}
      </div>
    </div>
  );
}
