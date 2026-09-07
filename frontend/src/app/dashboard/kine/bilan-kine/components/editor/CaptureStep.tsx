'use client';

import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, History, Save, PenLine, Mic, Disc, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import MeasurementsPanel from '../MeasurementsPanel';
import TemplateEditorModal from '../TemplateEditorModal';
import CompareWithPreviousModal, { type SelectedBilan } from '../CompareWithPreviousModal';
import { useMinWidth } from './useMinWidth';
import { BILAN_TYPE_LABELS, emptyBilanDocument, type BilanPatch, type BilanRecord, type DocumentMeasurement, type TemplateItem } from '@/types/bilan';

export interface StepProps {
  record: BilanRecord;
  update: (patch: BilanPatch) => void;
  // flush() renvoie Promise<boolean> (cf. useBilanAutosave) : true si tout est persisté
  flush: () => Promise<boolean>;
  replaceRecord: (r: BilanRecord) => void;
  disabled?: boolean;
  onBack?: () => void;
  onNext: () => void;
}

const measureId = (m: DocumentMeasurement) => (m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${m.label.trim().toLowerCase()}`);

// Ajoute au document les mesures du bilan antérieur absentes (origine « previous », valeurs conservées)
export const mergePrevious = (current: DocumentMeasurement[], previous: DocumentMeasurement[]): DocumentMeasurement[] => {
  const seen = new Set(current.map(measureId));
  const added = previous.filter((m) => !seen.has(measureId(m))).map((m) => ({ ...m, origin: 'previous' as const }));
  return [...current, ...added];
};

const PLACEHOLDER = `Note tes observations en vrac...

Ex : patient 52 ans, maçon, lombalgie chronique depuis 3 mois suite port de charge. ATCD : hernie discale L4-L5 opérée 2018. Douleur bas du dos irradiant fesse droite, EVA 5/10 repos 7/10 effort. Flexion lombaire limitée 40°, Lasègue négatif, paravertébraux contracturés...`;

export interface CaptureStepProps extends StepProps { onAnalyze: () => void; analyzing: boolean }

export default function CaptureStep({ record, update, disabled, onNext, onAnalyze, analyzing }: CaptureStepProps) {
  const wide = useMinWidth(1024);
  const doc = record.document ?? emptyBilanDocument();
  const [compareOpen, setCompareOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [previous, setPrevious] = useState<SelectedBilan[]>([]);
  const notesLength = (record.rawNotes ?? '').length;
  const hasNotes = (record.rawNotes ?? '').trim().length > 0;

  const templateItems = useMemo<TemplateItem[]>(() => doc.measurements.map((m) => (m.kind === 'canonical' ? { kind: 'canonical', key: m.key } : { kind: 'custom', label: m.label })), [doc.measurements]);
  const filledCount = doc.measurements.filter((m) => m.value !== null && m.value !== '' ).length;

  const setMeasurements = (measurements: DocumentMeasurement[]) => update({ document: { ...doc, measurements } });

  const handleCompareSelect = (bilans: SelectedBilan[]) => {
    setPrevious(bilans);
    const ids = bilans.map((b) => b.id);
    let measurements = doc.measurements;
    if (bilans.length > 0) {
      const mostRecent = [...bilans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      measurements = mergePrevious(doc.measurements, mostRecent.measurements);
    }
    update({ document: { ...doc, measurements, comparison: ids.length ? { previousBilanIds: ids } : undefined } });
  };

  const modeChip = (icon: React.ReactNode, label: string, active: boolean) => (
    <span title={active ? undefined : 'Bientôt disponible'} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${active ? 'bg-[#3899aa]/15 text-[#3899aa]' : 'text-muted-foreground opacity-60'}`}>{icon}{label}</span>
  );

  const source = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source</span>
        <span className="flex-1" />
        {modeChip(<PenLine className="h-3 w-3" />, 'Notes', true)}
        {modeChip(<Mic className="h-3 w-3" />, 'Dicter', false)}
        {modeChip(<Disc className="h-3 w-3" />, 'Séance', false)}
      </div>
      <div className="flex items-center gap-2 px-1">
        <Search className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
        <span className="text-xs font-medium text-[#3899aa] shrink-0">Motif</span>
        <Input value={record.motif ?? ''} onChange={(e) => update({ motif: e.target.value })} placeholder="Ex : Lombalgie chronique, rééducation post-opératoire..." disabled={disabled} maxLength={500} className="border-0 border-b border-border/60 rounded-none bg-transparent text-sm h-8 px-2 focus-visible:ring-0" />
      </div>
      <Textarea value={record.rawNotes ?? ''} onChange={(e) => update({ rawNotes: e.target.value })} placeholder={PLACEHOLDER} disabled={disabled} maxLength={50000} className="min-h-[260px] lg:min-h-[420px] text-sm leading-relaxed resize-y rounded-xl border-2 border-border/60 bg-white dark:bg-card p-4 focus-visible:ring-[#3899aa]/50" />
      {notesLength > 45000 && (
        <span className="text-[10px] text-muted-foreground -mt-2 self-end px-1">{notesLength} / 50000</span>
      )}
      {record.patientId && record.type !== 'INITIAL' && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5 text-[#3899aa]" />
          {previous.length > 0 ? (
            <span>{previous.length} bilan{previous.length > 1 ? 's' : ''} en comparaison : {[...previous].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((b) => `${BILAN_TYPE_LABELS[b.type]} (${new Date(b.createdAt).toLocaleDateString('fr-FR')})`).join(' · ')}</span>
          ) : (
            <span>Compare avec les bilans antérieurs de ce patient</span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setCompareOpen(true)} disabled={disabled} className="h-7 text-xs rounded-full">{previous.length > 0 ? 'Modifier la sélection' : 'Choisir'}</Button>
        </div>
      )}
    </div>
  );

  const measures = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mesures</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSaveTemplateOpen(true)} disabled={disabled || templateItems.length === 0} className="h-7 text-xs"><Save className="h-3 w-3 mr-1" />Sauvegarder le template</Button>
      </div>
      <MeasurementsPanel measurements={doc.measurements} onChange={setMeasurements} disabled={disabled} />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-3 sm:px-4 py-3">
        {wide ? (
          <div className="grid grid-cols-[1.15fr_1fr] gap-4">{source}{measures}</div>
        ) : (
          <Tabs defaultValue="notes">
            <TabsList className="grid grid-cols-2 w-full mb-3">
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="mesures">Mesures <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{filledCount}/{doc.measurements.length}</span></TabsTrigger>
            </TabsList>
            <TabsContent value="notes">{source}</TabsContent>
            <TabsContent value="mesures">{measures}</TabsContent>
          </Tabs>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-3 sm:px-4 py-2">
        <span className="text-[11px] text-muted-foreground hidden sm:inline">L’analyse repère les tests et mesures cités dans tes notes ; tu valides ensuite</span>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="sm" onClick={onNext} disabled={disabled} className="h-9">Passer sans analyser</Button>
          <Button onClick={onAnalyze} disabled={disabled || !hasNotes} className="btn-teal rounded-full px-5 h-9">
            {analyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}Analyser les notes <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <TemplateEditorModal open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} mode="private" template={null} initialItems={templateItems} onSaved={() => {}} />
      {record.patientId && (
        <CompareWithPreviousModal open={compareOpen} onOpenChange={setCompareOpen} patientId={record.patientId} excludeId={record.id} initialSelectedIds={doc.comparison?.previousBilanIds ?? []} onSelect={handleCompareSelect} />
      )}
    </div>
  );
}
