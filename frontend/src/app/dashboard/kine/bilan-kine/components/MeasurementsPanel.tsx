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
} from '@/types/bilan';
import InlineMeasureSearch from './InlineMeasureSearch';
import ApplyTemplateModal from './ApplyTemplateModal';
import SideSelector from './SideSelector';
import { measurementIdentity } from './editor/suggestions';

interface MeasurementsPanelProps {
  measurements: DocumentMeasurement[];
  onChange: (next: DocumentMeasurement[]) => void;
  disabled?: boolean;
  /** Bilan de suivi : valeur du bilan de référence par identité de mesure, affichée « préc. … » */
  previousValues?: Map<string, CanonicalValue>;
  /** Citation des notes à l'origine de la valeur (mesures acceptées automatiquement), par identité de mesure */
  quotes?: Map<string, string>;
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

export default function MeasurementsPanel({
  measurements,
  onChange,
  disabled = false,
  previousValues,
  quotes,
  dense = false,
}: MeasurementsPanelProps) {
  const { toast } = useToast();
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  // Indices des lignes NUMERIC dont la dernière saisie était hors bornes (message d'aide local)
  const [rangeHints, setRangeHints] = useState<Map<number, string>>(new Map());
  // Brouillon local par ligne NUMERIC (texte tel que tapé, tant qu'il n'est pas commis) :
  // permet de taper un nombre dont un préfixe est hors bornes (ex. "35" dans un champ 20-80,
  // le "3" seul est < 20) sans que l'input contrôlé ne revienne écraser la frappe en cours.
  const [drafts, setDrafts] = useState<Record<number, string>>({});

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
  // Un champ est "complet" (plus proposable) si non latéralisé et présent, ou latéralisé avec D et G présents.
  const isFieldExhausted = (field: CanonicalField) =>
    field.lateralized
      ? hasCanonical(field.key, 'D') && hasCanonical(field.key, 'G')
      : hasCanonical(field.key) || hasCanonical(field.key, 'D') || hasCanonical(field.key, 'G');

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

  const handleRemoveAt = (index: number) => {
    onChange(measurements.filter((_, i) => i !== index));
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
    index: number,
  ) => {
    switch (field.type) {
      case 'NUMERIC': {
        const hint = rangeHints.get(index);
        const { rangeMin, rangeMax } = field;
        const outOfRangeHint = () =>
          rangeMin !== null && rangeMax !== null
            ? `Entre ${rangeMin} et ${rangeMax}`
            : rangeMin !== null
            ? `Supérieur à ${rangeMin}`
            : `Inférieur à ${rangeMax}`;
        const clearHint = () => setRangeHints((prev) => { if (!prev.has(index)) return prev; const next = new Map(prev); next.delete(index); return next; });
        const clearDraft = () => setDrafts((prev) => { if (!(index in prev)) return prev; const next = { ...prev }; delete next[index]; return next; });
        const draft = drafts[index];
        const displayValue = draft ?? (value === null || value === undefined ? '' : String(value as number));
        return (
          <div className="flex flex-col gap-0.5 flex-1">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={displayValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    handleChangeAt(index, null);
                    clearHint();
                    clearDraft();
                    return;
                  }
                  const n = Number(raw);
                  if (Number.isNaN(n)) {
                    // Brouillon gardé tel quel (ex. "-" en cours de frappe), pas de commit
                    setDrafts((prev) => ({ ...prev, [index]: raw }));
                    return;
                  }
                  const outOfRange = (rangeMin !== null && n < rangeMin) || (rangeMax !== null && n > rangeMax);
                  if (outOfRange) {
                    // Hors bornes : le brouillon reste affiché (la frappe continue), on ne persiste pas
                    setDrafts((prev) => ({ ...prev, [index]: raw }));
                    setRangeHints((prev) => new Map(prev).set(index, outOfRangeHint()));
                    return;
                  }
                  clearHint();
                  clearDraft();
                  handleChangeAt(index, n);
                }}
                onBlur={() => {
                  if (!(index in drafts)) return;
                  const raw = drafts[index];
                  const n = Number(raw);
                  const valid = raw !== '' && !Number.isNaN(n) && !((rangeMin !== null && n < rangeMin) || (rangeMax !== null && n > rangeMax));
                  if (valid) {
                    // Cas défensif : un brouillon valide n'a normalement pas survécu à l'onChange
                    // (déjà commis et effacé) — on le commet par sécurité et on efface le hint.
                    clearHint();
                    handleChangeAt(index, n);
                  }
                  // Sinon : brouillon hors bornes ou NaN abandonné, le champ revient à la
                  // dernière valeur commise, le hint reste visible pour expliquer pourquoi.
                  clearDraft();
                }}
                min={rangeMin ?? undefined}
                max={rangeMax ?? undefined}
                disabled={disabled}
                className="h-8 text-sm w-28"
              />
              {field.unit && <span className="text-xs text-muted-foreground shrink-0">{field.unit}</span>}
            </div>
            {hint && <span className="text-[10px] text-destructive">{hint}</span>}
          </div>
        );
      }
      case 'BOOLEAN':
        return (
          <div className="flex items-center gap-1 flex-1">
            <button
              type="button"
              onClick={() => handleChangeAt(index, false)}
              disabled={disabled}
              className={`px-3 py-1 rounded-l text-xs font-medium transition-colors ${
                value === false ? 'bg-[#3899aa] text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Négatif
            </button>
            <button
              type="button"
              onClick={() => handleChangeAt(index, true)}
              disabled={disabled}
              className={`px-3 py-1 rounded-r text-xs font-medium transition-colors ${
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
            onChange={(e) => handleChangeAt(index, e.target.value === '' ? null : e.target.value)}
            disabled={disabled}
            className="h-8 text-sm flex-1"
          />
        );
      case 'ENUM':
        return (
          <select
            value={value === null || value === undefined ? '' : (value as string)}
            onChange={(e) => handleChangeAt(index, e.target.value === '' ? null : e.target.value)}
            disabled={disabled}
            className="h-8 text-sm rounded-md border border-input bg-background px-2 flex-1"
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

  const renderQuote = (m: DocumentMeasurement) => {
    const q = quotes?.get(measurementIdentity(m));
    return q === undefined ? null : (
      <span title={`D’après tes notes : « ${q} »`} aria-label={`D’après tes notes : ${q}`} className="inline-flex shrink-0 text-muted-foreground"><Quote className="h-3 w-3" /></span>
    );
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
          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAt(row.index)} className="h-6 w-6 p-0 shrink-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    const field = row.field;
    const sideSelector = m.kind === 'canonical' && field?.lateralized
      ? <SideSelector value={m.side} onChange={(s) => handleSideAt(row.index, s)} disabled={disabled} />
      : null;
    const input = m.kind === 'canonical' && field
      ? renderCanonicalInput(field, m.value, row.index)
      : (
        <Input
          type="text"
          value={m.kind === 'custom' ? m.value : ''}
          onChange={(e) => handleChangeAt(row.index, e.target.value)}
          placeholder="Valeur libre"
          disabled={disabled}
          className="h-8 text-sm flex-1 min-w-0"
        />
      );
    const previous = renderPrevious(m, m.kind === 'canonical' ? field?.unit : undefined);
    const removeButton = (
      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAt(row.index)} disabled={disabled} className="h-6 w-6 p-0 shrink-0">
        <X className="h-3 w-3" />
      </Button>
    );
    const labelClass = `text-sm font-medium leading-snug break-words hyphens-auto${m.kind === 'custom' ? ' italic text-muted-foreground' : ''}`;

    if (dense) {
      return (
        <div key={`row-${row.index}`} className="px-2 py-1.5 rounded hover:bg-muted/40">
          <div className="flex items-start gap-2">
            <span className={`${labelClass} flex-1 min-w-0`} title={labelTitle}>{label}</span>
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
      <div key={`row-${row.index}`} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
        <span className={`${labelClass} w-36 sm:w-56 shrink-0`} title={labelTitle}>{label}</span>
        {sideSelector}
        {input}
        {previous}
        {renderQuote(m)}
        {removeButton}
      </div>
    );
  };

  const hasMeasures = stats.globalTotal > 0;
  const progressPercent =
    stats.globalTotal === 0 ? 0 : Math.round((stats.globalFilled / stats.globalTotal) * 100);

  // Mode compact : 1 seule catégorie ET ≤ 4 mesures → on saute les headers,
  // rendu identique au comportement initial pour les petits bilans.
  const isCompactMode = groups.size <= 1 && stats.globalTotal <= 4;

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
      {!hasMeasures && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Activity className="h-5 w-5 text-[#3899aa]/50" />
          <p className="text-xs text-muted-foreground">Cherche un test ci-dessus, ou pars d’une liste toute prête.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setApplyTemplateOpen(true)} disabled={disabled} className="h-8 text-xs rounded-full">
            <Layers className="h-3.5 w-3.5 mr-1.5" />Partir d’un template
          </Button>
        </div>
      )}

      {hasMeasures && (
        <>
          <div className="flex items-center gap-2 px-2 py-1">
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
          </div>

          {isCompactMode ? (
            <div className="space-y-1">
              {Array.from(groups.values())[0]?.map(renderRow)}
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from(groups.entries()).map(([category, rows]) => {
                const s = stats.cats.get(category) ?? { filled: 0, total: rows.length };
                const isCollapsed = collapsedCategories.has(category);
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
                        <div className="space-y-0.5 p-1">{rows.map(renderRow)}</div>
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
