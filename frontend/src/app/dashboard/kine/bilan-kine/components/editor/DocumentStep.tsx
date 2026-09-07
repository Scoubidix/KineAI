'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Copy, Mail, Download, Check, Eye, Pencil, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMinWidth } from './useMinWidth';
import SectionCard from './SectionCard';
import ExamenPreview from './ExamenPreview';
import BilanPreviewModal from './BilanPreviewModal';
import PatientCombobox from '../PatientCombobox';
import { attachPatient, finalizeBilan, ApiError } from '@/utils/bilanApi';
import { fetchBilanRender, downloadBilanPdf, bilanRenderToText } from '@/utils/bilanExport';
import { BILAN_SECTION_KEYS, BILAN_SECTION_TITLES, emptyBilanDocument, type AiBusy, type BilanPatch, type BilanRecord, type BilanSectionKey, type PatientSummary, type SectionWarnings } from '@/types/bilan';

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

export default function DocumentStep({ record, update, flush, replaceRecord, disabled, onBack }: DocumentStepProps) {
  const wide = useMinWidth(1024);
  const { toast } = useToast();
  const doc = record.document ?? emptyBilanDocument();
  const [evolution, setEvolution] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'copy' | 'mail' | 'pdf' | 'save'>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const hasPrevious = (doc.comparison?.previousBilanIds?.length ?? 0) > 0;
  const finalized = record.status === 'ENREGISTRE';

  const setSection = (key: string, text: string) => update({ document: { ...doc, sections: doc.sections.map((s) => (s.key === key ? { ...s, text } : s)) } });

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

  const sections = (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Compte-rendu</span>
      {BILAN_SECTION_KEYS.map((key) => {
        const s = doc.sections.find((x) => x.key === key);
        return <SectionCard key={key} sectionKey={key} title={BILAN_SECTION_TITLES[key]} text={s?.text ?? ''} onChange={(t) => setSection(key, t)} disabled={disabled} />;
      })}
    </div>
  );

  const examen = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Examen clinique</span>
        <div className="flex items-center gap-2">
          {hasPrevious && <label className="flex items-center gap-1.5 text-xs"><Switch checked={evolution} onCheckedChange={setEvolution} />Inclure l’évolution</label>}
          <Button variant="outline" size="sm" onClick={onBack} className="h-7 text-xs"><Pencil className="h-3 w-3 mr-1" />Modifier</Button>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" />Aperçu A4</Button>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 bg-white dark:bg-card"><ExamenPreview bilanId={record.id} refreshKey={record.updatedAt} evolution={evolution} /></div>
    </div>
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
        {wide ? <div className="grid grid-cols-[1.15fr_1fr] gap-4">{sections}{examen}</div> : (
          <Tabs defaultValue="cr">
            <TabsList className="grid grid-cols-3 w-full mb-3"><TabsTrigger value="cr">Compte-rendu</TabsTrigger><TabsTrigger value="examen">Examen</TabsTrigger><TabsTrigger value="apercu" onClick={() => setPreviewOpen(true)}>Aperçu</TabsTrigger></TabsList>
            <TabsContent value="cr">{sections}</TabsContent>
            <TabsContent value="examen">{examen}</TabsContent>
            <TabsContent value="apercu"><p className="text-xs text-muted-foreground p-3">L’aperçu s’ouvre en plein écran.</p></TabsContent>
          </Tabs>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-9"><ArrowLeft className="h-4 w-4 mr-1" />Vérification</Button>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={busy !== null} className="h-9 rounded-full"><Copy className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Copier</span></Button>
          <Button size="sm" variant="outline" onClick={handleMail} disabled={busy !== null} className="h-9 rounded-full"><Mail className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Mail</span></Button>
          <Button size="sm" variant="outline" onClick={handlePdf} disabled={busy !== null} className="h-9 rounded-full">{busy === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 sm:mr-1" />}<span className="hidden sm:inline">PDF</span></Button>
          {saveButton}
        </div>
      </div>
      <BilanPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} bilanId={record.id} evolution={evolution} />
    </div>
  );
}
