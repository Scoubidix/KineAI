'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useBilanAutosave } from '@/hooks/useBilanAutosave';
import { getBilan, getJob, abandonJob, attachPatient, composeBilan, composeBilanFromNotes, extractBilan, ApiError, StaleDraftError } from '@/utils/bilanApi';
import { isProseOutdated, type AiBusy, type BilanJobKind, type BilanJobResult, type BilanJobView, type BilanRecord, type BilanSectionKey, type DictationChange, type PatientSummary, type BilanType, type SectionWarnings } from '@/types/bilan';
import BilanEditorAlerts from '../components/editor/BilanEditorAlerts';
import BilanSettingsLine from '../components/editor/BilanSettingsLine';
import CaptureStep from '../components/editor/CaptureStep';
import DictationFlow from '../components/editor/DictationFlow';
import DocumentStep from '../components/editor/DocumentStep';
import EditorStepper from '../components/editor/EditorStepper';
import MeasuresDrawer from '../components/editor/MeasuresDrawer';
import MeasuresStep from '../components/editor/MeasuresStep';
import { useDictation } from '../components/editor/useDictation';
import { useMinWidth } from '../components/editor/useMinWidth';
import { BILANS_REALISES_HREF } from '../components/bilansRealises';

export type EditorStep = 'capture' | 'verification' | 'document';
const isStep = (s: string | null): s is EditorStep => s === 'capture' || s === 'verification' || s === 'document';

/** Ce que le traitement serveur (dictée, séance) transmet à l'éditeur une fois les notes écrites */
export interface InitialAi {
  /** Remplacements faits par le correcteur pendant le traitement (jamais affichés) */
  corrections: DictationChange[];
}

const toInitialAi = (r: BilanJobResult): InitialAi => ({ corrections: r.corrections ?? [] });

// Éditeur de bilan : un état (useBilanAutosave), trois étapes Notes → Mesures → Document (spec
// 2026-09-26), tiroir Mesures aux étapes Notes et Document
function BilanEditor({ initial, initialStep, initialAi }: { initial: BilanRecord; initialStep: EditorStep; initialAi?: InitialAi }) {
  const router = useRouter();
  const { toast } = useToast();
  const { record, update, flush, saveState, errorMessage, reload, replaceRecord } = useBilanAutosave(initial);
  const [step, setStep] = useState<EditorStep>(initialStep);
  const locked = saveState === 'stale';

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
    // En séance la correction a eu lieu côté serveur : ses remplacements arrivent par le résultat
    // du traitement, faute de quoi un signalement porterait sur la sortie du correcteur.
    initialChanges: initialAi?.corrections,
  });

  // Type du bilan au moment de la dernière rédaction. Le changer après coup ne casse rien (les
  // sections sont les mêmes pour les trois types), mais le texte a été écrit sous un autre angle :
  // on le signale, on ne réécrit rien. État de session.
  const [composedType, setComposedType] = useState<BilanType | null>(null);

  const handleAiError = (e: unknown, title: string) => {
    if (e instanceof StaleDraftError) { toast({ title: 'Bilan modifié ailleurs', description: 'Rechargement de la dernière version…' }); void reload(); return; }
    if (e instanceof ApiError && e.status === 429) { toast({ title: 'Trop de demandes', description: 'Patiente une minute avant de relancer l’IA', variant: 'destructive' }); return; }
    if (e instanceof ApiError && e.code === 'PLAN_REQUIRED') { toast({ title: 'Plan requis', description: 'L’IA du bilan est disponible dès le plan Pratique', variant: 'destructive' }); return; }
    toast({ title, description: (e as Error).message, variant: 'destructive' });
  };

  // « Analyser mes notes » : l'extraction seule (lignes prouvées au tableau, les autres à
  // vérifier), puis l'étape Mesures. Notes inchangées : le serveur ne rappelle rien.
  const handleExtract = async () => {
    if (aiLockRef.current) return;
    aiLockRef.current = true;
    if (!(await flush())) { toast(FLUSH_PENDING); aiLockRef.current = false; return; }
    setAiBusy('extract');
    try {
      const r = await extractBilan(record.id);
      if (r.bilan) replaceRecord(r.bilan);
      await goTo('verification');
    } catch (e) { handleAiError(e, 'Analyse impossible'); }
    finally { setAiBusy(null); aiLockRef.current = false; }
  };

  // « Rédiger le bilan » depuis l'étape Mesures : le rédacteur, sur le tableau validé
  const handleComposeFromNotes = async () => {
    if (aiLockRef.current) return;
    aiLockRef.current = true;
    if (!(await flush())) { toast(FLUSH_PENDING); aiLockRef.current = false; return; }
    setAiBusy('compose_from_notes');
    try {
      const r = await composeBilanFromNotes(record.id);
      replaceRecord(r.bilan);
      setWarnings(r.warnings);
      setComposedType(r.bilan.type);
      await goTo('document');
    } catch (e) { handleAiError(e, 'Rédaction impossible'); }
    finally { setAiBusy(null); aiLockRef.current = false; }
  };

  // Reprise depuis la page Document : toutes les sections, ou une seule
  const handleCompose = async (sections?: BilanSectionKey[]): Promise<boolean> => {
    if (aiLockRef.current) return false;
    aiLockRef.current = true;
    if (!(await flush())) { toast(FLUSH_PENDING); aiLockRef.current = false; return false; }
    setAiBusy(sections && sections.length === 1 ? sections[0] : 'compose');
    try {
      const r = await composeBilan(record.id, sections);
      replaceRecord(r.bilan);
      // Une reprise ciblée (une seule section) ne rédige pas les 6 autres : l'avertissement
      // sur le type reste vrai pour elles, on ne le lève que sur une rédaction complète.
      if (!sections) setComposedType(r.bilan.type);
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

  const handlePatientChange = async (p: PatientSummary) => {
    try {
      const ok = await flush();
      if (!ok) { toast({ title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' }); return; }
      const updated = await attachPatient(record.id, p.id);
      replaceRecord(updated);
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

  // Mesure en prose ajoutée ou modifiée depuis la rédaction de l'examen : dérivé du document, donc
  // tient au rechargement (spec 2026-09-23 §6). Un avertissement de rédaction déjà posé passe devant.
  const shownWarnings: SectionWarnings = !warnings.examen && record.document && isProseOutdated(record.document) ? { ...warnings, examen: 'measures_changed' } : warnings;

  const busy = locked || aiBusy !== null;

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-full">
        <BilanEditorAlerts
          saveState={saveState}
          errorMessage={errorMessage}
          onReload={() => { void reload(); }}
          onRetry={() => { void flush(); }}
        />
        {/* Type, patient et motif se règlent ici, en phrase, comme à l'accueil du module. Dessous,
            l'indicateur d'étapes permet de revenir à n'importe laquelle (stepper non linéaire). */}
        <div className="px-3 sm:px-4 py-2 border-b border-border/40 flex flex-col gap-2">
          <BilanSettingsLine
            record={record}
            onBack={() => { void handleBack(); }}
            onTypeChange={(t: BilanType) => update({ type: t })}
            onPatientChange={handlePatientChange}
            onMotifChange={(motif) => update({ motif })}
            disabled={busy || dictating}
          />
          {/* Notes → Mesures passe par l'analyse, comme le bouton du bas : sans elle, le tableau
              serait périmé si les notes ont changé (notes inchangées : servi par le cache serveur) */}
          <EditorStepper step={step} onSelect={(s) => { void (step === 'capture' && s === 'verification' && (record.rawNotes ?? '').trim() ? handleExtract() : goTo(s)); }} disabled={busy || dictating} />
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className={`flex-1 min-w-0 ${step === 'verification' ? '' : 'pb-12 lg:pb-0'}`}>
            {step === 'capture' && <CaptureStep record={record} update={update} flush={flush} replaceRecord={replaceRecord} disabled={busy} onNext={() => { void goTo('verification'); }} onExtract={() => { void handleExtract(); }} extracting={aiBusy === 'extract'} dictation={dictation} onOpenMeasures={revealDrawer} measuresOpen={drawerOpen} />}
            {step === 'verification' && <MeasuresStep record={record} update={update} disabled={busy} wide={wide} onCompose={() => { void handleComposeFromNotes(); }} onSkip={() => { void goTo('document'); }} composing={aiBusy === 'compose_from_notes'} />}
            {step === 'document' && <DocumentStep record={record} update={update} flush={flush} replaceRecord={replaceRecord} disabled={busy} onBack={() => { void goTo('verification'); }} onCompose={handleCompose} aiBusy={aiBusy} warnings={shownWarnings} onSectionEdited={clearWarning} wide={wide} onOpenMeasures={revealDrawer} measuresOpen={drawerOpen} composedType={composedType} />}
          </div>
          {step !== 'verification' && <MeasuresDrawer record={record} update={update} disabled={busy} open={drawerOpen} onOpenChange={setDrawer} wide={wide} />}
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
  const initialStep: EditorStep = isStep(stepParam) ? stepParam : 'capture';
  const modeParam = searchParams.get('mode');
  // Traitement serveur (dictée) : sert d'aiguillage à l'ouverture, puis d'état IA initial une fois terminé
  const [job, setJob] = useState<BilanJobView | null>(null);
  // Dictée et séance partagent le même flux d'écrans : seul le genre du traitement change
  const [flow, setFlow] = useState<'auto' | 'dictation' | 'editor'>(modeParam === 'session' ? 'dictation' : 'auto');
  // Étape d'ouverture décidée en fin de traitement (Notes, ou Mesures après une séance analysée)
  const [openStep, setOpenStep] = useState<EditorStep | null>(null);
  // Séance terminée, analyse des notes en cours : l'écran de fin de traitement l'annonce
  const [analysing, setAnalysing] = useState(false);

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

  // Fin du flux : le serveur a écrit les notes. Après une séance, pas de relecture de la
  // transcription avant les mesures : l'analyse part aussitôt et l'étape Mesures s'ouvre (les notes
  // y restent consultables). La dictée, qui s'alterne avec l'écriture, rouvre l'étape Notes. Une
  // analyse en échec rouvre aussi les notes, d'où « Analyser mes notes » la relance.
  const handleDone = useCallback(async (j: BilanJobView) => {
    try {
      let fresh: BilanRecord | null = null;
      let step: EditorStep = 'capture';
      if (j.kind === 'SESSION') {
        setAnalysing(true);
        try {
          fresh = (await extractBilan(bilanId)).bilan;
          step = 'verification';
        } catch {
          toast({ title: 'Analyse impossible', description: 'Relance-la depuis tes notes avec « Analyser mes notes »', variant: 'destructive' });
        } finally {
          setAnalysing(false);
        }
      }
      // Notes inchangées depuis une analyse précédente : le serveur ne renvoie pas le bilan
      fresh = fresh ?? await getBilan(bilanId);
      setState({ status: 'ready', bilan: fresh });
      setJob(j);
      setOpenStep(step);
      setFlow('editor');
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.set('step', step);
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
    // Un traitement déjà ouvert impose son genre : les brouillons partis en dictée avant le
    // retrait du mode se reprennent normalement, même si plus rien n'en crée de nouveaux.
    const flowKind: BilanJobKind = job?.kind ?? 'SESSION';
    // Rappels stables (useCallback) : l'effet de fin de flux de DictationFlow ne doit se déclencher qu'une fois
    return <DictationFlow key={`flow-${state.bilan.id}`} bilan={state.bilan} kind={flowKind} initialJob={job} onDone={handleDone} onWrite={handleWrite} analysing={analysing} />;
  }
  const initialAi = job?.status === 'DONE' && job.result ? toInitialAi(job.result) : undefined;
  // Bilan déjà rédigé rouvert depuis la liste : on arrive sur le document. Une fin de dictée
  // (flow « editor ») ouvre les notes, une fin de séance l'étape Mesures (openStep).
  const composed = flow === 'auto' && state.bilan.status === 'GENERE';
  const step: EditorStep = openStep ?? (composed && stepParam === null ? 'document' : initialStep);
  return <BilanEditor key={`${state.bilan.id}-${flow}`} initial={state.bilan} initialStep={step} initialAi={initialAi} />;
}
