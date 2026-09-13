'use client';

import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { matchesAllTokens } from '@/utils/textSearch';
import { Search, User, X, Loader2, ChevronDown } from 'lucide-react';
import type { PatientSummary } from '@/types/bilan';

interface PatientComboboxProps {
  value: PatientSummary | null;
  onChange: (patient: PatientSummary | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** `field` = champ de formulaire pleine largeur ; `inline` = mot réglable dans une phrase */
  variant?: 'field' | 'inline';
}

// Recherche et sélection d'un patient actif du kiné (liste chargée à la première ouverture)
export default function PatientCombobox({ value, onChange, disabled, placeholder = 'Rechercher un patient…', variant = 'field' }: PatientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || patients !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const profileRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
        if (!profileRes.ok) return;
        const profile = await profileRes.json();
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/kine/${profile.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPatients(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, patients]);

  const filtered = (patients ?? []).filter((p) => matchesAllTokens(`${p.firstName} ${p.lastName}`, search)).slice(0, 30);

  // Liste de sélection, commune aux deux variantes
  const listContent = (
    <PopoverContent align="start" className={variant === 'inline' ? 'w-72 p-2' : 'w-[var(--radix-popover-trigger-width)] p-2'}>
      <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou prénom" className="h-8 mb-2" />
      <div className="max-h-56 overflow-y-auto space-y-0.5">
        {loading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-[#3899aa]" /></div>}
        {!loading && filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Aucun patient</p>}
        {filtered.map((p) => (
          <button key={p.id} type="button" onClick={() => { onChange(p); setOpen(false); setSearch(''); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#3899aa]/10 text-left text-sm">
            <span className="w-7 h-7 rounded-full bg-[#3899aa]/10 text-[#3899aa] text-xs font-medium flex items-center justify-center shrink-0">{p.firstName[0]}{p.lastName[0]}</span>
            <span className="truncate">{p.firstName} {p.lastName.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </PopoverContent>
  );

  // Variante « phrase » : le mot lui-même est le déclencheur. Sans patient, le pointillé
  // signale qu'il est réglable ; avec patient, les initiales prennent la place du pointillé.
  if (variant === 'inline') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <span className="inline-flex items-center gap-1">
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={value ? `Patient : ${value.firstName} ${value.lastName}. Changer de patient` : 'Choisir un patient'}
              className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3899aa] ${
                value
                  ? 'text-foreground hover:bg-muted'
                  : 'text-foreground/70 underline decoration-dotted underline-offset-4 hover:text-foreground hover:bg-muted'
              }`}
            >
              {value ? (
                <span className="w-6 h-6 shrink-0 rounded-full bg-[#3899aa]/10 text-[#3899aa] text-[10px] font-semibold inline-flex items-center justify-center">
                  {value.firstName[0]}{value.lastName[0]}
                </span>
              ) : (
                <User className="h-4 w-4 shrink-0 opacity-60" />
              )}
              <span className="truncate max-w-[12rem]">{value ? `${value.firstName} ${value.lastName.toUpperCase()}` : 'un patient'}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          {value && !disabled && (
            <button type="button" aria-label="Retirer le patient" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
        {listContent}
      </Popover>
    );
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm">
        <User className="h-4 w-4 text-[#3899aa] shrink-0" />
        <span className="truncate flex-1">{value.firstName} {value.lastName.toUpperCase()}</span>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" aria-label="Retirer le patient" onClick={() => onChange(null)} className="h-6 w-6 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className="flex items-center gap-2 h-9 w-full px-3 rounded-md border border-input bg-background text-sm text-muted-foreground text-left">
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">{placeholder}</span>
        </button>
      </PopoverTrigger>
      {listContent}
    </Popover>
  );
}
