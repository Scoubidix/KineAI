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
  BilanTemplate,
} from '@/types/bilan';
import AddMeasureModal from './AddMeasureModal';
import ApplyTemplateModal from './ApplyTemplateModal';

interface MeasurementsPanelProps {
  structuredData: StructuredData;
  onChange: (data: StructuredData) => void;
  disabled?: boolean;
}

// Catégorie virtuelle pour les mesures custom (toujours affichée en dernier)
const CUSTOM_CATEGORY = 'Mesures libres';
// Catégorie de fallback pour les canoniques dont le field n'a pas pu être chargé
const UNKNOWN_CATEGORY = 'Champs inconnus';

// Une valeur canonique est "saisie" si elle n'est ni null/undefined ni string vide.
// 0 et false sont des valeurs valides → considérés comme saisis.
const isCanonicalFilled = (v: CanonicalValue): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
};

interface CanonicalRow {
  kind: 'canonical';
  key: string;
  value: CanonicalValue;
  field?: CanonicalField;
}
interface CustomRow {
  kind: 'custom';
  index: number;
  label: string;
  value: string;
}
type Row = CanonicalRow | CustomRow;

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
  // Catégories devenues complètes mais en attente de blur pour être repliées.
  // Évite le collapse prématuré dès le 1er caractère saisi dans le dernier champ.
  const pendingCollapseRef = useRef<Set<string>>(new Set());

  const data = structuredData ?? EMPTY_STRUCTURED_DATA;

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

  const addedKeys = new Set(Object.keys(data.canonical));
  const addedCustomLabels = new Set(data.custom.map((c) => c.label.trim().toLowerCase()));

  const handleAddCanonical = (field: CanonicalField) => {
    onChange({
      ...data,
      canonical: { ...data.canonical, [field.key]: null },
    });
  };

  const handleAddCustom = (label: string) => {
    onChange({
      ...data,
      custom: [...data.custom, { label, value: '' }],
    });
  };

  const handleRemoveCanonical = (key: string) => {
    const next = { ...data.canonical };
    delete next[key];
    onChange({ ...data, canonical: next });
  };

  const handleRemoveCustom = (index: number) => {
    onChange({ ...data, custom: data.custom.filter((_, i) => i !== index) });
  };

  const handleChangeCanonical = (key: string, value: CanonicalValue) => {
    onChange({ ...data, canonical: { ...data.canonical, [key]: value } });
  };

  const handleChangeCustom = (index: number, value: string) => {
    onChange({
      ...data,
      custom: data.custom.map((item, i) => (i === index ? { ...item, value } : item)),
    });
  };

  // Application non-destructive d'un template : ajoute les items manquants,
  // ne touche jamais aux valeurs déjà saisies.
  const handleApplyTemplate = (template: BilanTemplate) => {
    const nextCanonical = { ...data.canonical };
    const nextCustom = [...data.custom];
    const existingCustomLabels = new Set(nextCustom.map((c) => c.label.trim().toLowerCase()));

    let added = 0;
    const touchedCategories = new Set<string>();
    for (const item of template.items) {
      if (item.kind === 'canonical') {
        if (!(item.key in nextCanonical)) {
          nextCanonical[item.key] = null;
          const cat = fieldsByKey.get(item.key)?.category ?? UNKNOWN_CATEGORY;
          touchedCategories.add(cat);
          added++;
        }
      } else {
        const labelKey = item.label.trim().toLowerCase();
        if (!existingCustomLabels.has(labelKey)) {
          nextCustom.push({ label: item.label, value: '' });
          existingCustomLabels.add(labelKey);
          touchedCategories.add(CUSTOM_CATEGORY);
          added++;
        }
      }
    }

    onChange({ canonical: nextCanonical, custom: nextCustom });

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
      description: added === 0
        ? 'Toutes les mesures du template étaient déjà présentes'
        : `${added} mesure${added > 1 ? 's ajoutées' : ' ajoutée'}`,
    });
  };

  // Construction des groupes par catégorie en préservant l'ordre d'insertion
  // dans data.canonical, puis "Mesures libres" en dernier si custom.length > 0.
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();

    for (const [key, value] of Object.entries(data.canonical)) {
      const field = fieldsByKey.get(key);
      const cat = field?.category ?? UNKNOWN_CATEGORY;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({ kind: 'canonical', key, value, field });
    }

    if (data.custom.length > 0) {
      const rows: Row[] = data.custom.map((c, i) => ({
        kind: 'custom',
        index: i,
        label: c.label,
        value: c.value,
      }));
      map.set(CUSTOM_CATEGORY, rows);
    }

    return map;
  }, [data.canonical, data.custom, fieldsByKey]);

  // Compteurs saisies/total par catégorie + global
  const stats = useMemo(() => {
    const cats = new Map<string, { filled: number; total: number }>();
    for (const [cat, rows] of groups.entries()) {
      let filled = 0;
      for (const r of rows) {
        if (r.kind === 'canonical') {
          if (isCanonicalFilled(r.value)) filled++;
        } else if (r.value.trim() !== '') {
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

  // Auto-collapse : à la transition incomplet → complet, on marque la catégorie
  // comme "en attente de blur". Le collapse effectif se fait dans handleCategoryBlur
  // quand le focus quitte la catégorie — sinon on collapse dès le 1er caractère
  // saisi dans le dernier champ alors que l'utilisateur n'a pas fini sa saisie
  // (ex: tape "30" pour une amplitude, on collapse au "3").
  useEffect(() => {
    const currentlyComplete = new Set<string>();
    for (const [cat, s] of stats.cats.entries()) {
      if (s.total > 0 && s.filled === s.total) currentlyComplete.add(cat);
    }
    // Transition incomplet → complet : mettre en attente
    for (const c of currentlyComplete) {
      if (!previouslyCompleteRef.current.has(c)) {
        pendingCollapseRef.current.add(c);
      }
    }
    // Transition complet → incomplet : annuler l'attente
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
    // Si l'utilisateur ouvre/ferme manuellement, on retire l'attente d'auto-collapse
    pendingCollapseRef.current.delete(cat);
  };

  // Déclenché quand le focus quitte le wrapper de la catégorie. Si la catégorie
  // vient juste de devenir complète (transition récente), on la replie.
  const handleCategoryBlur = (category: string, e: React.FocusEvent<HTMLDivElement>) => {
    // Le focus reste à l'intérieur (autre input/bouton de la même catégorie) → ignorer
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

  const renderCanonicalInput = (field: CanonicalField, value: CanonicalValue) => {
    switch (field.type) {
      case 'NUMERIC':
        return (
          <div className="flex items-center gap-1.5 flex-1">
            <Input
              type="number"
              value={value === null || value === undefined ? '' : (value as number)}
              onChange={(e) => {
                if (e.target.value === '') {
                  handleChangeCanonical(field.key, null);
                } else {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) handleChangeCanonical(field.key, n);
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
              onClick={() => handleChangeCanonical(field.key, false)}
              disabled={disabled}
              className={`px-3 py-1 rounded-l text-xs font-medium transition-colors ${
                value === false ? 'bg-[#3899aa] text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Négatif
            </button>
            <button
              type="button"
              onClick={() => handleChangeCanonical(field.key, true)}
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
            onChange={(e) => handleChangeCanonical(field.key, e.target.value === '' ? null : e.target.value)}
            disabled={disabled}
            className="h-8 text-sm flex-1"
          />
        );
      case 'ENUM':
        return (
          <select
            value={value === null || value === undefined ? '' : (value as string)}
            onChange={(e) => handleChangeCanonical(field.key, e.target.value === '' ? null : e.target.value)}
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

  const renderRow = (row: Row) => {
    if (row.kind === 'canonical') {
      if (!row.field) {
        return (
          <div
            key={`canonical-${row.key}`}
            className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20"
          >
            <span className="text-sm flex-1 text-muted-foreground italic">Champ inconnu : {row.key}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveCanonical(row.key)}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      }
      return (
        <div key={`canonical-${row.key}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
          <span className="text-sm font-medium w-36 sm:w-56 shrink-0 truncate">{row.field.label}</span>
          {renderCanonicalInput(row.field, row.value)}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemoveCanonical(row.key)}
            disabled={disabled}
            className="h-6 w-6 p-0 shrink-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }
    return (
      <div key={`custom-${row.index}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
        <span className="text-sm font-medium w-36 sm:w-56 shrink-0 truncate italic text-muted-foreground">
          {row.label}
        </span>
        <Input
          type="text"
          value={row.value}
          onChange={(e) => handleChangeCustom(row.index, e.target.value)}
          placeholder="Valeur libre"
          disabled={disabled}
          className="h-8 text-sm flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleRemoveCustom(row.index)}
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
          {/* Bandeau de progression global — visible uniquement quand il y a plusieurs mesures */}
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
            // Rendu plat (petits bilans) : pas de header de catégorie
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
