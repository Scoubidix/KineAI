'use client';
import React, { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { BilanJobView, BilanRecord } from '@/types/bilan';
import { useDictationJob, type ImportResult } from './useDictationJob';
import RecordingScreen from './RecordingScreen';
import ProcessingScreen from './ProcessingScreen';

interface DictationFlowProps {
  bilan: BilanRecord;
  initialJob: BilanJobView | null;
  onDone: (job: BilanJobView) => void;
  onWrite: () => void;
}

const IMPORT_MESSAGES: Record<Exclude<ImportResult, 'ok'>, { title: string; description?: string }> = {
  busy: { title: 'Dictée en cours', description: 'Termine la prise avant d’importer un fichier' },
  invalid: { title: 'Fichier audio illisible', description: 'Formats acceptés : wav, mp3, m4a, webm, ogg (au moins une seconde)' },
  too_long: { title: 'Fichier trop long', description: '10 minutes maximum' },
  unavailable: { title: 'Dictée indisponible pour le moment' },
};

// Flux « Dicter → Bilan » : enregistrement, puis attente ; l'éditeur n'apparaît qu'à la fin.
export default function DictationFlow({ bilan, initialJob, onDone, onWrite }: DictationFlowProps) {
  const router = useRouter();
  const { toast } = useToast();
  const dictation = useDictationJob({
    bilanId: bilan.id,
    initialJob,
    enabled: bilan.status !== 'ENREGISTRE',
    onAutoStop: () => toast({ title: 'Dictée arrêtée', description: '10 minutes par prise maximum. Tu peux dicter la suite.' }),
  });
  const { state } = dictation;

  useEffect(() => { if (state.phase === 'done' && state.job) onDone(state.job); }, [state.phase, state.job, onDone]);

  const handleImport = (file: File) => {
    void dictation.importFile(file).then((r) => { if (r !== 'ok') toast({ ...IMPORT_MESSAGES[r], variant: 'destructive' }); });
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
      {state.phase === 'processing' || state.phase === 'failed' ? (
        <ProcessingScreen state={state} onSkipFailed={() => { void dictation.skipFailed(); }} onRetryUploads={dictation.retryUploads} onRetryJob={() => { void dictation.retryJob(); }} onWrite={onWrite} onRestart={dictation.restart} />
      ) : (
        <RecordingScreen state={state} onStart={() => { void dictation.start(); }} onStop={dictation.stop} onGenerate={() => { void dictation.generate(); }} onImport={handleImport} onRetryUploads={dictation.retryUploads} onWrite={onWrite} />
      )}
    </div>
  );
}
