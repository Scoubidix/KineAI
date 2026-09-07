'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, X, CheckCheck, HelpCircle, AlertTriangle, Quote } from 'lucide-react';
import SideSelector from '../SideSelector';
import { applyCandidate, findConflict, formatCandidateValue } from './suggestions';
import type { CanonicalValue, DocumentMeasurement, ExtractionCandidate, Side } from '@/types/bilan';

interface SuggestionsPanelProps {
  candidates: ExtractionCandidate[];
  rejectedCount: number;
  measurements: DocumentMeasurement[];
  onMeasurementsChange: (next: DocumentMeasurement[]) => void;
  onCandidatesChange: (next: ExtractionCandidate[]) => void;
  disabled?: boolean;
  activeId: string | null;
  onFocusQuote: (id: string) => void;
}

const fmt = (v: CanonicalValue): string => (typeof v === 'boolean' ? (v ? 'Positif' : 'Négatif') : v === null ? '—' : String(v));

// Bloc « Suggestions » de l'étape Vérification (spec §9.2) : chaque candidat est accepté ou rejeté
// explicitement ; « Tout accepter » ignore les conflits et les latéralisés dont le côté n'est pas résolu.
export default function SuggestionsPanel({ candidates, rejectedCount, measurements, onMeasurementsChange, onCandidatesChange, disabled, activeId, onFocusQuote }: SuggestionsPanelProps) {
  const [sides, setSides] = useState<Record<string, Side | null>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const sideOf = (c: ExtractionCandidate): Side | null => (c.id in sides ? sides[c.id] : c.side);
  const setSide = (c: ExtractionCandidate, side: Side | undefined) => {
    setSides((s) => ({ ...s, [c.id]: side ?? null }));
    setTouched((t) => new Set(t).add(c.id));
  };
  const sideResolved = (c: ExtractionCandidate) => !c.lateralized || sideOf(c) !== null || touched.has(c.id);

  // Recalculé à chaque rendu (liste courte) : le conflit dépend du côté choisi et des mesures courantes
  const rows = candidates.map((c) => ({ c, side: sideOf(c), conflict: findConflict(measurements, c, sideOf(c)) }));

  const remove = (id: string) => onCandidatesChange(candidates.filter((c) => c.id !== id));
  const accept = (c: ExtractionCandidate) => { onMeasurementsChange(applyCandidate(measurements, c, sideOf(c))); remove(c.id); };
  const acceptable = rows.filter((r) => r.conflict === undefined && sideResolved(r.c));
  const acceptAll = () => {
    let next = measurements;
    for (const r of acceptable) next = applyCandidate(next, r.c, r.side);
    onMeasurementsChange(next);
    const ids = new Set(acceptable.map((r) => r.c.id));
    onCandidatesChange(candidates.filter((c) => !ids.has(c.id)));
  };

  const confidenceIcon = (n: number) => {
    const cls = n >= 0.85 ? 'text-emerald-600' : n >= 0.6 ? 'text-amber-500' : 'text-muted-foreground';
    return <Tooltip><TooltipTrigger asChild><span className="inline-flex"><HelpCircle className={`h-3.5 w-3.5 ${cls}`} /></span></TooltipTrigger><TooltipContent>Confiance {Math.round(n * 100)} %</TooltipContent></Tooltip>;
  };

  return (
    <div className="rounded-xl border border-[#3899aa]/40 bg-[#3899aa]/5 p-3 flex flex-col gap-2" aria-label="Suggestions issues des notes">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[#3899aa]">{candidates.length} suggestion{candidates.length > 1 ? 's' : ''}{rejectedCount > 0 && <span className="font-normal text-muted-foreground"> · {rejectedCount} écartée{rejectedCount > 1 ? 's' : ''} faute de citation</span>}</span>
        <Button size="sm" variant="outline" onClick={acceptAll} disabled={disabled || acceptable.length === 0} className="h-7 text-xs rounded-full"><CheckCheck className="h-3.5 w-3.5 mr-1" />Tout accepter ({acceptable.length})</Button>
      </div>
      {candidates.length === 0 && <p className="text-xs text-muted-foreground italic">Aucune mesure reconnue dans les notes.</p>}
      <ul className="flex flex-col gap-1.5">
        {rows.map(({ c, side, conflict }) => (
          <li key={c.id} id={`cand-${c.id}`} className={`rounded-lg border bg-white dark:bg-card p-2 flex flex-col gap-1.5 ${activeId === c.id ? 'border-[#3899aa]' : 'border-border/60'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{c.label}</span>
              {c.kind === 'custom' && <span className="rounded bg-muted px-1.5 text-[10px]">Mesure libre</span>}
              <span className="text-sm font-semibold text-[#3899aa]">{formatCandidateValue(c)}</span>
              {c.warning === 'out_of_range' && <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 px-1.5 text-[10px]"><AlertTriangle className="h-3 w-3" />Hors bornes</span></TooltipTrigger><TooltipContent>Valeur inhabituelle : la ligne sera ajoutée vide, à saisir à la main</TooltipContent></Tooltip>}
              {confidenceIcon(c.confidence)}
              <span className="flex-1" />
              {c.lateralized && <SideSelector value={side ?? undefined} onChange={(s) => setSide(c, s)} disabled={disabled} />}
            </div>
            <button type="button" onClick={() => onFocusQuote(c.id)} className="text-left text-[11px] italic text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><Quote className="h-3 w-3 shrink-0" />« {c.quote} »</button>
            <div className="flex items-center gap-1.5 flex-wrap">
              {conflict !== undefined ? (
                <>
                  <span className="text-[11px] text-amber-700">Actuellement : {fmt(conflict)}</span>
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => accept(c)} disabled={disabled} className="h-7 text-xs">Remplacer</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)} disabled={disabled} className="h-7 text-xs">Garder l’actuelle</Button>
                </>
              ) : (
                <>
                  {c.lateralized && !sideResolved(c) && <span className="text-[11px] text-muted-foreground">Précise le côté</span>}
                  <span className="flex-1" />
                  <Button size="sm" onClick={() => accept(c)} disabled={disabled} className="btn-teal h-7 text-xs rounded-full"><Check className="h-3.5 w-3.5 mr-1" />Accepter</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)} disabled={disabled} className="h-7 text-xs" aria-label={`Rejeter ${c.label}`}><X className="h-3.5 w-3.5 mr-1" />Rejeter</Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
