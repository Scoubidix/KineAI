'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { emptyBilanDocument, type BilanJobKind, type BilanJobView, type BilanRecord, type DocumentMeasurement, type PatientSummary } from '@/types/bilan';
import { attachPatient } from '@/utils/bilanApi';
import { useBilanAutosave } from '@/hooks/useBilanAutosave';
import BilanEditorAlerts from './BilanEditorAlerts';
import BilanSettingsLine from './BilanSettingsLine';
import MeasuresPane, { useDensePane } from './MeasuresPane';
import MeasurementsPanel from '../MeasurementsPanel';
import { useMinWidth } from './useMinWidth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDictationJob } from './useDictationJob';
import RecordingScreen from './RecordingScreen';
import ProcessingScreen from './ProcessingScreen';

interface DictationFlowProps {
  bilan: BilanRecord;
  kind: BilanJobKind;
  initialJob: BilanJobView | null;
  onDone: (job: BilanJobView) => void;
  onWrite: () => void;
}

// Flux « Dicter → Bilan » : enregistrement, puis attente ; l'éditeur n'apparaît qu'à la fin.
export default function DictationFlow({ bilan, kind, initialJob, onDone, onWrite }: DictationFlowProps) {
  const router = useRouter();
  // Même autosave que l'éditeur : un seul chemin d'écriture, débounce et contrôle de version
  // compris. Sans lui, une mesure saisie caractère par caractère partirait en une requête par
  // frappe, et les écritures concurrentes se refuseraient l'une l'autre.
  const { record, update, saveState, errorMessage, reload, replaceRecord } = useBilanAutosave(bilan);
  const { toast } = useToast();
  const wide = useMinWidth(1024);
  const dense = useDensePane(wide);
  const [measuresOpen, setMeasuresOpen] = useState(false);
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

  const busy = state.phase === 'recording' || state.uploading > 0;
  const handleBack = () => {
    if (busy) { toast({ title: 'Enregistrement en cours', description: 'Arrête l’enregistrement et attends la fin des envois avant de quitter' }); return; }
    router.push('/dashboard/kine/bilan-kine');
  };
  const doc = record.document ?? emptyBilanDocument();

  const handlePatientChange = async (p: PatientSummary | null) => {
    if (!p) { toast({ title: 'Patient conservé', description: 'Pour changer de patient, choisis-en un autre dans la liste' }); return; }
    try {
      replaceRecord(await attachPatient(record.id, p.id));
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  };

  // Le serveur écrit le bilan en fin de traitement (notes, document) : toute saisie pendant
  // cette fenêtre serait écrasée par son retour, donc le panneau s'y verrouille.
  const measuresLocked = saveState === 'stale' || state.phase === 'processing' || state.generating;

  return (
    <div className="flex flex-col min-h-full">
      {/* Même rappel qu'à l'accueil et qu'en saisie écrite : les trois chemins s'ouvrent pareil */}
      <div className="px-3 sm:px-4 py-2 border-b border-border/40">
        <BilanSettingsLine
          record={record}
          onBack={handleBack}
          onTypeChange={(type) => update({ type })}
          onPatientChange={handlePatientChange}
          onMotifChange={(motif) => update({ motif })}
          disabled={busy}
        />
      </div>
      <BilanEditorAlerts saveState={saveState} errorMessage={errorMessage} onReload={() => { void reload(); }} onRetry={() => {}} />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col pb-12 lg:pb-0">
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
        <RecordingScreen state={state} kind={kind} onStart={() => { void dictation.start(); }} onStop={dictation.stop} onGenerate={() => { void dictation.generate(); }} onRetryUploads={dictation.retryUploads} onOpenMeasures={() => setMeasuresOpen(true)} measuresOpen={measuresOpen} />
      )}
        </div>

        {/* Le panneau seul : pendant une séance on coche des valeurs et on suit un template,
            on n'analyse pas des notes — pas d'extraction ni de suggestions ici. */}
        <MeasuresPane summary="Tests et mesures" open={measuresOpen} onOpenChange={setMeasuresOpen} wide={wide}>
          <div className="p-3">
            <MeasurementsPanel
              measurements={doc.measurements}
              onChange={(measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } })}
              disabled={measuresLocked}
              dense={dense}
            />
          </div>
        </MeasuresPane>
      </div>

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
