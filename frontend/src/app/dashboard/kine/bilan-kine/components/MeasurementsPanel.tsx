'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Activity, Layers, ChevronDown, CheckCircle2, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import {
  CanonicalField,
  DocumentMeasurement,
  CanonicalValue,
  Side,
  Presentation,
  BilanTemplate,
  ReviewCandidate,
} from '@/types/bilan';
import InlineMeasureSearch from './InlineMeasureSearch';
import ApplyTemplateModal from './ApplyTemplateModal';
import SideSelector from './SideSelector';
import TestGuideButton from '@/components/bilan/TestGuideButton';
import { measurementIdentity, measureRowId } from './editor/suggestions';
import type { Resolution } from './editor/review';
import PendingCard from './editor/PendingCard';

interface MeasurementsPanelProps {
  measurements: DocumentMeasurement[];
  onChange: (next: DocumentMeasurement[]) => void;
  disabled?: boolean;
  /** Bilan de suivi : valeur du bilan de référence par identité de mesure, affichée « préc. … » */
  previousValues?: Map<string, CanonicalValue>;
  /** Étape Mesures : lignes à vérifier, rendues dans la catégorie de leur champ (spec 2026-09-26 §3.2) */
  pending?: ReviewCandidate[];
  onResolve?: (id: string, r: Resolution) => void;
  /** Étape Mesures : l'icône de citation (ou le libellé) montre les notes surlignées. Sans elle, l'icône n'est qu'un repère. */
  onShowQuote?: (quote: string) => void;
  /** Étape Mesures : pas de barre de progression, le décompte est dans l'en-tête de l'étape */
  hideProgress?: boolean;
  /** Retrait d'une ligne (les deux côtés pour un test latéralisé) géré par l'hôte : il mémorise les lignes venues des notes */
  onRemove?: (indices: number[]) => void;
  /** Conteneur étroit (tiroir, feuille du bas) : la ligne s'empile au lieu de se couper */
  dense?: boolean;
}

const CUSTOM_CATEGORY = 'Mesures libres';
const UNKNOWN_CATEGORY = 'Champs inconnus';

// Une valeur canonique est "saisie" si elle n'est ni null/undefined ni string vide.
// 0 et false sont des valeurs valides → considérés comme saisis.
const isCanonicalFilled = (v: CanonicalValue): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
};

interface RowWithIndex {
  measurement: DocumentMeasurement;
  index: number; // index dans measurements (clé pour les handlers)
  field?: CanonicalField; // résolu pour les canoniques
}

// Test latéralisé : ses côtés D et G sur une seule ligne, en colonnes (forme du tableau du PDF,
// bilanRenderer/examen.js). Un côté absent est une case vide qu'on remplit directement.
interface PairRow {
  field: CanonicalField;
  D?: RowWithIndex;
  G?: RowWithIndex;
}
type DisplayRow = { kind: 'row'; row: RowWithIndex } | { kind: 'pair'; pair: PairRow };
// Gauche à gauche, droite à droite : l'ordre de l'écran suit le côté du corps
const SIDES: Side[] = ['G', 'D'];
const SIDE_LABELS: Record<Side, string> = { D: 'Droit', G: 'Gauche' };

export default function MeasurementsPanel({
  measurements,
  onChange,
  disabled = false,
  previousValues,
  pending,
  onResolve,
  onShowQuote,
  onRemove,
  dense = false,
  hideProgress = false,
}: MeasurementsPanelProps) {
  const { toast } = useToast();
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  // Cases NUMERIC dont la dernière saisie était hors bornes (message d'aide local). Clé de case :
  // l'index de la mesure, ou `new:<clé>:<côté>` pour la case vide d'un test latéralisé.
  const [rangeHints, setRangeHints] = useState<Map<string, string>>(new Map());
  // Brouillon local par ligne NUMERIC (texte tel que tapé, tant qu'il n'est pas commis) :
  // permet de taper un nombre dont un préfixe est hors bornes (ex. "35" dans un champ 20-80,
  // le "3" seul est < 20) sans que l'input contrôlé ne revienne écraser la frappe en cours.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchFields = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/bilan-fields`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setFields(json.fields);
      } catch {
        // silent
      }
    };
    fetchFields();
  }, []);

  const fieldsByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  // Identité d'une mesure canonique = (key, side). Un champ latéralisé peut donc
  // exister deux fois dans measurements (D puis G).
  const addedCanonical = useMemo(
    () =>
      new Set(
        measurements
          .filter((m) => m.kind === 'canonical')
          .map((m) => `${(m as Extract<DocumentMeasurement, { kind: 'canonical' }>).key}|${(m as Extract<DocumentMeasurement, { kind: 'canonical' }>).side ?? ''}`),
      ),
    [measurements],
  );
  const hasCanonical = (key: string, side?: Side) => addedCanonical.has(`${key}|${side ?? ''}`);
  // Un champ est "complet" (plus proposable) dès qu'il a une ligne : un test latéralisé porte ses
  // deux côtés sur la même ligne, le côté manquant est une case vide.
  const isFieldExhausted = (field: CanonicalField) =>
    hasCanonical(field.key) || hasCanonical(field.key, 'D') || hasCanonical(field.key, 'G');

  const addedCustomLabels = useMemo(
    () =>
      new Set(
        measurements
          .filter((m) => m.kind === 'custom')
          .map((m) => (m as Extract<DocumentMeasurement, { kind: 'custom' }>).label.trim().toLowerCase()),
      ),
    [measurements],
  );

  const handleAddCanonical = (field: CanonicalField) => {
    if (isFieldExhausted(field)) return;
    let side: Side | undefined;
    if (field.lateralized) side = !hasCanonical(field.key, 'D') ? 'D' : 'G';
    const presentation: Presentation = field.presentation === 'NARRATIVE' ? 'narrative' : 'table';
    onChange([
      ...measurements,
      { kind: 'canonical', key: field.key, value: null, ...(side ? { side } : {}), presentation, origin: 'manual' },
    ]);
  };

  const handleAddCustom = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || addedCustomLabels.has(trimmed.toLowerCase())) return;
    onChange([...measurements, { kind: 'custom', label: trimmed, value: '', presentation: 'table', origin: 'manual' }]);
  };

  const handleRemoveAt = (indices: number[]) => {
    if (onRemove) onRemove(indices);
    else onChange(measurements.filter((_, i) => !indices.includes(i)));
    // Les index décalent après suppression : on repart d'un état propre plutôt que
    // de remapper les brouillons/hints (aucune ligne n'est en cours de frappe à ce moment).
    setDrafts({});
    setRangeHints(new Map());
  };

  const handleChangeAt = (index: number, value: CanonicalValue | string) => {
    onChange(
      measurements.map((m, i) => {
        if (i !== index) return m;
        // Une valeur saisie par le kiné rend la mesure "manuelle", même si elle
        // provenait d'un bilan antérieur ou d'une extraction IA.
        if (m.kind === 'canonical') return { ...m, value: value as CanonicalValue, origin: 'manual' };
        return { ...m, value: (value ?? '') as string, origin: 'manual' };
      }),
    );
  };

  // Case vide d'un test latéralisé : la première saisie crée la mesure de ce côté
  const handleAddSide = (field: CanonicalField, side: Side, value: CanonicalValue) => {
    if (value === null || hasCanonical(field.key, side)) return;
    const presentation: Presentation = field.presentation === 'NARRATIVE' ? 'narrative' : 'table';
    onChange([...measurements, { kind: 'canonical', key: field.key, value, side, presentation, origin: 'manual' }]);
  };

  const handleSideAt = (index: number, side: Side | undefined) => {
    const m = measurements[index];
    if (m.kind !== 'canonical') return;
    if (hasCanonical(m.key, side) && (m.side ?? undefined) !== side) {
      toast({ title: 'Déjà saisi', description: 'Cette mesure existe déjà de ce côté', variant: 'destructive' });
      return;
    }
    onChange(
      measurements.map((x, i) => {
        if (i !== index || x.kind !== 'canonical') return x;
        const { side: _previous, ...rest } = x;
        return side ? { ...rest, side } : rest;
      }),
    );
  };

  // Application non-destructive d'un template : ajoute les items du template
  // qui ne sont pas déjà dans measurements, à la fin, dans l'ordre du template.
  // Les valeurs déjà saisies dans le bilan en cours ne sont jamais touchées.
  const handleApplyTemplate = (template: BilanTemplate) => {
    const existingLabels = new Set(addedCustomLabels);
    const toAdd: DocumentMeasurement[] = [];
    const touchedCategories = new Set<string>();

    for (const item of template.items) {
      if (item.kind === 'canonical') {
        const field = fieldsByKey.get(item.key);
        // Champ inconnu au catalogue : on ne l'ajoute qu'une fois (aucune notion de côté).
        if (!field) {
          const already =
            measurements.some((m) => m.kind === 'canonical' && m.key === item.key) ||
            toAdd.some((m) => m.kind === 'canonical' && m.key === item.key);
          if (already) continue;
          toAdd.push({ kind: 'canonical', key: item.key, value: null, presentation: 'table', origin: 'manual' });
          touchedCategories.add(UNKNOWN_CATEGORY);
          continue;
        }
        const presentation: Presentation = field.presentation === 'NARRATIVE' ? 'narrative' : 'table';
        if (field.lateralized) {
          // D puis G, comme l'ajout manuel ; rien si les deux côtés existent déjà (dans measurements ou dans toAdd).
          const has = (side: Side) =>
            hasCanonical(field.key, side) || toAdd.some((m) => m.kind === 'canonical' && m.key === field.key && m.side === side);
          const side: Side | null = !has('D') ? 'D' : !has('G') ? 'G' : null;
          if (!side) continue;
          toAdd.push({ kind: 'canonical', key: field.key, value: null, side, presentation, origin: 'manual' });
        } else {
          if (isFieldExhausted(field) || toAdd.some((m) => m.kind === 'canonical' && m.key === field.key)) continue;
          toAdd.push({ kind: 'canonical', key: field.key, value: null, presentation, origin: 'manual' });
        }
        touchedCategories.add(field.category ?? UNKNOWN_CATEGORY);
      } else {
        const labelKey = item.label.trim().toLowerCase();
        if (existingLabels.has(labelKey)) continue;
        existingLabels.add(labelKey);
        toAdd.push({ kind: 'custom', label: item.label, value: '', presentation: 'table', origin: 'manual' });
        touchedCategories.add(CUSTOM_CATEGORY);
      }
    }

    onChange([...measurements, ...toAdd]);

    // Une catégorie où on vient d'ajouter des mesures vides ne doit plus être
    // collapsed (sinon le user ne voit pas où ses nouvelles mesures sont arrivées).
    if (touchedCategories.size > 0) {
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        for (const c of touchedCategories) next.delete(c);
        return next;
      });
    }
  };

  // Groupes par catégorie. L'ordre des catégories suit la première apparition
  // de chaque cat dans measurements (donc piloté par l'ordre du template ou
  // par l'ordre d'ajout manuel — c'est la source de vérité unique).
  const groups = useMemo(() => {
    const map = new Map<string, RowWithIndex[]>();
    measurements.forEach((m, index) => {
      const cat = m.kind === 'custom'
        ? CUSTOM_CATEGORY
        : fieldsByKey.get(m.key)?.category ?? UNKNOWN_CATEGORY;
      if (!map.has(cat)) map.set(cat, []);
      const field = m.kind === 'canonical' ? fieldsByKey.get(m.key) : undefined;
      map.get(cat)!.push({ measurement: m, index, field });
    });
    return map;
  }, [measurements, fieldsByKey]);

  const pendingItems = useMemo(() => pending ?? [], [pending]);
  // Lignes à vérifier rangées dans la catégorie de leur champ, comme les mesures
  const pendingByCategory = useMemo(() => {
    const map = new Map<string, ReviewCandidate[]>();
    for (const c of pendingItems) {
      const cat = c.kind === 'custom' ? CUSTOM_CATEGORY : fieldsByKey.get(c.key ?? '')?.category ?? UNKNOWN_CATEGORY;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    return map;
  }, [pendingItems, fieldsByKey]);
  // Ordre des catégories : celui des mesures, puis celles qui n'ont que des lignes à vérifier. Il
  // reste stable tant que le panneau est ouvert : une catégorie qui ne portait que des cartes ne
  // change pas de place quand sa première ligne arrive (rien ne doit sauter pendant la vérification).
  const categoryOrderRef = useRef<string[]>([]);
  const categoryOrder = useMemo(() => {
    const current = [...groups.keys(), ...[...pendingByCategory.keys()].filter((c) => !groups.has(c))];
    const kept = categoryOrderRef.current.filter((c) => current.includes(c));
    const next = [...kept, ...current.filter((c) => !kept.includes(c))];
    categoryOrderRef.current = next;
    return next;
  }, [groups, pendingByCategory]);

  const stats = useMemo(() => {
    const cats = new Map<string, { filled: number; total: number }>();
    for (const [cat, rows] of groups.entries()) {
      let filled = 0;
      for (const r of rows) {
        if (r.measurement.kind === 'canonical') {
          if (isCanonicalFilled(r.measurement.value)) filled++;
        } else if (r.measurement.value.trim() !== '') {
          filled++;
        }
      }
      cats.set(cat, { filled, total: rows.length });
    }
    let globalFilled = 0;
    let globalTotal = 0;
    for (const s of cats.values()) {
      globalFilled += s.filled;
      globalTotal += s.total;
    }
    return { cats, globalFilled, globalTotal };
  }, [groups]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const renderCanonicalInput = (
    field: CanonicalField,
    value: CanonicalValue,
    cell: string,
    commit: (v: CanonicalValue) => void,
    // Case d'une colonne D/G : le champ prend la largeur de la case au lieu d'une largeur fixe
    fluid = false,
  ) => {
    switch (field.type) {
      case 'NUMERIC': {
        const hint = rangeHints.get(cell);
        const { rangeMin, rangeMax } = field;
        const outOfRangeHint = () =>
          rangeMin !== null && rangeMax !== null
            ? `Entre ${rangeMin} et ${rangeMax}`
            : rangeMin !== null
            ? `Supérieur à ${rangeMin}`
            : `Inférieur à ${rangeMax}`;
        const clearHint = () => setRangeHints((prev) => { if (!prev.has(cell)) return prev; const next = new Map(prev); next.delete(cell); return next; });
        const clearDraft = () => setDrafts((prev) => { if (!(cell in prev)) return prev; const next = { ...prev }; delete next[cell]; return next; });
        const draft = drafts[cell];
        const displayValue = draft ?? (value === null || value === undefined ? '' : String(value as number));
        return (
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Input
                type="number"
                value={displayValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    commit(null);
                    clearHint();
                    clearDraft();
                    return;
                  }
                  const n = Number(raw);
                  if (Number.isNaN(n)) {
                    // Brouillon gardé tel quel (ex. "-" en cours de frappe), pas de commit
                    setDrafts((prev) => ({ ...prev, [cell]: raw }));
                    return;
                  }
                  const outOfRange = (rangeMin !== null && n < rangeMin) || (rangeMax !== null && n > rangeMax);
                  if (outOfRange) {
                    // Hors bornes : le brouillon reste affiché (la frappe continue), on ne persiste pas
                    setDrafts((prev) => ({ ...prev, [cell]: raw }));
                    setRangeHints((prev) => new Map(prev).set(cell, outOfRangeHint()));
                    return;
                  }
                  clearHint();
                  clearDraft();
                  commit(n);
                }}
                onBlur={() => {
                  if (!(cell in drafts)) return;
                  const raw = drafts[cell];
                  const n = Number(raw);
                  const valid = raw !== '' && !Number.isNaN(n) && !((rangeMin !== null && n < rangeMin) || (rangeMax !== null && n > rangeMax));
                  if (valid) {
                    // Cas défensif : un brouillon valide n'a normalement pas survécu à l'onChange
                    // (déjà commis et effacé) — on le commet par sécurité et on efface le hint.
                    clearHint();
                    commit(n);
                  }
                  // Sinon : brouillon hors bornes ou NaN abandonné, le champ revient à la
                  // dernière valeur commise, le hint reste visible pour expliquer pourquoi.
                  clearDraft();
                }}
                min={rangeMin ?? undefined}
                max={rangeMax ?? undefined}
                disabled={disabled}
                className={`h-8 text-base md:text-sm ${fluid ? 'w-full min-w-0' : 'w-28'}`}
              />
              {field.unit && <span className="text-xs text-muted-foreground shrink-0">{field.unit}</span>}
            </div>
            {hint && <span className="text-[10px] text-destructive">{hint}</span>}
          </div>
        );
      }
      case 'BOOLEAN':
        return (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => commit(false)}
              disabled={disabled}
              className={`${fluid ? 'flex-1 min-w-0 px-1' : 'px-3'} py-1 rounded-l text-xs font-medium transition-colors ${
                value === false ? 'bg-[#3899aa] text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Négatif
            </button>
            <button
              type="button"
              onClick={() => commit(true)}
              disabled={disabled}
              className={`${fluid ? 'flex-1 min-w-0 px-1' : 'px-3'} py-1 rounded-r text-xs font-medium transition-colors ${
                value === true ? 'bg-[#3899aa] text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Positif
            </button>
          </div>
        );
      case 'TEXT':
        return (
          <Input
            type="text"
            value={value === null || value === undefined ? '' : (value as string)}
            onChange={(e) => commit(e.target.value === '' ? null : e.target.value)}
            disabled={disabled}
            className="h-8 text-base md:text-sm flex-1 min-w-0"
          />
        );
      case 'ENUM':
        return (
          <select
            value={value === null || value === undefined ? '' : (value as string)}
            onChange={(e) => commit(e.target.value === '' ? null : e.target.value)}
            disabled={disabled}
            className="h-8 text-base md:text-sm rounded-md border border-input bg-background px-2 flex-1 min-w-0"
          >
            <option value="">— Choisir —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  // Citation des notes : une icône sur la ligne, sans hauteur en plus. À l'étape Mesures elle (comme
  // le libellé) ouvre les notes surlignées ; ailleurs (tiroir, consultation) c'est un simple repère.
  const renderQuote = (m: DocumentMeasurement) => {
    if (!m.quote) return null;
    if (onShowQuote) {
      const q = m.quote;
      return (
        <button type="button" onClick={() => onShowQuote(q)} aria-label="Voir dans tes notes" title="Voir dans tes notes" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-[#3899aa]">
          <Quote className="h-3.5 w-3.5" />
        </button>
      );
    }
    return <span title={`D’après tes notes : « ${m.quote} »`} aria-label={`D’après tes notes : ${m.quote}`} className="inline-flex shrink-0 text-muted-foreground"><Quote className="h-3 w-3" /></span>;
  };

  const formatPrevious = (v: CanonicalValue, unit?: string | null): string => {
    if (typeof v === 'boolean') return v ? 'Positif' : 'Négatif';
    if (typeof v === 'number') return unit ? (unit.startsWith('/') ? `${v}${unit}` : `${v} ${unit}`) : String(v);
    return String(v);
  };
  const renderPrevious = (m: DocumentMeasurement, unit?: string | null) => {
    const v = previousValues?.get(measurementIdentity(m)) ?? (m.kind === 'canonical' && m.side ? previousValues?.get(`c:${m.key}:`) : undefined);
    return v === undefined ? null : <span title="Valeur du bilan de référence" className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">préc. {formatPrevious(v, unit)}</span>;
  };

  /**
   * Une ligne de mesure. En conteneur étroit (tiroir de 380 px, feuille du bas sur téléphone),
   * la ligne s'empile : le libellé prend sa propre ligne et se replie librement, le champ et la
   * valeur antérieure passent dessous. Sinon tout tient sur une ligne, comme avant.
   *
   * Les réglages rares — présentation en tableau ou dans le texte, citation des notes — passent
   * derrière un menu par ligne quand la place manque : ce sont des choix qu'on fait une fois.
   */
  const renderRow = (row: RowWithIndex) => {
    const m = row.measurement;
    const label = m.kind === 'canonical' ? row.field?.label ?? m.key : m.label;
    const labelTitle = m.kind === 'canonical' && row.field?.description ? `${label} — ${row.field.description}` : label;

    if (m.kind === 'canonical' && !row.field) {
      return (
        <div key={`row-${row.index}`} className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20">
          <span className="text-sm flex-1 min-w-0 text-muted-foreground italic break-words">Champ inconnu : {m.key}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAt([row.index])} className="h-6 w-6 p-0 shrink-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    const field = row.field;
    const guideButton = m.kind === 'canonical' && field?.hasGuide
      ? <TestGuideButton fieldKey={field.key} label={field.label} />
      : null;
    const sideSelector = m.kind === 'canonical' && field?.lateralized
      ? <SideSelector value={m.side} onChange={(s) => handleSideAt(row.index, s)} disabled={disabled} />
      : null;
    const input = m.kind === 'canonical' && field
      ? renderCanonicalInput(field, m.value, String(row.index), (v) => handleChangeAt(row.index, v))
      : (
        <Input
          type="text"
          value={m.kind === 'custom' ? m.value : ''}
          onChange={(e) => handleChangeAt(row.index, e.target.value)}
          placeholder="Valeur libre"
          disabled={disabled}
          className="h-8 text-base md:text-sm flex-1 min-w-0"
        />
      );
    const previous = renderPrevious(m, m.kind === 'canonical' ? field?.unit : undefined);
    const removeButton = (
      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAt([row.index])} disabled={disabled} className="h-6 w-6 p-0 shrink-0">
        <X className="h-3 w-3" />
      </Button>
    );
    const labelClass = `text-sm font-medium leading-snug break-words hyphens-auto${m.kind === 'custom' ? ' italic text-muted-foreground' : ''}${onShowQuote && m.quote ? ' cursor-pointer' : ''}`;
    // Le libellé d'une ligne venue des notes ouvre aussi les notes (cible plus grande que l'icône)
    const openNotes = onShowQuote && m.quote ? () => onShowQuote(m.quote!) : undefined;

    if (dense) {
      return (
        <div key={`row-${row.index}`} data-measure-row={measurementIdentity(m)} className="px-2 py-1.5 rounded hover:bg-muted/40">
          <div className="flex items-start gap-2">
            <span className={`${labelClass} flex-1 min-w-0`} title={labelTitle} onClick={openNotes}>{label}</span>
            {guideButton}
            {renderQuote(m)}
            {removeButton}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {sideSelector}
            {input}
            {previous}
          </div>
        </div>
      );
    }

    return (
      <div key={`row-${row.index}`} data-measure-row={measurementIdentity(m)} className="px-2 py-1.5 rounded hover:bg-muted/40">
        <div className="flex items-start gap-2">
          <span className="flex min-h-8 w-36 shrink-0 items-center gap-1 sm:w-56">
            <span className={`${labelClass} min-w-0`} title={labelTitle} onClick={openNotes}>{label}</span>
            {guideButton}
          </span>
          {sideSelector}
          {input}
          {previous}
          {renderQuote(m)}
          {removeButton}
        </div>
      </div>
    );
  };

  // Lignes d'une catégorie, les deux côtés d'un test latéralisé réunis à la place du premier
  // rencontré. Un latéralisé sans côté précisé (anciens bilans) reste une ligne seule, avec son
  // sélecteur de côté pour le ranger.
  const toDisplay = (rows: RowWithIndex[]): DisplayRow[] => {
    const out: DisplayRow[] = [];
    const pairs = new Map<string, PairRow>();
    for (const row of rows) {
      const m = row.measurement;
      if (m.kind === 'canonical' && row.field?.lateralized && m.side) {
        let pair = pairs.get(m.key);
        if (!pair) { pair = { field: row.field }; pairs.set(m.key, pair); out.push({ kind: 'pair', pair }); }
        // Même côté en double (ne devrait pas exister) : la seconde ligne reste visible, à part
        if (pair[m.side]) out.push({ kind: 'row', row });
        else pair[m.side] = row;
        continue;
      }
      out.push({ kind: 'row', row });
    }
    return out;
  };

  /**
   * Test latéralisé : libellé, puis une case par côté. Une case vide se remplit directement (la
   * première saisie crée la mesure de ce côté) ; la croix retire les deux côtés. La lettre G/D
   * est dans chaque case : un en-tête de colonnes ne se lit plus dès qu'une ligne non latéralisée
   * s'intercale.
   */
  const renderPair = (pair: PairRow) => {
    const { field } = pair;
    const rows = SIDES.map((s) => pair[s]).filter((r): r is RowWithIndex => r !== undefined);
    const quoted = rows.find((r) => r.measurement.quote)?.measurement;
    const openNotes = onShowQuote && quoted?.quote ? () => onShowQuote(quoted.quote!) : undefined;
    const labelTitle = field.description ? `${field.label} — ${field.description}` : field.label;
    const head = (
      <>
        <span className={`text-sm font-medium leading-snug break-words hyphens-auto min-w-0${dense ? ' flex-1' : ''}${openNotes ? ' cursor-pointer' : ''}`} title={labelTitle} onClick={openNotes}>{field.label}</span>
        {field.hasGuide && <TestGuideButton fieldKey={field.key} label={field.label} />}
        {quoted && renderQuote(quoted)}
      </>
    );
    const removeButton = (
      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAt(rows.map((r) => r.index))} disabled={disabled} aria-label={`Retirer ${field.label}`} className="h-6 w-6 p-0 shrink-0">
        <X className="h-3 w-3" />
      </Button>
    );
    const cells = (
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
        {SIDES.map((s) => {
          const row = pair[s];
          const m = row?.measurement;
          const value = m && m.kind === 'canonical' ? m.value : null;
          // Case vide : une mesure fictive, pour retrouver la valeur du bilan de référence
          const virtual: DocumentMeasurement = m ?? { kind: 'canonical', key: field.key, side: s, value: null, presentation: 'table', origin: 'manual' };
          const commit = (v: CanonicalValue) => (row ? handleChangeAt(row.index, v) : handleAddSide(field, s, v));
          return (
            <div key={s} className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="w-3 shrink-0 text-xs font-semibold text-muted-foreground" title={SIDE_LABELS[s]}>{s}</span>
                {renderCanonicalInput(field, value, row ? String(row.index) : `new:${field.key}:${s}`, commit, true)}
              </div>
              {renderPrevious(virtual, field.unit)}
            </div>
          );
        })}
      </div>
    );

    if (dense) {
      return (
        <div key={`pair-${field.key}`} data-measure-row={`c:${field.key}`} className="px-2 py-1.5 rounded hover:bg-muted/40">
          <div className="flex items-start gap-2">{head}{removeButton}</div>
          <div className="mt-1 flex">{cells}</div>
        </div>
      );
    }
    return (
      <div key={`pair-${field.key}`} data-measure-row={`c:${field.key}`} className="px-2 py-1.5 rounded hover:bg-muted/40">
        <div className="flex items-start gap-2">
          <span className="flex min-h-8 w-36 shrink-0 items-center gap-1 sm:w-56">{head}</span>
          {cells}
          {removeButton}
        </div>
      </div>
    );
  };

  const renderRows = (rows: RowWithIndex[]) => toDisplay(rows).map((d) => (d.kind === 'pair' ? renderPair(d.pair) : renderRow(d.row)));

  /**
   * Lignes d'une catégorie avec ses cartes à vérifier, chacune à l'endroit où sa ligne arrivera
   * (continuité spatiale : la carte devient la ligne sur place) : sous la ligne existante du même
   * test (autre côté, conflit), sinon en fin de catégorie, là où une nouvelle ligne est ajoutée.
   */
  const renderCategory = (rows: RowWithIndex[], cards: ReviewCandidate[]) => {
    const display = toDisplay(rows);
    const anchorOf = (d: DisplayRow) => (d.kind === 'pair' ? `c:${d.pair.field.key}` : measurementIdentity(d.row.measurement));
    const anchors = new Set(display.map(anchorOf));
    const underRow = new Map<string, ReviewCandidate[]>();
    const tail: ReviewCandidate[] = [];
    for (const c of cards) {
      const a = measureRowId(c);
      if (anchors.has(a)) underRow.set(a, [...(underRow.get(a) ?? []), c]);
      else tail.push(c);
    }
    return (
      <>
        {display.map((d) => (
          <React.Fragment key={d.kind === 'pair' ? `pair-${d.pair.field.key}` : `row-${d.row.index}`}>
            {d.kind === 'pair' ? renderPair(d.pair) : renderRow(d.row)}
            {(underRow.get(anchorOf(d)) ?? []).map(renderPending)}
          </React.Fragment>
        ))}
        {tail.map(renderPending)}
      </>
    );
  };

  // Ligne à vérifier, à sa place dans le tableau (spec 2026-09-26 §3.2)
  const renderPending = (c: ReviewCandidate) => (
    <PendingCard key={`pending-${c.id}`} candidate={c} fields={fields} onResolve={(id, r) => onResolve?.(id, r)} onShowQuote={onShowQuote} disabled={disabled} />
  );

  const hasMeasures = stats.globalTotal > 0;
  const progressPercent =
    stats.globalTotal === 0 ? 0 : Math.round((stats.globalFilled / stats.globalTotal) * 100);
  const pendingCount = pendingItems.length;
  const showTable = hasMeasures || pendingCount > 0;

  // Mode compact : 1 seule catégorie ET ≤ 4 mesures → on saute les headers,
  // rendu identique au comportement initial pour les petits bilans.
  const isCompactMode = groups.size <= 1 && stats.globalTotal <= 4 && pendingCount === 0;

  return (
    <div className="border border-border/60 rounded-xl bg-white dark:bg-card p-3 space-y-2">
      <InlineMeasureSearch
        fields={fields}
        isExhausted={isFieldExhausted}
        addedCustomLabels={addedCustomLabels}
        onAddCanonical={handleAddCanonical}
        onAddCustom={handleAddCustom}
        disabled={disabled}
        permanent
        trailing={hasMeasures ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setApplyTemplateOpen(true)} disabled={disabled} aria-label="Appliquer un template" title="Appliquer un template" className="h-9 w-9 p-0 shrink-0 text-[#3899aa]">
            <Layers className="h-4 w-4" />
          </Button>
        ) : undefined}
      />

      {/* Tableau vide : c'est le seul moment où le template mérite de la place. Une fois des
          mesures saisies, il redevient une icône à côté du champ d'ajout. */}
      {!showTable && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Activity className="h-5 w-5 text-[#3899aa]/50" />
          <p className="text-xs text-muted-foreground">Cherche un test ci-dessus, ou pars d’une liste toute prête.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setApplyTemplateOpen(true)} disabled={disabled} className="h-8 text-xs rounded-full">
            <Layers className="h-3.5 w-3.5 mr-1.5" />Partir d’un template
          </Button>
        </div>
      )}

      {showTable && (
        <>
          {!hideProgress && <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3899aa] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums shrink-0">
              {stats.globalFilled}/{stats.globalTotal} saisies
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  title="Tout supprimer"
                  aria-label="Supprimer toutes les mesures"
                  className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer toutes les mesures ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Les {stats.globalTotal} mesure{stats.globalTotal > 1 ? 's' : ''} et leurs valeurs saisies seront retirées de ce bilan. Cette action est irréversible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onChange([])}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Tout supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>}

          {isCompactMode ? (
            <div className="space-y-1">
              {renderRows(Array.from(groups.values())[0] ?? [])}
            </div>
          ) : (
            <div className="space-y-2">
              {categoryOrder.map((category) => {
                const rows = groups.get(category) ?? [];
                const catPending = pendingByCategory.get(category) ?? [];
                const s = stats.cats.get(category) ?? { filled: 0, total: rows.length };
                const isCollapsed = collapsedCategories.has(category) && catPending.length === 0;
                const isComplete = s.total > 0 && s.filled === s.total;

                return (
                  <div
                    key={category}
                    className="border border-border/40 rounded-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                        isComplete ? 'bg-[#3899aa]/15 hover:bg-[#3899aa]/20' : 'bg-[#3899aa]/[0.07] hover:bg-[#3899aa]/[0.12]'
                      }`}
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${
                          isCollapsed ? '-rotate-90' : 'rotate-0'
                        }`}
                      />
                      <span className="text-sm font-medium text-foreground flex-1 truncate">{category}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {catPending.length > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{catPending.length} à vérifier</span>}
                        {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-[#3899aa]" />}
                        <span
                          className={`text-[11px] tabular-nums ${
                            isComplete ? 'text-[#3899aa] font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          {s.filled}/{s.total}
                        </span>
                      </div>
                    </button>

                    <div
                      className={`grid transition-[grid-template-rows] duration-150 ease-out ${
                        isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-0.5 p-1">{renderCategory(rows, catPending)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ApplyTemplateModal
        open={applyTemplateOpen}
        onOpenChange={setApplyTemplateOpen}
        onApply={handleApplyTemplate}
      />
    </div>
  );
}
