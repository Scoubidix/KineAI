'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import {
  CanonicalField,
  StructuredData,
  CanonicalValue,
  EMPTY_STRUCTURED_DATA,
} from '@/types/bilan';
import AddMeasureModal from './AddMeasureModal';

interface MeasurementsPanelProps {
  structuredData: StructuredData;
  onChange: (data: StructuredData) => void;
  disabled?: boolean;
}

export default function MeasurementsPanel({
  structuredData,
  onChange,
  disabled = false,
}: MeasurementsPanelProps) {
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);

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

  const addedKeys = new Set(Object.keys(data.canonical));
  const addedCustomLabels = new Set(data.custom.map((c) => c.label.trim().toLowerCase()));

  const handleAddCanonical = (field: CanonicalField) => {
    // Default = null → champ visible mais "non saisi" (n'est pas envoyé à l'IA)
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

  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));

  const renderInput = (field: CanonicalField, value: CanonicalValue) => {
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

  const hasMeasures = Object.keys(data.canonical).length > 0 || data.custom.length > 0;

  return (
    <div className="border border-border/60 rounded-xl bg-white dark:bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#3899aa]" />
          <span className="text-sm font-medium text-[#3899aa]">Tests & mesures</span>
        </div>

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

      {!hasMeasures ? (
        <p className="text-xs text-muted-foreground italic px-2 py-1">
          Aucune mesure ajoutée. Cliquez sur « Ajouter une mesure » pour saisir EVA, amplitudes, tests…
        </p>
      ) : (
        <div className="space-y-1.5">
          {Object.entries(data.canonical).map(([key, value]) => {
            const field = fieldsByKey.get(key);
            if (!field) {
              return (
                <div key={key} className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20">
                  <span className="text-sm flex-1 text-muted-foreground italic">
                    Champ inconnu : {key}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveCanonical(key)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            }
            return (
              <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
                <span className="text-sm font-medium w-36 sm:w-56 shrink-0 truncate">{field.label}</span>
                {renderInput(field, value)}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCanonical(key)}
                  disabled={disabled}
                  className="h-6 w-6 p-0 shrink-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}

          {data.custom.map((item, index) => (
            <div key={`custom-${index}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40">
              <span className="text-sm font-medium w-36 sm:w-56 shrink-0 truncate italic text-muted-foreground">
                {item.label}
              </span>
              <Input
                type="text"
                value={item.value}
                onChange={(e) => handleChangeCustom(index, e.target.value)}
                placeholder="Valeur libre"
                disabled={disabled}
                className="h-8 text-sm flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveCustom(index)}
                disabled={disabled}
                className="h-6 w-6 p-0 shrink-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
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
    </div>
  );
}
