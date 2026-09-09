'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Copy, Mail, Download, Check, Eye, UserPlus, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DocumentSheet from './DocumentSheet';
import BilanPreviewModal from './BilanPreviewModal';
import PatientCombobox from '../PatientCombobox';
import { attachPatient, finalizeBilan, ApiError } from '@/utils/bilanApi';
import { fetchBilanRender, downloadBilanPdf, bilanRenderToText } from '@/utils/bilanExport';
import { emptyBilanDocument, type AiBusy, type BilanPatch, type BilanRecord, type BilanSectionKey, type PatientSummary, type SectionWarnings } from '@/types/bilan';

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
}

const FLUSH_PENDING_TOAST = { title: 'Sauvegarde en attente, réessaie dans un instant' };

export default function DocumentStep({ record, update, flush, replaceRecord, disabled, onBack, onCompose, aiBusy, warnings, onSectionEdited }: DocumentStepProps) {
  const { toast } = useToast();
  const doc = record.document ?? emptyBilanDocument();
  const [evolution, setEvolution] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'copy' | 'mail' | 'pdf' | 'save'>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const hasPrevious = (doc.comparison?.previousBilanIds?.length ?? 0) > 0;
  const finalized = record.status === 'ENREGISTRE';

  const hasNotes = (record.rawNotes ?? '').trim().length > 0;
  const anyText = doc.sections.some((s) => s.text.trim() !== '');
  const [composeConfirmOpen, setComposeConfirmOpen] = useState(false);
  const composeAll = () => { setComposeConfirmOpen(false); void onCompose(); };
  const handleComposeClick = () => { if (anyText) setComposeConfirmOpen(true); else composeAll(); };

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

  // Barre d'outils au-dessus de la page : rédaction IA, évolution, retour aux mesures, aperçu
  const toolbar = (
    <div className="mx-auto w-full max-w-[794px] flex items-center justify-between gap-2 flex-wrap px-1">
      <Tooltip>
        <TooltipTrigger asChild><span><Button variant="outline" size="sm" onClick={handleComposeClick} disabled={disabled || !hasNotes || aiBusy !== null} className="h-8 text-xs rounded-full">{aiBusy === 'compose' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Rédiger avec l’IA</Button></span></TooltipTrigger>
        <TooltipContent>{hasNotes ? 'Rédige les 7 sections à partir de tes notes et de tes mesures' : 'Saisis des notes à l’étape Notes pour utiliser l’IA'}</TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-2 flex-wrap">
        {hasPrevious && <label className="flex items-center gap-1.5 text-xs"><Switch checked={evolution} onCheckedChange={setEvolution} />Inclure l’évolution</label>}
        <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(true)} className="h-8 text-xs"><Eye className="h-3.5 w-3.5 mr-1" />Aperçu A4</Button>
      </div>
    </div>
  );

  // La page telle qu'elle sera imprimée : en-tête, titre, patient et tableaux rendus par le serveur,
  // paragraphes des sections éditables en place
  const sheet = (
    <DocumentSheet bilanId={record.id} refreshKey={record.updatedAt} evolution={evolution} doc={doc} onSectionChange={setSection} disabled={disabled}
      canRegenerate={hasNotes} onRegenerate={(key) => { void onCompose([key]); }} aiBusy={aiBusy} warnings={warnings} onDismissWarning={onSectionEdited} />
  );

  const saveButton = finalized ? (
    <Button disabled className="rounded-full h-9 px-4"><Check className="h-4 w-4 mr-1" />Enregistré</Button>
  ) : record.patient ? (
    <Button onClick={doFinalize} disabled={disabled || busy !== null} className="btn-teal rounded-full h-9 px-4">{busy === 'save' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Enregistrer pour {record.patient.firstName}</Button>
  ) : (
    <Popover open={attachOpen} onOpenChange={setAttachOpen}>
      <PopoverTrigger asChild><Button disabled={disabled || busy !== null} className="btn-teal rounded-full h-9 px-4"><UserPlus className="h-4 w-4 mr-1" />Associer à un patient</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3"><p className="text-xs text-muted-foreground mb-2">Le bilan sera enregistré pour ce patient</p><PatientCombobox value={null} onChange={handleAttachAndFinalize} /></PopoverContent>
    </Popover>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-3 sm:px-4 py-3">
        <div className="flex flex-col gap-3 bg-muted/30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-4">{toolbar}{sheet}</div>
      </div>
      <div className="sticky bottom-12 lg:bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-9"><ArrowLeft className="h-4 w-4 mr-1" />Notes</Button>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={busy !== null} className="h-9 rounded-full"><Copy className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Copier</span></Button>
          <Button size="sm" variant="outline" onClick={handleMail} disabled={busy !== null} className="h-9 rounded-full"><Mail className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Mail</span></Button>
          <Button size="sm" variant="outline" onClick={handlePdf} disabled={busy !== null} className="h-9 rounded-full">{busy === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 sm:mr-1" />}<span className="hidden sm:inline">PDF</span></Button>
          {saveButton}
        </div>
      </div>
      <AlertDialog open={composeConfirmOpen} onOpenChange={setComposeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer les sections déjà rédigées ?</AlertDialogTitle>
            <AlertDialogDescription>La rédaction IA écrit les 7 sections à partir de tes notes et de tes mesures. Les textes actuels seront écrasés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={composeAll} className="btn-teal">Rédiger</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BilanPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} bilanId={record.id} evolution={evolution} />
    </div>
  );
}
