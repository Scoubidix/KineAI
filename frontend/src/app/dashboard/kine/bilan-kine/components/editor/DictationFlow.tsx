'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { BilanJobKind, BilanJobView, BilanRecord } from '@/types/bilan';
import { useDictationJob, type ImportResult } from './useDictationJob';
import RecordingScreen from './RecordingScreen';
import ProcessingScreen from './ProcessingScreen';

interface DictationFlowProps {
  bilan: BilanRecord;
  kind: BilanJobKind;
  initialJob: BilanJobView | null;
  onDone: (job: BilanJobView) => void;
  onWrite: () => void;
}

// La durée maximale d'une prise dépend du type de traitement : la description est calculée au besoin
const IMPORT_MESSAGES: Record<Exclude<ImportResult, 'ok'>, { title: string; description?: (kind: BilanJobKind) => string }> = {
  busy: { title: 'Dictée en cours', description: () => 'Termine la prise avant d’importer un fichier' },
  invalid: { title: 'Fichier audio illisible', description: () => 'Formats acceptés : wav, mp3, m4a, webm, ogg (au moins une seconde)' },
  too_long: { title: 'Fichier trop long', description: (kind) => (kind === 'SESSION' ? '90 minutes maximum' : '10 minutes maximum') },
  unavailable: { title: 'Dictée indisponible pour le moment' },
};

// Flux « Dicter → Bilan » : enregistrement, puis attente ; l'éditeur n'apparaît qu'à la fin.
export default function DictationFlow({ bilan, kind, initialJob, onDone, onWrite }: DictationFlowProps) {
  const router = useRouter();
  const { toast } = useToast();
  // Consentement du patient : exigé par le serveur à la création d'un traitement de séance
  const [consent, setConsent] = useState(false);
  const session = kind === 'SESSION';
  const dictation = useDictationJob({
    bilanId: bilan.id,
    initialJob,
    enabled: bilan.status !== 'ENREGISTRE',
    kind,
    consent,
    onAutoStop: () => toast({
      title: session ? 'Enregistrement arrêté' : 'Dictée arrêtée',
      description: session ? '90 minutes par prise maximum. Tu peux enregistrer la suite.' : '10 minutes par prise maximum. Tu peux dicter la suite.',
    }),
  });
  const { state } = dictation;

  // Une seule ouverture du document : le sondage peut repasser par DONE, et `onDone` échoue parfois
  // (réseau) — l'écran « Bilan rédigé » propose alors de réessayer, sans jamais revenir au micro.
  const doneRef = useRef(false);
  useEffect(() => {
    if (state.phase !== 'done' || !state.job || doneRef.current) return;
    doneRef.current = true;
    onDone(state.job);
  }, [state.phase, state.job, onDone]);

  const handleImport = (file: File) => {
    void dictation.importFile(file).then((r) => {
      if (r === 'ok') return;
      const m = IMPORT_MESSAGES[r];
      toast({ title: m.title, description: m.description?.(kind), variant: 'destructive' });
    });
  };
  const busy = state.phase === 'recording' || state.uploading > 0;
  const handleBack = () => {
    if (busy) { toast({ title: 'Enregistrement en cours', description: 'Arrête la dictée et attends la fin des envois avant de quitter' }); return; }
    router.push('/dashboard/kine/bilan-kine');
  };
  const who = bilan.patient ? `${bilan.patient.firstName} ${bilan.patient.lastName.toUpperCase()}` : 'Sans patient';

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-2 px-3 sm:px-4 h-14 border-b border-border/40">
        <Button variant="ghost" size="sm" onClick={handleBack} className="h-8"><ArrowLeft className="h-4 w-4 mr-1" />Bilans</Button>
        <span className="text-sm font-medium truncate">{who}</span>
      </div>
      {state.phase === 'done' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-10 text-center">
          <div className="text-5xl font-semibold tabular-nums text-[#3899aa]" aria-hidden>100 %</div>
          <Progress value={100} className="w-full max-w-md h-2" />
          <p className="text-sm text-muted-foreground" role="status">Bilan rédigé</p>
          <Button variant="outline" onClick={() => { if (state.job) { doneRef.current = true; onDone(state.job); } }}>
            <RotateCcw className="h-4 w-4 mr-2" />Réessayer l’ouverture
          </Button>
        </div>
      ) : state.phase === 'processing' || state.phase === 'failed' ? (
        <ProcessingScreen state={state} onSkipFailed={() => { void dictation.skipFailed(); }} onRetryJob={() => { void dictation.retryJob(); }} onWrite={onWrite} onRestart={dictation.restart} />
      ) : (
        <RecordingScreen state={state} kind={kind} consent={consent} onConsentChange={setConsent} onStart={() => { void dictation.start(); }} onStop={dictation.stop} onGenerate={() => { void dictation.generate(); }} onImport={handleImport} onRetryUploads={dictation.retryUploads} onWrite={onWrite} />
      )}
    </div>
  );
}
