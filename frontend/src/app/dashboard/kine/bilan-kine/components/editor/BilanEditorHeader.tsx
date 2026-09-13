'use client';
import React, { useState } from 'react';
import { ArrowLeft, User, ChevronDown, RefreshCw, AlertTriangle } from 'lucide-react';
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
  errorMessage: string | null;
  onReload: () => void;
  onRetry: () => void;
  onBack: () => void;
  disabled?: boolean;
}

export default function BilanEditorHeader({ record, onPatientChange, onTypeChange, saveState, savedAt, pending, errorMessage, onReload, onRetry, onBack, disabled }: BilanEditorHeaderProps) {
  const [patientOpen, setPatientOpen] = useState(false);
  const c = BILAN_TYPE_COLORS[record.type];
  const finalized = record.status === 'ENREGISTRE';

  return (
    <div className="border-b border-border/40">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2"><ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Bilans</span></Button>

        {/* Le patient peut n'avoir pas été choisi au démarrage : tant qu'il manque, le
            sélecteur se porte en appel à l'action plutôt qu'en réglage discret. */}
        <Popover open={patientOpen} onOpenChange={setPatientOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || finalized}
              className={`inline-flex items-center gap-1.5 h-8 rounded-md border px-2.5 text-sm font-medium transition-colors ${
                record.patient
                  ? 'border-input bg-background'
                  : 'border-[#3899aa]/50 bg-[#3899aa]/10 text-[#3899aa] hover:bg-[#3899aa]/15'
              }`}
            >
              {record.patient ? (
                <span className="w-5 h-5 shrink-0 rounded-full bg-[#3899aa]/10 text-[#3899aa] text-[10px] font-semibold inline-flex items-center justify-center">
                  {record.patient.firstName[0]}{record.patient.lastName[0]}
                </span>
              ) : (
                <User className="h-4 w-4 shrink-0" />
              )}
              {record.patient ? `${record.patient.firstName} ${record.patient.lastName.toUpperCase()}` : 'Choisir le patient'}
              {!finalized && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <p className="text-xs text-muted-foreground mb-2">Patient de ce bilan</p>
            <PatientCombobox value={record.patient} onChange={(p) => { onPatientChange(p); setPatientOpen(false); }} />
          </PopoverContent>
        </Popover>

        <select value={record.type} onChange={(e) => onTypeChange(e.target.value as BilanType)} disabled={disabled || finalized} aria-label="Type de bilan" className={`h-8 rounded-md border text-sm font-medium px-2 ${c.bg} ${c.text} ${c.border}`}>
          {(Object.keys(BILAN_TYPE_LABELS) as BilanType[]).map((t) => <option key={t} value={t}>{BILAN_TYPE_LABELS[t]}</option>)}
        </select>

        <span className="flex-1" />
        {finalized ? (
          <>
            <SaveIndicator state={saveState} savedAt={savedAt} pending={pending} />
            <span className="text-[11px] font-medium rounded-full bg-green-100 text-green-700 px-2.5 py-0.5">Enregistré</span>
          </>
        ) : (
          <SaveIndicator state={saveState} savedAt={savedAt} pending={pending} />
        )}
      </div>
      {saveState === 'stale' && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 text-amber-900 text-xs px-4 py-2 border-t border-amber-200">
          <span>Ce bilan a été modifié sur un autre appareil. Recharge pour continuer : tes dernières frappes non enregistrées seront perdues.</span>
          <Button size="sm" variant="outline" onClick={onReload} className="h-7 text-xs"><RefreshCw className="h-3 w-3 mr-1" />Recharger</Button>
        </div>
      )}
      {saveState === 'error' && (
        <div className="flex items-center justify-between gap-3 bg-red-50 text-red-900 text-xs px-4 py-2 border-t border-red-200">
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Sauvegarde impossible : {errorMessage}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs"><RefreshCw className="h-3 w-3 mr-1" />Réessayer</Button>
            <Button size="sm" variant="outline" onClick={onReload} className="h-7 text-xs">Recharger</Button>
          </div>
        </div>
      )}
    </div>
  );
}
