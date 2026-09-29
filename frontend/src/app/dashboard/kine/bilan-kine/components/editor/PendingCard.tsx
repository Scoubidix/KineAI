'use client';
import React, { useMemo, useState } from 'react';
import { Quote } from 'lucide-react';
import { Input } from '@/components/ui/input';
import InlineMeasureSearch from '../InlineMeasureSearch';
import { formatCandidateValue } from './suggestions';
import type { Resolution, Retarget } from './review';
import type { CanonicalField, CanonicalValue, ExtractionReason, ReviewCandidate, Side } from '@/types/bilan';

interface PendingCardProps {
  candidate: ReviewCandidate;
  fields: CanonicalField[];
  onResolve: (id: string, r: Resolution) => void;
  /** Toucher la carte (hors boutons et champs) ou l'icône montre les notes, passage surligné */
  onShowQuote?: (quote: string) => void;
  disabled?: boolean;
}

type SideChoice = Side | 'DG';

const SIDE_WORDS: Record<Side, string> = { D: 'à droite', G: 'à gauche' };
const SIDE_OPTIONS: { key: SideChoice; label: string }[] = [
  { key: 'D', label: 'Droit' },
  { key: 'G', label: 'Gauche' },
  { key: 'DG', label: 'Les deux' },
];
const NO_LABELS = new Set<string>();

const isFilled = (v: CanonicalValue) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const targetOf = (f: CanonicalField): Retarget => ({
  kind: 'canonical', key: f.key, label: f.label, fieldType: f.type, unit: f.unit, lateralized: f.lateralized,
  presentation: f.presentation === 'NARRATIVE' ? 'narrative' : 'table',
});
const customTarget = (label: string): Retarget => ({ kind: 'custom', key: undefined, label, fieldType: 'TEXT', unit: null, lateralized: false, presentation: 'table' });

const btn = 'h-10 rounded-full px-4 text-sm font-medium disabled:opacity-50';
const filledBtn = `${btn} bg-[#3899aa] text-white hover:bg-[#3899aa]/90`;
const outlineBtn = `${btn} border border-[#3899aa] bg-white text-[#3899aa] dark:bg-card`;
const linkBtn = 'min-h-8 text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50';

// Choix exclusif en boutons (côté, résultat) : même geste que les réponses de la carte
function Segmented<T extends string | boolean>({ label, options, value, onChange, disabled }: { label: string; options: { key: T; label: string }[]; value: T | null; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-input">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          disabled={disabled}
          className={`h-10 px-2.5 text-sm font-medium transition-colors ${value === o.key ? 'bg-[#3899aa] text-white' : 'bg-background hover:bg-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Ligne à vérifier (spec 2026-09-26 §3.2), sur le modèle « Check your answers » du GOV.UK Design
 * System : la proposition en titre, ce que disent les notes, puis Confirmer ou Modifier. Seul ce
 * qui manque vraiment est demandé (le côté) ; répondre confirme le tout. Sans valeur utilisable,
 * la carte s'ouvre directement en saisie.
 */
export default function PendingCard({ candidate: c, fields, onResolve, onShowQuote, disabled }: PendingCardProps) {
  const fieldsByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const has = (...rs: ExtractionReason[]) => rs.some((r) => c.reasons.includes(r));
  const label = (c.kind === 'canonical' ? fieldsByKey.get(c.key ?? '')?.label : undefined) ?? c.label;
  const isConflict = has('conflict');
  const outOfRange = has('out_of_range');
  const askSide = c.lateralized && (c.side === null || has('side_absent', 'side_contradicted'));
  const forcedEdit = !isConflict && (outOfRange || !isFilled(c.value));

  const initialTarget: Retarget = { kind: c.kind, key: c.key, label, fieldType: c.fieldType, unit: c.unit, lateralized: c.lateralized, presentation: c.presentation };
  const initialValue: CanonicalValue = outOfRange ? null : c.value;
  const [editing, setEditing] = useState(forcedEdit);
  const [target, setTarget] = useState<Retarget>(initialTarget);
  const [changingTest, setChangingTest] = useState(false);
  const [side, setSide] = useState<SideChoice | null>(askSide ? null : c.side);
  // NUMERIC et TEXT : texte tel que tapé ; BOOLEAN et ENUM : le choix
  const [text, setText] = useState(initialValue === null || typeof initialValue === 'boolean' ? '' : String(initialValue));
  const [choice, setChoice] = useState<CanonicalValue>(initialValue);

  const keep = (r: { side?: SideChoice; value?: CanonicalValue; retarget?: Retarget } = {}) => onResolve(c.id, { kind: 'keep', ...r });
  const dismiss = () => onResolve(c.id, { kind: 'dismiss' });

  const targetField = target.kind === 'canonical' ? fieldsByKey.get(target.key ?? '') : undefined;
  const type = target.kind === 'custom' ? 'TEXT' : target.fieldType;
  const rangeMin = targetField?.rangeMin ?? null;
  const rangeMax = targetField?.rangeMax ?? null;
  const numeric = type === 'NUMERIC' && text.trim() !== '' ? Number(text.replace(',', '.')) : null;
  const numericOutOfRange = numeric !== null && !Number.isNaN(numeric) && ((rangeMin !== null && numeric < rangeMin) || (rangeMax !== null && numeric > rangeMax));
  const parsed: CanonicalValue | undefined =
    type === 'NUMERIC' ? (numeric === null || Number.isNaN(numeric) || numericOutOfRange ? undefined : numeric)
    : type === 'TEXT' ? (text.trim() === '' ? undefined : text.trim())
    : (choice === null ? undefined : choice);
  const canValidate = parsed !== undefined && (!target.lateralized || side !== null);

  const validate = () => {
    if (!canValidate) return;
    keep({ value: parsed, side: target.lateralized ? side! : undefined, retarget: target });
  };
  const cancel = () => {
    setTarget(initialTarget); setChangingTest(false); setSide(askSide ? null : c.side);
    setText(initialValue === null || typeof initialValue === 'boolean' ? '' : String(initialValue)); setChoice(initialValue);
    setEditing(false);
  };
  const retarget = (next: Retarget) => {
    // Un test d'un autre type ne garde pas la valeur (« 95 » n'a pas de sens pour un Lasègue)
    const nextType = next.kind === 'custom' ? 'TEXT' : next.fieldType;
    if (nextType !== type) { setText(''); setChoice(null); }
    if (next.lateralized && !target.lateralized) setSide(null);
    setTarget(next);
    setChangingTest(false);
  };

  const onCardClick = (e: React.MouseEvent) => {
    if (!onShowQuote || editing) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, label')) return;
    onShowQuote(c.quote);
  };

  const shown = formatCandidateValue(c);
  const doubt = (on: boolean, s: string) => (on ? <span className="text-amber-700 dark:text-amber-300">{s} ?</span> : s);
  const sideText = !askSide && c.side ? ` ${SIDE_WORDS[c.side]}` : '';
  // Titre : la proposition. La valeur n'y figure que si elle est utilisable (ni conflit, ni hors bornes)
  const showValue = !isConflict && !outOfRange && isFilled(c.value);
  const hint = isConflict
    ? <>Tu avais saisi <b>{formatCandidateValue({ value: c.existingValue ?? null, unit: c.unit })}</b>, tes notes disent <b>{shown}</b>.{outOfRange ? ' Valeur inhabituelle.' : ''}</>
    : outOfRange ? <>Tes notes disent <b>{shown}</b> : valeur inhabituelle, corrige-la.</>
    : has('result_contradicted') ? 'Tes notes semblent dire l’inverse.'
    : has('side_contradicted') ? 'Tes notes semblent indiquer l’autre côté.'
    : null;

  const row = (name: string, control: React.ReactNode) => (
    <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-sm text-muted-foreground">{name}</span>
      <div className="min-w-0">{control}</div>
    </div>
  );
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); validate(); } };
  const valueControl =
    type === 'BOOLEAN' ? (
      <Segmented label="Résultat" options={[{ key: false, label: 'Négatif' }, { key: true, label: 'Positif' }]} value={typeof choice === 'boolean' ? choice : null} onChange={setChoice} disabled={disabled} />
    ) : type === 'ENUM' ? (
      <select value={typeof choice === 'string' ? choice : ''} onChange={(e) => setChoice(e.target.value === '' ? null : e.target.value)} disabled={disabled} className="h-10 w-full rounded-md border border-input bg-background px-2 text-base md:text-sm">
        <option value="">— Choisir —</option>
        {(targetField?.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Input type="text" inputMode={type === 'NUMERIC' ? 'decimal' : 'text'} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter} disabled={disabled} aria-label="Valeur" className={`h-10 text-base md:text-sm ${type === 'NUMERIC' ? 'w-28' : 'w-full'}`} />
          {type === 'NUMERIC' && target.unit && <span className="shrink-0 text-sm text-muted-foreground">{target.unit}</span>}
        </div>
        {numericOutOfRange && (
          <span className="text-xs text-destructive">
            {rangeMin !== null && rangeMax !== null ? `Entre ${rangeMin} et ${rangeMax}` : rangeMin !== null ? `Supérieur à ${rangeMin}` : `Inférieur à ${rangeMax}`}
          </span>
        )}
      </div>
    );

  return (
    <div
      id={`pending-${c.id}`}
      data-pending
      tabIndex={-1}
      onClick={onCardClick}
      className={`rounded-md border-l-[3px] border-amber-500 bg-amber-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500 dark:bg-amber-500/10 ${onShowQuote && !editing ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words text-base font-semibold leading-snug">
          {doubt(has('name_absent', 'low_confidence'), label)}{sideText}
          {showValue && <> · {doubt(has('value_absent', 'result_uncertain', 'result_contradicted'), shown)}</>}
        </p>
        {onShowQuote && (
          <button type="button" onClick={() => onShowQuote(c.quote)} aria-label="Voir dans tes notes" title="Voir dans tes notes" className="-m-1 shrink-0 p-1 text-muted-foreground hover:text-[#3899aa]">
            <Quote className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-0.5 break-words text-[13px] italic leading-snug text-muted-foreground">« {c.quote} »</p>
      {hint && <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{hint}</p>}

      {isConflict ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {/* Valeur des notes hors bornes : elle ne peut pas remplacer la valeur saisie */}
          {!outOfRange && <button type="button" className={filledBtn} onClick={() => keep()} disabled={disabled}>Prendre {shown}</button>}
          <button type="button" className={outOfRange ? filledBtn : outlineBtn} onClick={dismiss} disabled={disabled}>Garder {formatCandidateValue({ value: c.existingValue ?? null, unit: c.unit })}</button>
        </div>
      ) : editing ? (
        <div className="mt-2.5 space-y-2">
          {row('Test', changingTest ? (
            <InlineMeasureSearch
              fields={fields}
              isExhausted={() => false}
              addedCustomLabels={NO_LABELS}
              onAddCanonical={(f) => retarget(targetOf(f))}
              onAddCustom={(l) => retarget(customTarget(l))}
              disabled={disabled}
              permanent
              placeholder="Chercher le bon test…"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="min-w-0 break-words text-sm font-medium">{target.label}</span>
              <button type="button" className={linkBtn} onClick={() => setChangingTest(true)} disabled={disabled}>Changer</button>
            </div>
          ))}
          {target.lateralized && row('Côté', <Segmented label="Côté" options={SIDE_OPTIONS} value={side} onChange={setSide} disabled={disabled} />)}
          {row(type === 'BOOLEAN' ? 'Résultat' : 'Valeur', valueControl)}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button type="button" className={filledBtn} onClick={validate} disabled={disabled || !canValidate}>Valider</button>
            {!forcedEdit && <button type="button" className={`${btn} text-muted-foreground`} onClick={cancel} disabled={disabled}>Annuler</button>}
            <button type="button" className={`${linkBtn} ml-auto`} onClick={dismiss} disabled={disabled}>Ne pas reprendre</button>
          </div>
        </div>
      ) : askSide ? (
        <>
          <p className="mt-2 text-[15px] font-semibold">Quel côté ?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SIDE_OPTIONS.map((o) => <button key={o.key} type="button" className={outlineBtn} onClick={() => keep({ side: o.key })} disabled={disabled}>{o.label}</button>)}
          </div>
          <button type="button" className={`${linkBtn} mt-1`} onClick={() => setEditing(true)} disabled={disabled}>Modifier</button>
        </>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={filledBtn} onClick={() => keep()} disabled={disabled}>Confirmer</button>
          <button type="button" className={outlineBtn} onClick={() => setEditing(true)} disabled={disabled}>Modifier</button>
        </div>
      )}
    </div>
  );
}
