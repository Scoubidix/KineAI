'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { suggestTerms } from './termSuggestions';
import type { CanonicalField } from '@/types/bilan';

interface TermReportBarProps {
  /** Texte sélectionné dans les notes */
  heard: string;
  onCancel: () => void;
  onConfirm: (expected: string) => void;
  disabled?: boolean;
}

/**
 * Corriger un terme mal transcrit, et le signaler du même geste.
 *
 * Barre ancrée au-dessus de la zone d'écriture, jamais posée sur la sélection : dans un
 * `<textarea>` on ne sait pas où elle se trouve à l'écran, et sur mobile la bulle système
 * « Copier / Coller » occupe déjà cette place. C'est le parti pris de Google Docs et de Word
 * mobile — le standard « contextual action bar » de Material 3, ancré faute de pouvoir flotter.
 */
export default function TermReportBar({ heard, onCancel, onConfirm, disabled }: TermReportBarProps) {
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [value, setValue] = useState('');

  // Le catalogue sert à proposer l'orthographe : sans lui, le kiné devrait tout taper
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/bilan-fields`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFields(Array.isArray(data) ? data : (data.fields ?? []));
      } catch { /* sans suggestions, la saisie libre reste possible */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const suggestions = suggestTerms(heard, fields);
  // Le meilleur candidat est pré-rempli : dans le cas courant, le kiné n'a qu'à valider
  useEffect(() => { setValue(suggestions[0] ?? ''); }, [heard, fields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => { const v = value.trim(); if (v && v !== heard) onConfirm(v); };

  return (
    <div
      role="region"
      aria-label="Corriger un terme mal transcrit"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      className="mx-auto w-full max-w-[68ch] rounded-xl border border-[#3899aa]/40 bg-[#3899aa]/[0.07] px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground shrink-0">Entendu</span>
        <span className="text-sm font-medium max-w-[14rem] truncate">« {heard} »</span>
        <span className="text-muted-foreground shrink-0" aria-hidden>→</span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
          maxLength={80}
          aria-label="Terme correct"
          placeholder="Terme correct"
          className="h-11 w-48 text-sm"
        />
        <Button onClick={submit} disabled={disabled || !value.trim()} className="btn-teal h-11 rounded-full px-4">Corriger</Button>
        <Button variant="ghost" size="icon" aria-label="Annuler" onClick={onCancel} className="h-11 w-11 ml-auto">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {suggestions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                value === s ? 'border-[#3899aa] bg-[#3899aa]/15 text-[#3899aa]' : 'border-border bg-white dark:bg-card hover:bg-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
