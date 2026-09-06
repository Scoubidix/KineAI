'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import PatientCombobox from '../PatientCombobox';
import SaveIndicator from './SaveIndicator';
import type { SaveState } from '@/hooks/useBilanAutosave';
import { BILAN_TYPE_LABELS, BILAN_TYPE_COLORS, type BilanRecord, type BilanType, type PatientSummary } from '@/types/bilan';

interface BilanEditorHeaderProps {
  record: BilanRecord;
  onPatientChange: (p: PatientSummary | null) => void;
  onTypeChange: (t: BilanType) => void;
  saveState: SaveState;
  savedAt: Date | null;
  pending: boolean;
  onReload: () => void;
  disabled?: boolean;
}

export default function BilanEditorHeader({ record, onPatientChange, onTypeChange, saveState, savedAt, pending, onReload, disabled }: BilanEditorHeaderProps) {
  const router = useRouter();
  const [patientOpen, setPatientOpen] = useState(false);
  const c = BILAN_TYPE_COLORS[record.type];
  const finalized = record.status === 'ENREGISTRE';

  return (
    <div className="border-b border-border/40">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/kine/bilan-kine')} className="h-8 px-2"><ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Bilans</span></Button>

        <Popover open={patientOpen} onOpenChange={setPatientOpen}>
          <PopoverTrigger asChild>
            <button type="button" disabled={disabled || finalized} className="inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs font-medium bg-background">
              <User className="h-3.5 w-3.5 text-[#3899aa]" />
              {record.patient ? `${record.patient.firstName} ${record.patient.lastName.toUpperCase()}` : 'Sans patient'}
              {!finalized && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <p className="text-xs text-muted-foreground mb-2">Patient de ce bilan</p>
            <PatientCombobox value={record.patient} onChange={(p) => { onPatientChange(p); setPatientOpen(false); }} />
          </PopoverContent>
        </Popover>

        <select value={record.type} onChange={(e) => onTypeChange(e.target.value as BilanType)} disabled={disabled || finalized} aria-label="Type de bilan" className={`h-7 rounded-md border text-xs font-medium px-2 ${c.bg} ${c.text} ${c.border}`}>
          {(Object.keys(BILAN_TYPE_LABELS) as BilanType[]).map((t) => <option key={t} value={t}>{BILAN_TYPE_LABELS[t]}</option>)}
        </select>

        <span className="flex-1" />
        {finalized ? <span className="text-[11px] font-medium rounded-full bg-green-100 text-green-700 px-2.5 py-0.5">Enregistré</span> : <SaveIndicator state={saveState} savedAt={savedAt} pending={pending} />}
      </div>
      {saveState === 'stale' && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 text-amber-900 text-xs px-4 py-2 border-t border-amber-200">
          <span>Ce bilan a été modifié sur un autre appareil. Recharge pour continuer : tes dernières frappes non enregistrées seront perdues.</span>
          <Button size="sm" variant="outline" onClick={onReload} className="h-7 text-xs"><RefreshCw className="h-3 w-3 mr-1" />Recharger</Button>
        </div>
      )}
    </div>
  );
}
