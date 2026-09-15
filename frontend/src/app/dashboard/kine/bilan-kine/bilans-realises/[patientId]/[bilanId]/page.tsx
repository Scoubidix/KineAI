'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { Download, History, Loader2, PanelRightOpen, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useBilanAutosave } from '@/hooks/useBilanAutosave';
import { ApiError, composeBilan, deleteBilan, getBilan } from '@/utils/bilanApi';
import { downloadBilanPdf, fetchBilanRender } from '@/utils/bilanExport';
import DocumentSheet from '../../../components/editor/DocumentSheet';
import SaveIndicator from '../../../components/editor/SaveIndicator';
import MeasurementsPanel from '../../../components/MeasurementsPanel';
import CompareWithPreviousModal from '../../../components/CompareWithPreviousModal';
import { usePreviousReference } from '../../../components/editor/usePreviousReference';
import MeasuresPane, { useDensePane } from '../../../components/editor/MeasuresPane';
import { useMinWidth } from '../../../components/editor/useMinWidth';
import { BILAN_TYPE_COLORS, BILAN_TYPE_LABELS, emptyBilanDocument, type AiBusy, type BilanRecord, type BilanSectionKey, type DocumentMeasurement, type SectionWarnings } from '@/types/bilan';
import { CARD, PageHeader, formatDateLong } from '../../../components/ListPage';
import { BILANS_REALISES_HREF, parseId } from '../../../components/bilansRealises';

/** Barre d'actions commune aux deux rendus (document vivant, bilan hérité). */
function ActionsRow({ bilan, backHref, extras, evolution }: { bilan: BilanRecord; backHref: string; extras?: React.ReactNode; evolution?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const c = BILAN_TYPE_COLORS[bilan.type];

  const handleDelete = async () => {
    try {
      await deleteBilan(bilan.id);
      toast({ title: 'Bilan supprimé' });
      // replace et non push : « Précédent » ne doit pas ramener sur un bilan qui n'existe plus
      router.replace(backHref);
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  // Le PDF suit l'interrupteur d'évolution : ce qu'on lit à l'écran est ce qu'on exporte
  const handlePdf = async () => {
    const r = await downloadBilanPdf(bilan.id, { evolution });
    if (!r.success) toast({ title: 'Erreur', description: r.error ?? 'PDF impossible', variant: 'destructive' });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>{BILAN_TYPE_LABELS[bilan.type]}</span>
      <span className="text-xs text-muted-foreground">{formatDateLong(bilan.createdAt)}</span>
      <span className="flex-1" />
      {extras}
      <Button size="sm" onClick={handlePdf} className="btn-teal h-8 rounded-full px-3">
        <Download className="h-3.5 w-3.5 mr-1.5" />PDF
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Supprimer
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce bilan ?</AlertDialogTitle>
            <AlertDialogDescription>Le bilan du {formatDateLong(bilan.createdAt)} ne sera plus visible dans la fiche patient.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Surface unique de correction d'un bilan à document : le texte s'édite dans la feuille, les
 * mesures dans un tiroir, l'IA ne peut que reprendre une section.
 *
 * Aucun chemin vers l'éditeur : corriger et créer sont deux gestes différents, et l'éditeur
 * porte la dictée et la rédaction complète, qui écraseraient le bilan rendu au patient.
 */
function LivingBilan({ initial, backHref }: { initial: BilanRecord; backHref: string }) {
  const { toast } = useToast();
  const { record, update, flush, replaceRecord, saveState, savedAt, pending, errorMessage, reload } = useBilanAutosave(initial);
  const doc = record.document ?? emptyBilanDocument();
  const stale = saveState === 'stale';
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [warnings, setWarnings] = useState<SectionWarnings>({});
  const wide = useMinWidth(1024);
  const dense = useDensePane(wide);
  // Ouvert d'emblée sur grand écran : sur un bilan déjà rédigé, les mesures font partie de ce
  // qu'on relit. Replié en rail d'un clic, comme dans l'éditeur.
  const [measuresOpen, setMeasuresOpen] = useState(false);
  useEffect(() => { setMeasuresOpen(wide); }, [wide]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [evolution, setEvolution] = useState(false);
  // La rédaction part des notes : sans notes, l'IA n'a rien à reprendre (NOTES_REQUIRED côté serveur)
  const canRegenerate = (record.rawNotes ?? '').trim().length > 0;
  const comparisonIds = doc.comparison?.previousBilanIds;
  const hasPrevious = (comparisonIds?.length ?? 0) > 0;

  // `autoSelect: false` : ici on lit la référence déjà choisie à la rédaction, on n'en devine
  // jamais une — poser `comparison` tout seul reviendrait à modifier un bilan remis au patient.
  const { reference, loading: referenceLoading, error: referenceError, previousValues } = usePreviousReference({
    patientId: record.patientId,
    type: record.type,
    excludeId: record.id,
    hasComparison: comparisonIds !== undefined,
    comparisonIds,
    onAutoSelect: () => {},
    autoSelect: false,
  });

  const setSection = (key: BilanSectionKey, text: string) => {
    update({ document: { ...doc, sections: doc.sections.map((s) => (s.key === key ? { ...s, text } : s)) } });
  };

  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });

  // Une section à la fois : la réécriture complète reste réservée à la création.
  const regenerate = async (key: BilanSectionKey) => {
    if (aiBusy !== null) return;
    if (!(await flush())) { toast({ title: 'Sauvegarde en attente', description: 'Réessaie dans un instant' }); return; }
    setAiBusy(key);
    try {
      const r = await composeBilan(record.id, [key]);
      replaceRecord(r.bilan);
      setWarnings((prev) => { const next = { ...prev }; delete next[key]; return { ...next, ...r.warnings }; });
    } catch (e) {
      const message = e instanceof ApiError && e.status === 429
        ? 'Patiente une minute avant de relancer l’IA'
        : (e as Error).message || 'Reprise impossible';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setAiBusy(null);
    }
  };

  const summary = 'Tests et mesures';

  const clearWarning = (key: BilanSectionKey) => setWarnings((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });

  return (
    <div className="flex min-h-full">
      {/* Le document garde sa largeur de lecture ; le meuble des mesures occupe sa propre colonne,
          sans jamais recouvrir le texte qu'on est en train de corriger. */}
      <div className="flex-1 min-w-0 max-w-3xl mx-auto p-4 pb-16 lg:pb-4 space-y-4">
      {/* L'indicateur vit sur la ligne du titre, pas dans la rangée des boutons : en apparaissant
          il y ferait déborder la ligne, et « Supprimer » passerait au retour à la ligne suivant.
          Il ne parle qu'à partir de la première frappe — au repos, rien à annoncer. */}
      <PageHeader
        backHref={backHref}
        backLabel="Retour aux bilans du patient"
        title={record.motif || 'Bilan'}
        right={saveState === 'idle' ? undefined : <span className="shrink-0"><SaveIndicator state={saveState} savedAt={savedAt} pending={pending} /></span>}
      />
      <ActionsRow
        bilan={record}
        backHref={backHref}
        evolution={evolution}
        extras={
          <>
            {hasPrevious && (
              <label className="flex items-center gap-1.5 text-xs"><Switch checked={evolution} onCheckedChange={setEvolution} />Inclure l’évolution</label>
            )}
            {!measuresOpen && (
              <Button size="sm" variant="outline" onClick={() => setMeasuresOpen(true)} className="h-8 rounded-full px-3 border-[#3899aa]/50 text-[#3899aa] hover:bg-[#3899aa]/10">
                <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" />Tests et mesures
              </Button>
            )}
          </>
        }
      />

      {stale && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 text-amber-900 text-xs px-4 py-2 border border-amber-200">
          <span>Ce bilan a été modifié sur un autre appareil. Recharge pour continuer : tes dernières frappes non enregistrées seront perdues.</span>
          <Button size="sm" variant="outline" onClick={reload} className="h-7 text-xs shrink-0"><RefreshCw className="h-3 w-3 mr-1" />Recharger</Button>
        </div>
      )}
      {saveState === 'error' && errorMessage && (
        <p className="rounded-lg bg-red-50 text-red-900 text-xs px-4 py-2 border border-red-200">Sauvegarde impossible : {errorMessage}</p>
      )}

      <DocumentSheet
        bilanId={record.id}
        refreshKey={record.updatedAt}
        evolution={evolution}
        doc={doc}
        onSectionChange={setSection}
        disabled={stale || aiBusy !== null}
        canRegenerate={canRegenerate}
        onRegenerate={(key) => { void regenerate(key); }}
        aiBusy={aiBusy}
        warnings={warnings}
        onDismissWarning={clearWarning}
      />

      </div>

      <MeasuresPane summary={summary} open={measuresOpen} onOpenChange={setMeasuresOpen} wide={wide}>
        <div className="flex flex-col gap-3 p-3">

      {record.type !== 'INITIAL' && record.patientId !== null && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 flex-wrap">
          <History className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
          {referenceLoading ? <span>Recherche du bilan de référence…</span>
            : referenceError ? <span>Bilans antérieurs indisponibles pour le moment</span>
            : reference ? <span>Référence : {BILAN_TYPE_LABELS[reference.type]} du {new Date(reference.createdAt).toLocaleDateString('fr-FR')}</span>
            : <span>Aucun bilan de comparaison</span>}
          <Button type="button" variant="link" size="sm" onClick={() => setCompareOpen(true)} className="h-6 px-1 text-xs">{reference ? 'Changer' : 'Choisir'}</Button>
        </div>
      )}

      {/* Le panneau seul, sans l'extraction ni les suggestions du tiroir de rédaction :
          ici on corrige une valeur, on n'analyse pas des notes. */}
      <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} disabled={stale || aiBusy !== null} previousValues={previousValues} dense={dense} />
        </div>
      </MeasuresPane>

      {record.patientId !== null && (
        <CompareWithPreviousModal
          open={compareOpen}
          onOpenChange={setCompareOpen}
          patientId={record.patientId}
          excludeId={record.id}
          initialSelectedIds={comparisonIds}
          // Choisir la comparaison n'écrit que `comparison` : les lignes de mesures vides
          // d'`addReferenceRows` préparent une saisie, elles n'ont rien à faire dans un bilan fini.
          onSelect={(bilans) => update({ document: { ...doc, comparison: { previousBilanIds: bilans.map((b) => b.id) } } })}
        />
      )}
    </div>
  );
}

/** Bilan hérité (aucun `document`) : seul le rendu serveur sait l'afficher, et il n'est pas éditable. */
function LegacyBilan({ bilan, backHref }: { bilan: BilanRecord; backHref: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBilanRender(bilan.id)
      .then((r) => { if (!cancelled) setHtml(r.html); })
      .catch((e: Error) => { if (!cancelled) setRenderError(e.message); });
    return () => { cancelled = true; };
  }, [bilan.id]);

  return (
    <>
      <PageHeader backHref={backHref} backLabel="Retour aux bilans du patient" title={bilan.motif || 'Bilan'} />
      <ActionsRow bilan={bilan} backHref={backHref} />
      <p className="text-xs text-muted-foreground">Ce bilan a été rédigé avant la refonte du module : il se consulte et s’exporte, mais ne se modifie plus.</p>
      <div className={`${CARD} bilan-preview min-h-[200px] text-sm leading-relaxed text-foreground p-4`}>
        {renderError ? (
          <p className="text-sm text-destructive text-center py-8">{renderError}</p>
        ) : html === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
        )}
      </div>
    </>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'ready'; bilan: BilanRecord };

export default function BilanRealisePage() {
  const params = useParams<{ patientId: string; bilanId: string }>();
  const patientId = parseId(params.patientId);
  const bilanId = parseId(params.bilanId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (patientId === null || bilanId === null) { setState({ status: 'notFound' }); return; }
    let cancelled = false;
    // Remise à zéro en tête d'effet : sans elle, un changement de bilan sans démontage de la
    // page (futur lien « précédent / suivant ») afficherait le document du bilan précédent.
    setState({ status: 'loading' });
    // `getBilan` est la seule lecture qui renvoie un BilanRecord complet (updatedAt, statut,
    // patient, document) — ce dont l'autosave a besoin. Elle vérifie l'appartenance au kiné ;
    // le rattachement au patient de l'URL est vérifié ici pour que l'adresse reste honnête.
    getBilan(bilanId)
      .then((bilan) => {
        if (cancelled) return;
        setState(bilan.patientId === patientId ? { status: 'ready', bilan } : { status: 'notFound' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'notFound' }); });
    return () => { cancelled = true; };
  }, [patientId, bilanId]);

  // Sans la garde, une URL au patient invalide enverrait le retour sur /bilans-realises/NaN,
  // soit un second cul-de-sac au lieu de remonter d'un niveau.
  const backHref = patientId === null ? BILANS_REALISES_HREF : `${BILANS_REALISES_HREF}/${patientId}`;

  // Le bilan à document pose sa propre mise en page (deux colonnes, meuble des mesures compris) :
  // le conteneur centré ne vaut que pour les états qui n'ont qu'une colonne.
  if (state.status === 'ready' && state.bilan.document) {
    // `key` : changer de bilan sans démonter la page doit repartir d'un autosave neuf
    return <LivingBilan key={state.bilan.id} initial={state.bilan} backHref={backHref} />;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {state.status === 'notFound' && (
        <>
          <PageHeader backHref={backHref} backLabel="Retour aux bilans du patient" title="Bilan introuvable" />
          <p className="text-sm text-muted-foreground text-center py-10">Ce bilan n’existe pas ou ne t’appartient pas.</p>
        </>
      )}
      {state.status === 'loading' && (
        <>
          <PageHeader backHref={backHref} backLabel="Retour aux bilans du patient" title="Bilan" />
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>
        </>
      )}
      {state.status === 'ready' && <LegacyBilan bilan={state.bilan} backHref={backHref} />}
    </div>
  );
}
