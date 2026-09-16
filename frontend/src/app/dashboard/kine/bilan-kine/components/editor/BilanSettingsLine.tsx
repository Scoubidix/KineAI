'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import PatientCombobox from '../PatientCombobox';
import { BILAN_TYPE_COLORS, BILAN_TYPE_LABELS, type BilanRecord, type BilanType, type PatientSummary } from '@/types/bilan';

const TYPES: BilanType[] = ['INITIAL', 'INTERMEDIAIRE', 'FINAL'];

interface BilanSettingsLineProps {
  record: BilanRecord;
  onBack: () => void;
  onTypeChange: (t: BilanType) => void;
  onPatientChange: (p: PatientSummary) => void;
  onMotifChange: (motif: string) => void;
  disabled?: boolean;
}

/**
 * Réglages du bilan, en phrase : « Bilan initial pour Marie DUPONT ». Même forme que l'accueil du
 * module — le kiné retrouve ce qu'il a choisi avant d'entrer, et peut le corriger sans quitter
 * l'écran. Montée par les trois chemins de prise de notes (écrire, dicter, séance).
 */
export default function BilanSettingsLine({ record, onBack, onTypeChange, onPatientChange, onMotifChange, disabled }: BilanSettingsLineProps) {
  const typeColor = BILAN_TYPE_COLORS[record.type];
  const [motifEditing, setMotifEditing] = useState(false);
  const [motifDraft, setMotifDraft] = useState('');
  // Échap doit annuler sans écrire : démonter l'Input retire le focus, et certains navigateurs
  // (Firefox) déclenchent quand même onBlur sur ce retrait. Le drapeau permet à onBlur de
  // reconnaître une annulation volontaire et de ne rien enregistrer dans ce cas.
  const motifCancelled = useRef(false);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-base text-muted-foreground">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 mr-1">
        <ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Bilans</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Type de bilan : ${BILAN_TYPE_LABELS[record.type]}. Changer de type`}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3899aa] ${typeColor.bg} ${typeColor.text} ${typeColor.border}`}
          >
            {BILAN_TYPE_LABELS[record.type]}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {TYPES.map((t) => (
            <DropdownMenuItem key={t} onSelect={() => onTypeChange(t)} className="text-sm">
              <Check className={`h-3.5 w-3.5 mr-2 ${record.type === t ? 'opacity-100 text-[#3899aa]' : 'opacity-0'}`} />
              {BILAN_TYPE_LABELS[t]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span>pour</span>
      <PatientCombobox variant="inline" clearable={false} value={record.patient} onChange={(p) => { if (p) onPatientChange(p); }} disabled={disabled} />

      {/* Motif : déduit de la dictée par le correcteur, corrigeable par le kiné. Édition en
          place plutôt qu'un champ de formulaire — il est rempli tout seul la plupart du temps. */}
      {motifEditing ? (
        <Input
          autoFocus
          value={motifDraft}
          onChange={(e) => setMotifDraft(e.target.value)}
          onBlur={() => {
            setMotifEditing(false);
            if (motifCancelled.current) return;
            const next = motifDraft.trim();
            // N'écrit que si la valeur a réellement changé : sinon un simple clic puis clic
            // ailleurs ferait bouger `updatedAt` pour rien (remontée artificielle dans les listes).
            if (next !== (record.motif ?? '')) onMotifChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.currentTarget.blur(); }
            if (e.key === 'Escape') { motifCancelled.current = true; setMotifEditing(false); }
          }}
          maxLength={120}
          aria-label="Motif du bilan"
          className="h-8 w-56 px-2.5 text-sm"
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => { motifCancelled.current = false; setMotifDraft(record.motif ?? ''); setMotifEditing(true); }}
          className={`inline-flex items-center h-8 rounded-md border px-2.5 text-sm font-medium transition-colors max-w-[14rem] ${
            record.motif
              ? 'border-input bg-background'
              : 'border-[#3899aa]/50 bg-[#3899aa]/10 text-[#3899aa] hover:bg-[#3899aa]/15'
          }`}
        >
          {/* `truncate` doit être sur un span : posé sur ce conteneur inline-flex, text-overflow
              ne s'applique pas à l'élément de flex anonyme et coupe le texte sans ellipse. */}
          <span className="truncate">{record.motif || 'Ajouter un motif'}</span>
        </button>
      )}
    </div>
  );
}
