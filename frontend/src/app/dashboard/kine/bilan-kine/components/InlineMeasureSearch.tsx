'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Search, Sparkles, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CanonicalField } from '@/types/bilan';

interface InlineMeasureSearchProps {
  fields: CanonicalField[];
  addedKeys: Set<string>;
  addedCustomLabels: Set<string>;
  onAddCanonical: (field: CanonicalField) => void;
  onAddCustom: (label: string) => void;
  disabled?: boolean;
  // Mode controlled : si fourni, le composant n'affiche plus son propre bouton "+"
  // (le parent l'expose ailleurs) et reflète l'état d'ouverture passé en prop.
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MAX_RESULTS = 5;

// Normalisation : minuscule + suppression des accents → recherche tolérante.
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// Score de pertinence : début de mot > inclusion dans label > catégorie/unit.
// Plus le score est élevé, plus le résultat est pertinent.
const scoreField = (field: CanonicalField, q: string): number => {
  if (!q) return 1;
  const label = normalize(field.label);
  const key = normalize(field.key);
  const category = normalize(field.category);
  const unit = normalize(field.unit ?? '');

  // Match préfixe du label entier (ex: "lase" → "Lasègue")
  if (label.startsWith(q)) return 100;
  // Match début d'un mot dans le label (ex: "neer" → "Test de Neer")
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label)) return 80;
  // Inclus dans le label
  if (label.includes(q)) return 60;
  // Inclus dans la key technique
  if (key.includes(q)) return 50;
  // Inclus dans la catégorie
  if (category.includes(q)) return 30;
  // Inclus dans l'unité
  if (unit.includes(q)) return 20;
  return 0;
};

export default function InlineMeasureSearch({
  fields,
  addedKeys,
  addedCustomLabels,
  onAddCanonical,
  onAddCustom,
  disabled = false,
  isOpen: controlledOpen,
  onOpenChange,
}: InlineMeasureSearchProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setIsOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const q = useMemo(() => normalize(search), [search]);

  // Top 5 résultats triés par pertinence puis par order canonique.
  const results = useMemo(() => {
    if (!q) {
      // Sans recherche, on n'affiche rien : la barre invite à taper.
      return [] as CanonicalField[];
    }
    return fields
      .map((f) => ({ field: f, score: scoreField(f, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.field.order - b.field.order || a.field.id - b.field.id)
      .slice(0, MAX_RESULTS)
      .map((x) => x.field);
  }, [fields, q]);

  // L'option "mesure libre" est dispo dès qu'il y a du texte, même s'il y a des résultats canoniques.
  const customAvailable =
    search.trim().length > 0 && !addedCustomLabels.has(search.trim().toLowerCase());

  // Liste totale des options sélectionnables au clavier : résultats + (éventuellement) mesure libre.
  const optionsCount = results.length + (customAvailable ? 1 : 0);
  const customIndex = customAvailable ? results.length : -1;

  // Reset de l'index quand la liste change pour rester sur le 1er élément.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [q, results.length, customAvailable]);

  // Focus auto quand on ouvre la barre.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Fermer la barre si on clique en dehors.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setSearch('');
  };

  const addCanonical = (field: CanonicalField) => {
    if (addedKeys.has(field.key)) return;
    onAddCanonical(field);
    setSearch('');
    inputRef.current?.focus();
  };

  const addCustom = () => {
    const label = search.trim();
    if (!label) return;
    if (addedCustomLabels.has(label.toLowerCase())) return;
    onAddCustom(label);
    setSearch('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (optionsCount === 0) return;
      setHighlightedIndex((i) => (i + 1) % optionsCount);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (optionsCount === 0) return;
      setHighlightedIndex((i) => (i - 1 + optionsCount) % optionsCount);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (optionsCount === 0) {
        // Aucun résultat ET pas de texte → rien à faire.
        // (Si du texte mais déjà ajouté en libre, on ne fait rien non plus.)
        return;
      }
      if (highlightedIndex === customIndex) {
        addCustom();
        return;
      }
      const target = results[highlightedIndex];
      if (target && !addedKeys.has(target.key)) {
        addCanonical(target);
      }
    }
  };

  // Mode controlled fermé : le parent expose son propre trigger, on ne rend rien.
  if (!isOpen) {
    if (isControlled) return null;
    // Mode uncontrolled : on rend nous-mêmes le "+".
    return (
      <div className="px-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          aria-label="Ajouter une mesure"
          className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-dashed border-[#3899aa]/40 text-[#3899aa] hover:border-[#3899aa] hover:bg-[#3899aa]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="border border-[#3899aa]/30 rounded-lg bg-[#3899aa]/[0.03] p-2 space-y-1.5"
    >
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher un test : EVA, Lasègue, lombaire…"
          className="pl-8 pr-8 h-8 text-sm"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={close}
          aria-label="Fermer la recherche"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {search.trim().length > 0 && (
        <div className="space-y-0.5">
          {results.map((f, idx) => {
            const alreadyAdded = addedKeys.has(f.key);
            const isHighlighted = idx === highlightedIndex && !alreadyAdded;
            return (
              <button
                key={f.id}
                type="button"
                onMouseEnter={() => !alreadyAdded && setHighlightedIndex(idx)}
                onClick={() => addCanonical(f)}
                disabled={alreadyAdded || disabled}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                  alreadyAdded
                    ? 'opacity-50 cursor-not-allowed'
                    : isHighlighted
                    ? 'bg-[#3899aa]/15'
                    : 'hover:bg-[#3899aa]/10'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {f.category}
                    {f.type === 'NUMERIC' && f.unit ? ` · ${f.unit}` : ''}
                    {f.type === 'BOOLEAN' ? ' · positif / négatif' : ''}
                    {f.type === 'TEXT' ? ' · texte' : ''}
                    {f.type === 'ENUM' && f.options ? ` · ${f.options.join(' / ')}` : ''}
                  </p>
                </div>
                {alreadyAdded ? (
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
                    <Check className="w-3 h-3" />
                    Ajoutée
                  </span>
                ) : (
                  <Plus className="w-3.5 h-3.5 text-[#3899aa] shrink-0" />
                )}
              </button>
            );
          })}

          {customAvailable && (
            <button
              type="button"
              onMouseEnter={() => setHighlightedIndex(customIndex)}
              onClick={addCustom}
              disabled={disabled}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed text-left transition-colors ${
                highlightedIndex === customIndex
                  ? 'border-[#3899aa]/70 bg-[#3899aa]/10'
                  : 'border-[#3899aa]/30 hover:border-[#3899aa]/60 hover:bg-[#3899aa]/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#3899aa] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  Ajouter «&nbsp;<strong>{search.trim()}</strong>&nbsp;» en mesure libre
                </p>
              </div>
              <Plus className="w-3.5 h-3.5 text-[#3899aa] shrink-0" />
            </button>
          )}

          {results.length === 0 && !customAvailable && (
            <p className="text-[11px] text-muted-foreground italic px-2 py-1">
              Cette mesure libre a déjà été ajoutée.
            </p>
          )}
        </div>
      )}

      {search.trim().length === 0 && (
        <p className="text-[11px] text-muted-foreground italic px-2 py-0.5">
          Tape un nom de test, une zone ou un type de mesure. ↑↓ pour naviguer, Entrée pour ajouter.
        </p>
      )}
    </div>
  );
}
