'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { emptyBilanDocument, type BilanJobKind, type BilanJobView, type BilanRecord, type BilanType, type PatientSummary } from '@/types/bilan';
import { attachPatient, patchBilan } from '@/utils/bilanApi';
import BilanSettingsLine from './BilanSettingsLine';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  busy: { title: 'Enregistrement en cours', description: () => 'Termine la prise avant d’importer un fichier' },
  invalid: { title: 'Fichier audio illisible', description: () => 'Formats acceptés : wav, mp3, m4a, webm, ogg (au moins une seconde)' },
  too_long: { title: 'Fichier trop long', description: (kind) => (kind === 'SESSION' ? '30 minutes maximum à l’import' : '10 minutes maximum à l’import') },
  unavailable: { title: 'Indisponible pour le moment' },
};

// Flux « Dicter → Bilan » : enregistrement, puis attente ; l'éditeur n'apparaît qu'à la fin.
export default function DictationFlow({ bilan, kind, initialJob, onDone, onWrite }: DictationFlowProps) {
  const router = useRouter();
  // Le flux vit hors de l'autosave de l'éditeur : il tient son propre record.
  const [record, setRecord] = useState<BilanRecord>(bilan);
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
    if (busy) { toast({ title: 'Enregistrement en cours', description: 'Arrête l’enregistrement et attends la fin des envois avant de quitter' }); return; }
    router.push('/dashboard/kine/bilan-kine');
  };
  // Type et patient restent réglables pendant l'enregistrement : le flux n'a pas d'autosave,
  // les écritures partent donc directement, et le record local suit la réponse du serveur.
  const applySettings = async (run: () => Promise<BilanRecord>) => {
    try {
      setRecord(await run());
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleTypeChange = (type: BilanType) => {
    void applySettings(async () => {
      const { updatedAt } = await patchBilan(record.id, { type }, record.updatedAt);
      return { ...record, type, updatedAt };
    });
  };

  const handlePatientChange = (p: PatientSummary | null) => {
    if (!p) { toast({ title: 'Patient conservé', description: 'Pour changer de patient, choisis-en un autre dans la liste' }); return; }
    void applySettings(() => attachPatient(record.id, p.id));
  };

  const handleMotifChange = (motif: string) => {
    void applySettings(async () => {
      const { updatedAt } = await patchBilan(record.id, { motif }, record.updatedAt);
      return { ...record, motif, updatedAt };
    });
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Même rappel qu'à l'accueil et qu'en saisie écrite : les trois chemins s'ouvrent pareil */}
      <div className="px-3 sm:px-4 py-2 border-b border-border/40">
        <BilanSettingsLine
          record={record}
          onBack={handleBack}
          onTypeChange={handleTypeChange}
          onPatientChange={handlePatientChange}
          onMotifChange={handleMotifChange}
          disabled={busy}
        />
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
        <ProcessingScreen
          state={state}
          onSkipFailed={() => { void dictation.skipFailed(); }}
          onRetryJob={() => { void dictation.retryJob(); }}
          onWrite={onWrite}
          // Un nouveau consentement doit être un acte, pas un état résiduel
          onRestart={() => { setConsent(false); dictation.restart(); }}
        />
      ) : (
        <RecordingScreen state={state} kind={kind} onStart={() => { void dictation.start(); }} onStop={dictation.stop} onGenerate={() => { void dictation.generate(); }} onImport={handleImport} onRetryUploads={dictation.retryUploads} onWrite={onWrite} />
      )}

      {/* Le consentement n'est demandé qu'avant la création du traitement : après un rechargement
          il est déjà tracé côté serveur. Non refermable autrement que par un choix explicite. */}
      <Dialog open={session && state.job === null && !consent} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-[#3899aa]">Informe ton patient</DialogTitle>
            <DialogDescription>
              Tu vas enregistrer la séance. L’audio n’est jamais conservé ; seul le texte transcrit sert à rédiger le bilan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={handleBack}>Annuler</Button>
            <Button onClick={() => setConsent(true)} className="btn-teal rounded-full px-5">J’ai informé le patient</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
