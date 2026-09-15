'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useBilanAutosave } from '@/hooks/useBilanAutosave';
import { getBilan, getJob, abandonJob, attachPatient, composeBilan, composeBilanFromNotes, ApiError, StaleDraftError } from '@/utils/bilanApi';
import { emptyBilanDocument, type AiBusy, type BilanJobKind, type BilanJobResult, type BilanJobView, type BilanRecord, type BilanSectionKey, type ExtractionCandidate, type PatientSummary, type BilanType, type SectionWarnings } from '@/types/bilan';
import BilanEditorAlerts from '../components/editor/BilanEditorAlerts';
import BilanSettingsLine from '../components/editor/BilanSettingsLine';
import CaptureStep from '../components/editor/CaptureStep';
import DictationFlow from '../components/editor/DictationFlow';
import DocumentStep from '../components/editor/DocumentStep';
import MeasuresDrawer, { DRAWER_SUGGESTIONS_ID } from '../components/editor/MeasuresDrawer';
import { useDictation } from '../components/editor/useDictation';
import { useMinWidth } from '../components/editor/useMinWidth';
import { BILANS_REALISES_HREF } from '../components/bilansRealises';

export type EditorStep = 'capture' | 'document';
const isStep = (s: string | null): s is EditorStep => s === 'capture' || s === 'document';

/** État IA repris du traitement serveur (dictée) pour rouvrir l'éditeur comme après « Rédiger avec l'IA » */
export interface InitialAi {
  candidates: ExtractionCandidate[];
  rejected: number;
  quotes: Map<string, string>;
  lastRun: { extracted: number; pending: number } | null;
  warnings: SectionWarnings;
}

const toInitialAi = (r: BilanJobResult): InitialAi => ({
  candidates: r.pending,
  rejected: r.rejected,
  quotes: new Map(r.accepted.map((a) => [a.id, a.quote])),
  lastRun: { extracted: r.accepted.length + r.pending.length, pending: r.pending.length },
  warnings: r.warnings,
});

// Éditeur de bilan V1 : un état (useBilanAutosave), deux étapes, tiroir Mesures
function BilanEditor({ initial, initialStep, initialAi, forceDrawerOpen }: { initial: BilanRecord; initialStep: EditorStep; initialAi?: InitialAi; forceDrawerOpen?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { record, update, flush, saveState, savedAt, pending, errorMessage, reload, replaceRecord } = useBilanAutosave(initial);
  const [step, setStep] = useState<EditorStep>(initialStep);
  const locked = saveState === 'stale';

  // État IA, non persisté (spec §9.2) : candidats d'extraction, appel en cours, avertissements de rédaction
  const [candidates, setCandidates] = useState<ExtractionCandidate[] | null>(initialAi?.candidates ?? null);
  const [rejectedCount, setRejectedCount] = useState(initialAi?.rejected ?? 0);
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [warnings, setWarnings] = useState<SectionWarnings>(initialAi?.warnings ?? {});
  // Garde de réentrance : `aiBusy` n'est posé qu'après le flush, une fenêtre où un double clic
  // lancerait deux appels IA (closure périmée). Le ref, lui, est synchrone.
  const aiLockRef = useRef(false);
  const FLUSH_PENDING = { title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' };

  const wide = useMinWidth(1024);
  // Tiroir Mesures : état mémorisé par navigateur ; sans valeur, ouvert sur grand écran (≥ 1280)
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    // Sortie de dictée avec des suggestions à vérifier : le tiroir s'ouvre quoi qu'en dise le stockage
    if (forceDrawerOpen) { setDrawerOpen(true); return; }
    try {
      const v = localStorage.getItem('bilan.drawer.open');
      setDrawerOpen(v === null ? window.matchMedia('(min-width: 1280px)').matches : v === '1');
    } catch { /* stockage indisponible : replié */ }
  }, [forceDrawerOpen]);
  // Ouvre le tiroir sans toucher à la préférence mémorisée : le kiné qui le referme toujours
  // le retrouvera replié au bilan suivant. Une génération doit juste le lui remettre sous les yeux.
  const revealDrawer = () => setDrawerOpen(true);
  const setDrawer = (open: boolean) => {
    setDrawerOpen(open);
    try { localStorage.setItem('bilan.drawer.open', open ? '1' : '0'); } catch { /* ignoré */ }
  };

  // Dictée : le hook vit dans le shell pour que les segments en vol survivent au changement d'étape
  const dictation = useDictation({
    bilanId: record.id,
    notes: record.rawNotes ?? '',
    setNotes: (n) => update({ rawNotes: n }),
    enabled: !locked && aiBusy === null && record.status !== 'ENREGISTRE',
    onAutoStop: () => toast({ title: 'Dictée arrêtée', description: '10 minutes par prise maximum. Relance une prise pour continuer.' }),
  });

  const openSuggestions = () => {
    setDrawer(true);
    // Double rAF : le nœud du tiroir n'existe qu'après le commit React de l'ouverture (commit après l'état, puis défilement)
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(DRAWER_SUGGESTIONS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  };

  // Citations des mesures acceptées automatiquement à la dernière rédaction (session)
  const [quotes, setQuotes] = useState<Map<string, string>>(initialAi?.quotes ?? new Map());
  // Bandeau de la page Document : résultat de la dernière rédaction (session)
  const [lastRun, setLastRun] = useState<{ extracted: number; pending: number } | null>(initialAi?.lastRun ?? null);
  // Empreinte des mesures à la dernière rédaction : si elles changent, Examen et Diagnostic sont signalées
  // (rédaction faite côté serveur : l'empreinte de départ est celle du bilan relu)
  const composedMeasurementsRef = useRef<string | null>(initialAi ? JSON.stringify(initial.document?.measurements ?? []) : null);
  const fingerprint = (r: BilanRecord) => JSON.stringify(r.document?.measurements ?? []);
  useEffect(() => {
    const ref = composedMeasurementsRef.current;
    if (ref === null) return;
    const current = fingerprint(record);
    if (current === ref) return;
    composedMeasurementsRef.current = current; // un seul signalement par modification
    const sections = record.document?.sections ?? [];
    setWarnings((prev) => {
      const next: SectionWarnings = { ...prev };
      for (const k of ['examen', 'diagnostic'] as const) {
        const text = sections.find((s) => s.key === k)?.text ?? '';
        if (text.trim() !== '' && !next[k]) next[k] = 'measures_changed';
      }
      return next;
    });
  }, [record]);

  const handleComposeFromNotes = async () => {
    if (aiLockRef.current) return;
    aiLockRef.current = true;
    if (!(await flush())) { toast(FLUSH_PENDING); aiLockRef.current = false; return; }
    setAiBusy('compose_from_notes');
    try {
      const r = await composeBilanFromNotes(record.id);
      replaceRecord(r.bilan);
      setWarnings(r.warnings);
      setCandidates(r.pending);
      setRejectedCount(r.rejected);
      setQuotes(new Map(r.accepted.map((a) => [a.id, a.quote])));
      setLastRun({ extracted: r.accepted.length + r.pending.length, pending: r.pending.length });
      composedMeasurementsRef.current = fingerprint(r.bilan);
      revealDrawer();
      await goTo('document');
    } catch (e) {
      // Rédaction en échec après l'écriture des mesures : rien n'est perdu, on montre le tableau
      if (e instanceof ApiError && e.code === 'COMPOSE_FAILED' && e.body.measurementsSaved === true) {
        toast({ title: 'Mesures ajoutées, rédaction impossible', description: 'Tes mesures sont dans le tableau. Relance « Rédiger avec l’IA » dans un instant.', variant: 'destructive' });
        // Le bandeau et les suggestions de la précédente tentative ne décrivent plus ce bilan
        setLastRun(null);
        setCandidates(null);
        try { await reload(); } catch (err) { handleAiError(err, 'Rechargement impossible'); return; }
        await goTo('document');
        return;
      }
      if (e instanceof ApiError && e.code === 'EXTRACTION_FAILED') { handleAiError(e, 'Analyse impossible'); return; }
      handleAiError(e, 'Rédaction impossible');
    } finally { setAiBusy(null); aiLockRef.current = false; }
  };

  const handleAiError = (e: unknown, title: string) => {
    if (e instanceof StaleDraftError) { toast({ title: 'Bilan modifié ailleurs', description: 'Rechargement de la dernière version…' }); void reload(); return; }
    if (e instanceof ApiError && e.status === 429) { toast({ title: 'Trop de demandes', description: 'Patiente une minute avant de relancer l’IA', variant: 'destructive' }); return; }
    if (e instanceof ApiError && e.code === 'PLAN_REQUIRED') { toast({ title: 'Plan requis', description: 'L’IA du bilan est disponible dès le plan Pratique', variant: 'destructive' }); return; }
    toast({ title, description: (e as Error).message, variant: 'destructive' });
  };

  // Extraction : flush d'abord (le serveur lit les notes en base), puis ouverture du tiroir Mesures
  // Rédaction : flush, appel, puis l'état local est remplacé par le bilan renvoyé (sections écrites, statut GENERE)
  const handleCompose = async (sections?: BilanSectionKey[]): Promise<boolean> => {
    if (aiLockRef.current) return false;
    aiLockRef.current = true;
    if (!(await flush())) { toast(FLUSH_PENDING); aiLockRef.current = false; return false; }
    setAiBusy(sections && sections.length === 1 ? sections[0] : 'compose');
    try {
      const r = await composeBilan(record.id, sections);
      replaceRecord(r.bilan);
      composedMeasurementsRef.current = fingerprint(r.bilan);
      revealDrawer();
      setWarnings((prev) => {
        if (!sections) return r.warnings;
        const next: SectionWarnings = { ...prev };
        for (const k of sections) delete next[k];
        return { ...next, ...r.warnings };
      });
      return true;
    } catch (e) { handleAiError(e, 'Rédaction impossible'); return false; }
    finally { setAiBusy(null); aiLockRef.current = false; }
  };

  const clearWarning = (key: BilanSectionKey) => setWarnings((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });

  const goTo = useCallback(async (s: EditorStep) => {
    if (dictation.state.phase === 'recording') { dictation.stop(); toast({ title: 'Dictée arrêtée' }); }
    await flush();
    setStep(s);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('step', s);
      window.history.replaceState(null, '', url.toString());
    }
  }, [flush, dictation.state.phase, dictation.stop, toast]);

  const handlePatientChange = async (p: PatientSummary | null) => {
    if (!p) { toast({ title: 'Patient conservé', description: 'Pour changer de patient, choisis-en un autre dans la liste' }); return; }
    try {
      const ok = await flush();
      if (!ok) { toast({ title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' }); return; }
      const updated = await attachPatient(record.id, p.id);
      replaceRecord(updated);
      toast({ title: 'Patient associé', description: `${p.firstName} ${p.lastName.toUpperCase()}` });
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  };

  // Prise en cours ou segments pas encore revenus : quitter maintenant les perdrait
  const dictating = dictation.state.phase !== 'idle';

  const handleBack = async () => {
    if (dictating) { toast({ title: 'Transcription en cours', description: 'Attends la fin de la dictée avant de quitter' }); return; }
    const ok = await flush();
    if (!ok) { toast({ title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' }); return; }
    router.push('/dashboard/kine/bilan-kine');
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-full">
        <BilanEditorAlerts
          saveState={saveState}
          errorMessage={errorMessage}
          onReload={() => { void reload(); }}
          onRetry={() => { void flush(); }}
        />
        {/* Type et patient se règlent ici, en phrase, comme à l'accueil du module — et restent
            visibles aux deux étapes. Pas de stepper : les boutons de bas de page font la navigation. */}
        <div className="px-3 sm:px-4 py-2 border-b border-border/40">
          <BilanSettingsLine
            record={record}
            onBack={() => { void handleBack(); }}
            onTypeChange={(t: BilanType) => update({ type: t })}
            onPatientChange={handlePatientChange}
            onMotifChange={(motif) => update({ motif })}
            disabled={locked || aiBusy !== null || dictating}
          />
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 pb-12 lg:pb-0">
            {step === 'capture' && <CaptureStep record={record} update={update} flush={flush} replaceRecord={replaceRecord} disabled={locked || aiBusy !== null} onNext={() => goTo('document')} onCompose={() => { void handleComposeFromNotes(); }} composing={aiBusy === 'compose_from_notes'} dictation={dictation} onOpenMeasures={revealDrawer} measuresOpen={drawerOpen} />}
            {step === 'document' && <DocumentStep record={record} update={update} flush={flush} replaceRecord={replaceRecord} disabled={locked || aiBusy !== null} onBack={() => goTo('capture')} onCompose={handleCompose} aiBusy={aiBusy} warnings={warnings} onSectionEdited={clearWarning} lastRun={lastRun} onVerify={openSuggestions} onDismissRun={() => setLastRun(null)} wide={wide} onOpenMeasures={revealDrawer} measuresOpen={drawerOpen} />}
          </div>
          <MeasuresDrawer record={record} update={update} disabled={locked || aiBusy !== null} candidates={candidates} rejectedCount={rejectedCount} onCandidatesChange={setCandidates} aiBusy={aiBusy} open={drawerOpen} onOpenChange={setDrawer} wide={wide} quotes={quotes} />
        </div>
      </div>
    </TooltipProvider>
  );
}

export default function BilanEditorPage() {
  const params = useParams<{ bilanId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; bilan: BilanRecord } | { status: 'error'; message: string }>({ status: 'loading' });

  const bilanId = Number(params.bilanId);
  const stepParam = searchParams.get('step');
  const initialStep: EditorStep = stepParam === 'verification' ? 'document' : isStep(stepParam) ? stepParam : 'capture';
  const modeParam = searchParams.get('mode');
  // Traitement serveur (dictée) : sert d'aiguillage à l'ouverture, puis d'état IA initial une fois terminé
  const [job, setJob] = useState<BilanJobView | null>(null);
  // Dictée et séance partagent le même flux d'écrans : seul le genre du traitement change
  const [flow, setFlow] = useState<'auto' | 'dictation' | 'editor'>(modeParam === 'dictation' || modeParam === 'session' ? 'dictation' : 'auto');

  useEffect(() => {
    if (!Number.isInteger(bilanId) || bilanId <= 0) { setState({ status: 'error', message: 'Identifiant de bilan invalide' }); return; }
    let cancelled = false;
    Promise.all([
      getBilan(bilanId),
      // 404 = aucun traitement ; toute autre panne dégrade sans bloquer la page (l'éditeur s'ouvre)
      getJob(bilanId).catch(() => null),
    ])
      .then(([bilan, j]) => {
        if (cancelled) return;
        if (!bilan.document) {
          toast({ title: 'Bilan en lecture seule', description: 'Les anciens bilans se consultent depuis la fiche patient.' });
          router.replace('/dashboard/kine/bilan-kine');
          return;
        }
        // Un bilan enregistré ne se corrige pas ici : l'éditeur porte la dictée et la rédaction
        // complète, qui écraseraient un document déjà remis au patient. Sa page de consultation
        // est la surface de correction, et elle sait tout faire (texte, mesures, reprise IA
        // d'une section). Seul un lien périmé mène encore ici.
        if (bilan.status === 'ENREGISTRE' && bilan.patientId) {
          router.replace(`${BILANS_REALISES_HREF}/${bilan.patientId}/${bilan.id}`);
          return;
        }
        setJob(j);
        setState({ status: 'ready', bilan });
      })
      .catch((e) => { if (!cancelled) setState({ status: 'error', message: e instanceof ApiError && e.status === 404 ? 'Ce bilan n’existe pas ou ne t’appartient pas' : (e as Error).message }); });
    return () => { cancelled = true; };
  }, [bilanId, router, toast]);

  // Fin du flux : le serveur a écrit les notes et le document, on relit le bilan et on ouvre le document
  const handleDone = useCallback(async (j: BilanJobView) => {
    try {
      const fresh = await getBilan(bilanId);
      setState({ status: 'ready', bilan: fresh });
      setJob(j);
      setFlow('editor');
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.set('step', 'verification');
      window.history.replaceState(null, '', url.toString());
    } catch (e) {
      toast({ title: 'Rechargement impossible', description: (e as Error).message, variant: 'destructive' });
    }
  }, [bilanId, toast]);

  // « Écrire plutôt » / « Rédiger moi-même » : le traitement est abandonné (la dictée brute rejoint
  // les notes côté serveur), puis on relit le bilan avant d'ouvrir l'éditeur. Sans cet abandon, le
  // flux se rouvrirait à chaque retour sur le bilan.
  const handleWrite = useCallback(async () => {
    try {
      await abandonJob(bilanId).catch((e) => { if (!(e instanceof ApiError && e.status === 404)) throw e; });
    } catch {
      toast({ title: 'Impossible de quitter le flux pour l’instant', description: 'Réessaie dans un instant', variant: 'destructive' });
      return;
    }
    try {
      const fresh = await getBilan(bilanId);
      setState({ status: 'ready', bilan: fresh });
      setJob(null);
      setFlow('editor');
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.set('step', 'capture');
      window.history.replaceState(null, '', url.toString());
    } catch (e) {
      toast({ title: 'Rechargement impossible', description: (e as Error).message, variant: 'destructive' });
    }
  }, [bilanId, toast]);

  if (state.status === 'loading') return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#3899aa]" /></div>;
  if (state.status === 'error') {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/kine/bilan-kine')}>Retour aux bilans</Button>
      </div>
    );
  }
  // Un traitement non terminé (ou le mode « Dicter »/« Enregistrer la séance » demandé depuis l'accueil) prend toute la page
  const jobActive = job !== null && job.status !== 'DONE';
  const showFlow = flow === 'dictation' || (flow === 'auto' && jobActive);
  if (showFlow) {
    // Un traitement déjà ouvert impose son genre : un rechargement avec une autre URL ne le change pas
    const flowKind: BilanJobKind = job?.kind ?? (modeParam === 'session' ? 'SESSION' : 'DICTATION');
    // Rappels stables (useCallback) : l'effet de fin de flux de DictationFlow ne doit se déclencher qu'une fois
    return <DictationFlow key={`flow-${state.bilan.id}`} bilan={state.bilan} kind={flowKind} initialJob={job} onDone={handleDone} onWrite={handleWrite} />;
  }
  const initialAi = job?.status === 'DONE' && job.result ? toInitialAi(job.result) : undefined;
  // Bilan déjà rédigé : on ouvre sur le document, pas sur les notes — soit parce que le traitement
  // de dictée vient d'aboutir (initialAi), soit parce que le document a déjà été composé (statut
  // GENERE, posé à la première composition). Le statut n'est consulté qu'à l'ouverture (flow
  // « auto ») : après « Rédiger moi-même », le kiné veut ses notes même sur un bilan déjà généré.
  const composed = initialAi !== undefined || (flow === 'auto' && state.bilan.status === 'GENERE');
  const step: EditorStep = composed && (flow === 'editor' || stepParam === null) ? 'document' : initialStep;
  return <BilanEditor key={`${state.bilan.id}-${flow}`} initial={state.bilan} initialStep={step} initialAi={initialAi} forceDrawerOpen={Boolean(initialAi && initialAi.candidates.length > 0)} />;
}
