'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, Activity, Layers, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import {
  CanonicalField,
  StructuredData,
  CanonicalValue,
  EMPTY_STRUCTURED_DATA,
  Measurement,
  BilanTemplate,
} from '@/types/bilan';
import AddMeasureModal from './AddMeasureModal';
import ApplyTemplateModal from './ApplyTemplateModal';

interface MeasurementsPanelProps {
  structuredData: StructuredData;
  onChange: (data: StructuredData) => void;
  disabled?: boolean;
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
  measurement: Measurement;
  index: number; // index dans data.measurements (clé pour les handlers)
  field?: CanonicalField; // résolu pour les canoniques
}

export default function MeasurementsPanel({
  structuredData,
  onChange,
  disabled = false,
}: MeasurementsPanelProps) {
  const { toast } = useToast();
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const previouslyCompleteRef = useRef<Set<string>>(new Set());
  const pendingCollapseRef = useRef<Set<string>>(new Set());

  const data = structuredData ?? EMPTY_STRUCTURED_DATA;
  const measurements = data.measurements;

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

  const addedKeys = useMemo(
    () =>
      new Set(
        measurements
          .filter((m) => m.kind === 'canonical')
          .map((m) => (m as Extract<Measurement, { kind: 'canonical' }>).key),
      ),
    [measurements],
  );
  const addedCustomLabels = useMemo(
    () =>
      new Set(
        measurements
          .filter((m) => m.kind === 'custom')
          .map((m) => (m as Extract<Measurement, { kind: 'custom' }>).label.trim().toLowerCase()),
      ),
    [measurements],
  );

  const handleAddCanonical = (field: CanonicalField) => {
    if (addedKeys.has(field.key)) return;
    onChange({
      measurements: [...measurements, { kind: 'canonical', key: field.key, value: null }],
    });
  };

  const handleAddCustom = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || addedCustomLabels.has(trimmed.toLowerCase())) return;
    onChange({
      measurements: [...measurements, { kind: 'custom', label: trimmed, value: '' }],
    });
  };

  const handleRemoveAt = (index: number) => {
    onChange({ measurements: measurements.filter((_, i) => i !== index) });
  };

  const handleChangeAt = (index: number, value: CanonicalValue | string) => {
    onChange({
      measurements: measurements.map((m, i) => {
        if (i !== index) return m;
        if (m.kind === 'canonical') return { ...m, value: value as CanonicalValue };
        return { ...m, value: (value ?? '') as string };
      }),
    });
  };

  // Application non-destructive d'un template : ajoute les items du template
  // qui ne sont pas déjà dans measurements, à la fin, dans l'ordre du template.
  // Les valeurs déjà saisies dans le bilan en cours ne sont jamais touchées.
  const handleApplyTemplate = (template: BilanTemplate) => {
    const existingKeys = new Set(addedKeys);
    const existingLabels = new Set(addedCustomLabels);
    const toAdd: Measurement[] = [];
    const touchedCategories = new Set<string>();

    for (const item of template.items) {
      if (item.kind === 'canonical') {
        if (existingKeys.has(item.key)) continue;
        existingKeys.add(item.key);
        toAdd.push({ kind: 'canonical', key: item.key, value: null });
        const cat = fieldsByKey.get(item.key)?.category ?? UNKNOWN_CATEGORY;
        touchedCategories.add(cat);
      } else {
        const labelKey = item.label.trim().toLowerCase();
        if (existingLabels.has(labelKey)) continue;
        existingLabels.add(labelKey);
        toAdd.push({ kind: 'custom', label: item.label, value: '' });
        touchedCategories.add(CUSTOM_CATEGORY);
      }
    }

    onChange({ measurements: [...measurements, ...toAdd] });

    // Une catégorie où on vient d'ajouter des mesures vides ne doit plus être
    // collapsed (sinon le user ne voit pas où ses nouvelles mesures sont arrivées).
    if (touchedCategories.size > 0) {
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        for (const c of touchedCategories) next.delete(c);
        return next;
      });
    }

    toast({
      title: `Template "${template.name}" appliqué`,
      description:
        toAdd.length === 0
          ? 'Toutes les mesures du template étaient déjà présentes'
          : `${toAdd.length} mesure${toAdd.length > 1 ? 's ajoutées' : ' ajoutée'}`,
    });
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

  // Auto-collapse : transition incomplet → complet → en attente, repli au blur
  // pour ne pas couper la saisie en cours.
  useEffect(() => {
    const currentlyComplete = new Set<string>();
    for (const [cat, s] of stats.cats.entries()) {
      if (s.total > 0 && s.filled === s.total) currentlyComplete.add(cat);
    }
    for (const c of currentlyComplete) {
      if (!previouslyCompleteRef.current.has(c)) {
        pendingCollapseRef.current.add(c);
      }
    }
    for (const c of previouslyCompleteRef.current) {
      if (!currentlyComplete.has(c)) {
        pendingCollapseRef.current.delete(c);
      }
    }
    previouslyCompleteRef.current = currentlyComplete;
  }, [stats]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    pendingCollapseRef.current.delete(cat);
  };

  const handleCategoryBlur = (category: string, e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (pendingCollapseRef.current.has(category)) {
      pendingCollapseRef.current.delete(category);
      setCollapsedCategories((prev) => {
        if (prev.has(category)) return prev;
        const next = new Set(prev);
        next.add(category);
        return next;
      });
    }
  };

  const renderCanonicalInput = (
    field: CanonicalField,
    value: CanonicalValue,
    index: number,
  ) => {
    switch (field.type) {
      case 'NUMERIC':
        return (
          <div className="flex items-center gap-1.5 flex-1">
            <Input
              type="number"
              value={value === null || value === undefined ? '' : (value as number)}
              onChange={(e) => {
                if (e.target.value === '') {
                  handleChangeAt(index, null);
                } else {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) handleChangeAt(index, n);
                }
              }}
              min={field.rangeMin ?? undefined}
              max={field.rangeMax ?? undefined}
              disabled={disabled}
              className="h-8 text-sm w-28"
            />
            {field.unit && <span className="text-xs text-muted-foreground shrink-0">{field.unit}</span>}
          </div>
        );
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

  const renderRow = (row: RowWithIndex) => {
    const m = row.measurement;
    if (m.kind === 'canonical') {
      if (!row.field) {
        return (
          <div
            key={`row-${row.index}`}
            className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20"
          >
            <span className="text-sm flex-1 text-muted-foreground italic">Champ inconnu : {m.key}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveAt(row.index)}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      }
      return (
        <div key={`row-${row.index}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
          <span className="text-sm font-medium w-36 sm:w-56 shrink-0 truncate">{row.field.label}</span>
          {renderCanonicalInput(row.field, m.value, row.index)}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemoveAt(row.index)}
            disabled={disabled}
            className="h-6 w-6 p-0 shrink-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }
    return (
      <div key={`row-${row.index}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
        <span className="text-sm font-medium w-36 sm:w-56 shrink-0 truncate italic text-muted-foreground">
          {m.label}
        </span>
        <Input
          type="text"
          value={m.value}
          onChange={(e) => handleChangeAt(row.index, e.target.value)}
          placeholder="Valeur libre"
          disabled={disabled}
          className="h-8 text-sm flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleRemoveAt(row.index)}
          disabled={disabled}
          className="h-6 w-6 p-0 shrink-0"
        >
          <X className="h-3 w-3" />
        </Button>
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#3899aa]" />
          <span className="text-sm font-medium text-[#3899aa]">Tests & mesures</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setApplyTemplateOpen(true)}
            disabled={disabled}
            className="h-7 text-xs rounded-full"
          >
            <Layers className="h-3 w-3 mr-1" />
            Appliquer un template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddModalOpen(true)}
            disabled={disabled}
            className="h-7 text-xs rounded-full"
          >
            <Plus className="h-3 w-3 mr-1" />
            Ajouter une mesure
          </Button>
        </div>
      </div>

      {!hasMeasures ? (
        <p className="text-xs text-muted-foreground italic px-2 py-1">
          Aucune mesure ajoutée. Cliquez sur « Ajouter une mesure » pour saisir EVA, amplitudes, tests…
        </p>
      ) : (
        <>
          {stats.globalTotal > 1 && (
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
            </div>
          )}

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
                    onBlur={(e) => handleCategoryBlur(category, e)}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                        isComplete ? 'bg-[#3899aa]/5 hover:bg-[#3899aa]/10' : 'bg-muted/30 hover:bg-muted/50'
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

      <AddMeasureModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        fields={fields}
        addedKeys={addedKeys}
        addedCustomLabels={addedCustomLabels}
        onAddCanonical={handleAddCanonical}
        onAddCustom={handleAddCustom}
      />

      <ApplyTemplateModal
        open={applyTemplateOpen}
        onOpenChange={setApplyTemplateOpen}
        onApply={handleApplyTemplate}
      />
    </div>
  );
}
