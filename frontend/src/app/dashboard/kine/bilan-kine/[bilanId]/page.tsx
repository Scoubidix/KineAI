'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useBilanAutosave } from '@/hooks/useBilanAutosave';
import { getBilan, attachPatient, extractBilan, composeBilan, composeBilanFromNotes, ApiError, StaleDraftError } from '@/utils/bilanApi';
import type { AiBusy, BilanRecord, BilanSectionKey, ExtractionCandidate, PatientSummary, BilanType, SectionWarnings } from '@/types/bilan';
import BilanEditorHeader from '../components/editor/BilanEditorHeader';
import BilanStepper, { type EditorStep } from '../components/editor/BilanStepper';
import CaptureStep from '../components/editor/CaptureStep';
import DocumentStep from '../components/editor/DocumentStep';
import MeasuresDrawer, { DRAWER_SUGGESTIONS_ID } from '../components/editor/MeasuresDrawer';
import { useMinWidth } from '../components/editor/useMinWidth';

const isStep = (s: string | null): s is EditorStep => s === 'capture' || s === 'document';

// Éditeur de bilan V1 : un état (useBilanAutosave), deux étapes, tiroir Mesures
function BilanEditor({ initial, initialStep }: { initial: BilanRecord; initialStep: EditorStep }) {
  const router = useRouter();
  const { toast } = useToast();
  const { record, update, flush, saveState, savedAt, pending, errorMessage, reload, replaceRecord } = useBilanAutosave(initial);
  const [step, setStep] = useState<EditorStep>(initialStep);
  const locked = saveState === 'stale';

  // État IA, non persisté (spec §9.2) : candidats d'extraction, appel en cours, avertissements de rédaction
  const [candidates, setCandidates] = useState<ExtractionCandidate[] | null>(null);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [warnings, setWarnings] = useState<SectionWarnings>({});
  // Garde de réentrance : `aiBusy` n'est posé qu'après le flush, une fenêtre où un double clic
  // lancerait deux appels IA (closure périmée). Le ref, lui, est synchrone.
  const aiLockRef = useRef(false);
  const FLUSH_PENDING = { title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' };

  const wide = useMinWidth(1024);
  // Tiroir Mesures : état mémorisé par navigateur ; sans valeur, ouvert sur grand écran (≥ 1280)
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem('bilan.drawer.open');
      setDrawerOpen(v === null ? window.matchMedia('(min-width: 1280px)').matches : v === '1');
    } catch { /* stockage indisponible : replié */ }
  }, []);
  const setDrawer = (open: boolean) => {
    setDrawerOpen(open);
    try { localStorage.setItem('bilan.drawer.open', open ? '1' : '0'); } catch { /* ignoré */ }
  };
  const openSuggestions = () => {
    setDrawer(true);
    requestAnimationFrame(() => document.getElementById(DRAWER_SUGGESTIONS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  // Citations des mesures acceptées automatiquement à la dernière rédaction (session)
  const [quotes, setQuotes] = useState<Map<string, string>>(new Map());
  // Bandeau de la page Document : résultat de la dernière rédaction (session)
  const [lastRun, setLastRun] = useState<{ extracted: number; pending: number } | null>(null);
  // Empreinte des mesures à la dernière rédaction : si elles changent, Examen et Diagnostic sont signalées
  const composedMeasurementsRef = useRef<string | null>(null);
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
      await goTo('document');
    } catch (e) {
      // Rédaction en échec après l'écriture des mesures : rien n'est perdu, on montre le tableau
      if (e instanceof ApiError && e.code === 'COMPOSE_FAILED' && e.body.measurementsSaved === true) {
        toast({ title: 'Mesures ajoutées, rédaction impossible', description: 'Tes mesures sont dans le tableau. Relance « Rédiger avec l’IA » dans un instant.', variant: 'destructive' });
        await reload();
        await goTo('document');
        return;
      }
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
  const handleAnalyze = async () => {
    if (aiLockRef.current) return;
    aiLockRef.current = true;
    if (!(await flush())) { toast(FLUSH_PENDING); aiLockRef.current = false; return; }
    setAiBusy('extract');
    try {
      const r = await extractBilan(record.id);
      setCandidates(r.candidates);
      setRejectedCount(r.rejected);
      openSuggestions();
    } catch (e) { handleAiError(e, 'Analyse impossible'); }
    finally { setAiBusy(null); aiLockRef.current = false; }
  };

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
    await flush();
    setStep(s);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('step', s);
      window.history.replaceState(null, '', url.toString());
    }
  }, [flush]);

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

  const handleBack = async () => {
    const ok = await flush();
    if (!ok) { toast({ title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' }); return; }
    router.push('/dashboard/kine/bilan-kine');
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-full">
        <BilanEditorHeader
          record={record}
          onPatientChange={handlePatientChange}
          onTypeChange={(t: BilanType) => update({ type: t })}
          saveState={saveState}
          savedAt={savedAt}
          pending={pending}
          errorMessage={errorMessage}
          onReload={() => { void reload(); }}
          onRetry={() => { void flush(); }}
          onBack={() => { void handleBack(); }}
          disabled={locked}
        />
        <BilanStepper step={step} onStep={(s) => { void goTo(s); }} />
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 pb-12 lg:pb-0">
            {step === 'capture' && <CaptureStep record={record} update={update} flush={flush} replaceRecord={replaceRecord} disabled={locked || aiBusy !== null} onNext={() => goTo('document')} onCompose={() => { void handleComposeFromNotes(); }} composing={aiBusy === 'compose_from_notes'} />}
            {step === 'document' && <DocumentStep record={record} update={update} flush={flush} replaceRecord={replaceRecord} disabled={locked || aiBusy !== null} onBack={() => goTo('capture')} onCompose={handleCompose} aiBusy={aiBusy} warnings={warnings} onSectionEdited={clearWarning} onComposeFromNotes={() => { void handleComposeFromNotes(); }} lastRun={lastRun} onVerify={openSuggestions} onDismissRun={() => setLastRun(null)} />}
          </div>
          <MeasuresDrawer record={record} update={update} disabled={locked || aiBusy !== null} candidates={candidates} rejectedCount={rejectedCount} onCandidatesChange={setCandidates} onAnalyze={() => { void handleAnalyze(); }} aiBusy={aiBusy} open={drawerOpen} onOpenChange={setDrawer} wide={wide} quotes={quotes} />
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

  useEffect(() => {
    if (!Number.isInteger(bilanId) || bilanId <= 0) { setState({ status: 'error', message: 'Identifiant de bilan invalide' }); return; }
    let cancelled = false;
    getBilan(bilanId)
      .then((bilan) => {
        if (cancelled) return;
        if (!bilan.document) {
          toast({ title: 'Bilan en lecture seule', description: 'Les anciens bilans se consultent depuis la fiche patient.' });
          router.replace('/dashboard/kine/bilan-kine');
          return;
        }
        setState({ status: 'ready', bilan });
      })
      .catch((e) => { if (!cancelled) setState({ status: 'error', message: e instanceof ApiError && e.status === 404 ? 'Ce bilan n’existe pas ou ne t’appartient pas' : (e as Error).message }); });
    return () => { cancelled = true; };
  }, [bilanId, router, toast]);

  if (state.status === 'loading') return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#3899aa]" /></div>;
  if (state.status === 'error') {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/kine/bilan-kine')}>Retour aux bilans</Button>
      </div>
    );
  }
  return <BilanEditor key={state.bilan.id} initial={state.bilan} initialStep={initialStep} />;
}
