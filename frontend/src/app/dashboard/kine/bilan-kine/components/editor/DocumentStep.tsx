'use client';

import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, AlertTriangle, Copy, Mail, Download, Check, PanelRightOpen, UserPlus, Loader2, Sparkles, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DocumentSheet from './DocumentSheet';
import { DRAWER_ACTIONS_ID } from './MeasuresDrawer';
import PatientCombobox from '../PatientCombobox';
import { attachPatient, finalizeBilan, ApiError } from '@/utils/bilanApi';
import { fetchBilanRender, downloadBilanPdf, bilanRenderToText } from '@/utils/bilanExport';
import { emptyBilanDocument, BILAN_TYPE_LABELS, type AiBusy, type BilanPatch, type BilanRecord, type BilanSectionKey, type BilanType, type PatientSummary, type SectionWarnings } from '@/types/bilan';

// flush() renvoie Promise<boolean> (cf. useBilanAutosave) : true si tout est persisté
export interface DocumentStepProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  flush: () => Promise<boolean>;
  replaceRecord: (r: BilanRecord) => void;
  disabled?: boolean;
  onBack: () => void;
  onCompose: (sections?: BilanSectionKey[]) => Promise<boolean>;
  aiBusy: AiBusy;
  warnings: SectionWarnings;
  onSectionEdited: (key: BilanSectionKey) => void;
  lastRun: { extracted: number; pending: number } | null;
  onVerify: () => void;
  /** Ouvre le panneau des mesures (fermé, il n'a plus de rail : sa commande est dans la barre) */
  onOpenMeasures: () => void;
  measuresOpen: boolean;
  onDismissRun: () => void;
  /** ≥ 1024 px : pied de page classique. Sinon, les actions se fondent dans la barre repliée du tiroir. */
  wide: boolean;
  /** Bilan issu d'une séance : les notes sont la transcription, le bouton doit le dire */
  fromSession?: boolean;
  /** Type du bilan à la dernière rédaction : s'il diffère du type courant, le texte est décalé */
  composedType?: BilanType | null;
}

const FLUSH_PENDING_TOAST = { title: 'Sauvegarde en attente, réessaie dans un instant' };

export default function DocumentStep({ record, update, flush, replaceRecord, disabled, onBack, onCompose, aiBusy, warnings, onSectionEdited, lastRun, onVerify, onDismissRun, wide, onOpenMeasures, measuresOpen, fromSession, composedType }: DocumentStepProps) {
  const { toast } = useToast();
  const doc = record.document ?? emptyBilanDocument();
  const [evolution, setEvolution] = useState(false);
  const [busy, setBusy] = useState<null | 'copy' | 'mail' | 'pdf' | 'save'>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const hasPrevious = (doc.comparison?.previousBilanIds?.length ?? 0) > 0;
  const finalized = record.status === 'ENREGISTRE';

  const hasNotes = (record.rawNotes ?? '').trim().length > 0;

  const setSection = (key: BilanSectionKey, text: string) => {
    update({ document: { ...doc, sections: doc.sections.map((s) => (s.key === key ? { ...s, text } : s)) } });
    onSectionEdited(key);
  };

  const withText = async (action: (text: string, title: string) => Promise<void> | void, kind: 'copy' | 'mail') => {
    setBusy(kind);
    try {
      // On n'exporte jamais un document périmé : si le flush échoue (hors ligne, 429, bilan obsolète), on abandonne l'action
      if (!(await flush())) { toast(FLUSH_PENDING_TOAST); return; }
      const r = await fetchBilanRender(record.id, { evolution });
      await action(bilanRenderToText(r.html), r.title);
    } catch (e) { toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const handleCopy = () => withText(async (text) => { await navigator.clipboard.writeText(text); toast({ title: 'Copié', description: 'Le bilan est dans le presse-papiers' }); }, 'copy');
  const handleMail = () => withText(async (text, title) => {
    // Certains clients mail tronquent ou refusent les liens mailto: trop longs :
    // au-delà d'un seuil, on copie le texte complet et on ne met qu'un message court dans le corps.
    if (text.length > 1800) {
      await navigator.clipboard.writeText(text);
      const shortBody = 'Bilan copié dans le presse-papiers : colle-le ici (Ctrl+V).';
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shortBody)}`;
      toast({ title: 'Bilan copié, colle-le dans ton mail' });
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
  }, 'mail');
  const handlePdf = async () => {
    setBusy('pdf');
    try {
      if (!(await flush())) { toast(FLUSH_PENDING_TOAST); return; }
      const r = await downloadBilanPdf(record.id, { evolution });
      if (!r.success) toast({ title: 'PDF impossible', description: r.error, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const doFinalize = async () => {
    setBusy('save');
    try {
      if (!(await flush())) { toast(FLUSH_PENDING_TOAST); return; }
      const updated = await finalizeBilan(record.id);
      replaceRecord(updated);
      toast({ title: 'Bilan enregistré', description: updated.patient ? `Pour ${updated.patient.firstName} ${updated.patient.lastName.toUpperCase()}` : undefined });
    } catch (e) {
      const msg = e instanceof ApiError && e.code === 'DOCUMENT_EMPTY' ? 'Le bilan est vide : rédige une section ou saisis une mesure.' : (e as Error).message;
      toast({ title: 'Enregistrement impossible', description: msg, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const handleAttachAndFinalize = async (p: PatientSummary | null) => {
    if (!p) return;
    setAttachOpen(false);
    setBusy('save');
    try {
      if (!(await flush())) { toast(FLUSH_PENDING_TOAST); setBusy(null); return; }
      replaceRecord(await attachPatient(record.id, p.id));
      await doFinalize();
    } catch (e) { toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' }); setBusy(null); }
  };

  // Barre d'outils au-dessus de la page. Le panneau fermé n'a pas de rail : sa commande vit ici,
  // comme le volet de navigation de Word ou les panneaux de Figma — on ne laisse pas un moignon
  // de panneau accroché au bord du canevas.
  const toolbar = (
    <div className="mx-auto w-full max-w-[794px] grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1">
      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-9 text-sm"><ArrowLeft className="h-4 w-4 mr-1" />{fromSession ? 'Transcription' : 'Notes'}</Button>
      </div>
      {measuresOpen ? <span /> : (
        <Button variant="outline" size="sm" onClick={onOpenMeasures} className="h-9 text-sm rounded-full border-[#3899aa]/50 text-[#3899aa] hover:bg-[#3899aa]/10">
          <PanelRightOpen className="h-4 w-4 mr-1.5" />Tests et mesures
        </Button>
      )}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {hasPrevious && <label className="flex items-center gap-1.5 text-xs"><Switch checked={evolution} onCheckedChange={setEvolution} />Inclure l’évolution</label>}
      </div>
    </div>
  );

  // Le type a changé après la rédaction : le texte reste, on propose de le reprendre sous le bon angle.
  const typeChanged = composedType != null && composedType !== record.type;
  const typeBanner = typeChanged && (
    <div role="status" className="mx-auto w-full max-w-[794px] flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <span className="flex-1">
        Ce bilan a été rédigé comme un bilan <strong>{BILAN_TYPE_LABELS[composedType!].toLowerCase()}</strong>. Tu l’as passé en <strong>{BILAN_TYPE_LABELS[record.type].toLowerCase()}</strong>.
      </span>
      <Button size="sm" onClick={() => { void onCompose(); }} disabled={disabled || !hasNotes || aiBusy !== null} className="btn-teal h-7 text-xs rounded-full">
        {aiBusy === 'compose' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Régénérer
      </Button>
    </div>
  );

  // Bandeau de résultat de la dernière rédaction IA : nombre de mesures extraites, à vérifier ou non
  const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`;
  const banner = lastRun && (
    <div role="status" className="mx-auto w-full max-w-[794px] flex items-center gap-2 rounded-lg border border-[#3899aa]/40 bg-[#3899aa]/5 px-3 py-2 text-xs">
      <Sparkles className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
      <span className="flex-1">
        {lastRun.extracted === 0 ? 'Aucune mesure reconnue dans les notes' : `${plural(lastRun.extracted, 'mesure')} extraite${lastRun.extracted > 1 ? 's' : ''}${lastRun.pending > 0 ? `, ${lastRun.pending} à vérifier` : ''}`}
      </span>
      {lastRun.pending > 0
        ? <Button size="sm" onClick={onVerify} className="btn-teal h-7 text-xs rounded-full">Vérifier</Button>
        : <button type="button" onClick={onDismissRun} aria-label="Fermer" className="p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );

  // La page telle qu'elle sera imprimée : en-tête, titre, patient et tableaux rendus par le serveur,
  // paragraphes des sections éditables en place
  const sheet = (
    <DocumentSheet bilanId={record.id} refreshKey={record.updatedAt} evolution={evolution} doc={doc} onSectionChange={setSection} disabled={disabled}
      canRegenerate={hasNotes} onRegenerate={(key) => { void onCompose([key]); }} aiBusy={aiBusy} warnings={warnings} onDismissWarning={onSectionEdited} />
  );

  // Enregistré : plus de bouton, l'état est déjà dit. Un bouton désactivé laissait croire
  // qu'il restait quelque chose à faire ; les corrections, elles, partent par l'autosave.
  const saveButton = finalized ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 h-9 px-4 text-sm font-medium"><Check className="h-4 w-4" /><span className="hidden lg:inline">Enregistré</span></span>
  ) : record.patient ? (
    <Button onClick={doFinalize} disabled={disabled || busy !== null} aria-label={`Enregistrer pour ${record.patient.firstName}`} className="btn-teal rounded-full h-9 px-4">{busy === 'save' ? <Loader2 className="h-4 w-4 lg:mr-1 animate-spin" /> : <Check className="h-4 w-4 lg:mr-1" />}<span className="hidden lg:inline">Enregistrer pour {record.patient.firstName}</span></Button>
  ) : (
    <Popover open={attachOpen} onOpenChange={setAttachOpen}>
      <PopoverTrigger asChild><Button disabled={disabled || busy !== null} aria-label="Associer à un patient" className="btn-teal rounded-full h-9 px-4"><UserPlus className="h-4 w-4 lg:mr-1" /><span className="hidden lg:inline">Associer à un patient</span></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3"><p className="text-xs text-muted-foreground mb-2">Le bilan sera enregistré pour ce patient</p><PatientCombobox value={null} onChange={handleAttachAndFinalize} /></PopoverContent>
    </Popover>
  );

  // Mobile : la barre repliée du tiroir est aussi le pied de page d'actions (une seule rangée).
  // L'hôte existe dès que le tiroir a rendu sa mise en page mobile (même rendu que `wide`).
  // useLayoutEffect : résolu avant la peinture, pour ne jamais laisser passer une frame avec
  // le pied de page de repli affiché en même temps que la barre repliée du tiroir.
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setActionsHost(wide ? null : document.getElementById(DRAWER_ACTIONS_ID)); }, [wide]);

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={handleCopy} disabled={busy !== null} aria-label="Copier" className="h-9 rounded-full"><Copy className="h-3.5 w-3.5 lg:mr-1" /><span className="hidden lg:inline">Copier</span></Button>
      <Button size="sm" variant="outline" onClick={handleMail} disabled={busy !== null} aria-label="Envoyer par mail" className="h-9 rounded-full"><Mail className="h-3.5 w-3.5 lg:mr-1" /><span className="hidden lg:inline">Mail</span></Button>
      <Button size="sm" variant="outline" onClick={handlePdf} disabled={busy !== null} aria-label="Télécharger le PDF" className="h-9 rounded-full">{busy === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 lg:mr-1" />}<span className="hidden lg:inline">PDF</span></Button>
      {saveButton}
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-3 sm:px-4 py-3">
        <div className="flex flex-col gap-3 bg-muted/30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-4">{toolbar}{typeBanner}{banner}{sheet}</div>
      </div>
      {actionsHost ? createPortal(actions, actionsHost) : (
        <div className="sticky bottom-12 lg:bottom-0 px-3 sm:px-4 py-2">
          <div className="mx-auto w-fit max-w-full flex items-center justify-center gap-2 flex-wrap bg-white dark:bg-card border-2 border-border rounded-full px-4 py-1.5 shadow-sm">
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
