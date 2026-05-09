'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, Check, Sparkles } from 'lucide-react';
import { CanonicalField } from '@/types/bilan';

interface AddMeasureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CanonicalField[];
  addedKeys: Set<string>;
  addedCustomLabels: Set<string>;
  onAddCanonical: (field: CanonicalField) => void;
  onAddCustom: (label: string) => void;
}

export default function AddMeasureModal({
  open,
  onOpenChange,
  fields,
  addedKeys,
  addedCustomLabels,
  onAddCanonical,
  onAddCustom,
}: AddMeasureModalProps) {
  const [search, setSearch] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setCustomDraft('');
      return;
    }
    // Focus auto à l'ouverture
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();

  const matches = (f: CanonicalField) => {
    if (!normalizedSearch) return true;
    return (
      f.label.toLowerCase().includes(normalizedSearch) ||
      f.key.toLowerCase().includes(normalizedSearch) ||
      f.category.toLowerCase().includes(normalizedSearch) ||
      (f.unit ?? '').toLowerCase().includes(normalizedSearch)
    );
  };

  const filteredFields = fields.filter(matches);

  // Regrouper par catégorie en respectant l'ordre des champs (par order, puis id)
  const fieldsByCategory: Record<string, CanonicalField[]> = {};
  for (const f of filteredFields) {
    if (!fieldsByCategory[f.category]) fieldsByCategory[f.category] = [];
    fieldsByCategory[f.category].push(f);
  }
  for (const cat of Object.keys(fieldsByCategory)) {
    fieldsByCategory[cat].sort((a, b) => a.order - b.order || a.id - b.id);
  }
  const categories = Object.keys(fieldsByCategory).sort();

  const handleAddCanonical = (field: CanonicalField) => {
    if (addedKeys.has(field.key)) return;
    onAddCanonical(field);
    // On reste sur la modal pour pouvoir ajouter d'autres mesures rapidement
    setSearch('');
    inputRef.current?.focus();
  };

  const handleAddCustom = () => {
    const label = customDraft.trim();
    if (!label) return;
    if (addedCustomLabels.has(label.toLowerCase())) return;
    onAddCustom(label);
    setCustomDraft('');
    inputRef.current?.focus();
  };

  // Si la recherche ne match aucun canonique mais que l'utilisateur a tapé qq chose,
  // on propose de l'ajouter en mesure libre depuis la barre de recherche elle-même.
  const showSearchAsCustomShortcut =
    normalizedSearch.length > 0 &&
    filteredFields.length === 0 &&
    !addedCustomLabels.has(normalizedSearch);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <Plus className="w-5 h-5" />
            Ajouter une mesure
          </DialogTitle>
        </DialogHeader>

        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher : EVA, Lasègue, lombaire, douleur…"
            className="pl-9 h-10"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-1">
          {showSearchAsCustomShortcut && (
            <button
              type="button"
              onClick={() => {
                onAddCustom(search.trim());
                setSearch('');
                inputRef.current?.focus();
              }}
              className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed border-[#3899aa]/40 hover:border-[#3899aa]/70 hover:bg-[#3899aa]/5 transition-colors text-left"
            >
              <Sparkles className="w-4 h-4 text-[#3899aa] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#3899aa]">
                  Aucune mesure prédéfinie ne correspond
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Ajouter «&nbsp;<strong>{search.trim()}</strong>&nbsp;» comme mesure libre
                </p>
              </div>
            </button>
          )}

          {filteredFields.length === 0 && !showSearchAsCustomShortcut && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {fields.length === 0
                ? "Aucun champ canonique configuré"
                : "Aucun résultat"}
            </p>
          )}

          {categories.map((cat) => (
            <div key={cat} className="mb-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-2 py-1.5">
                {cat}
              </p>
              <div className="space-y-1">
                {fieldsByCategory[cat].map((f) => {
                  const alreadyAdded = addedKeys.has(f.key);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleAddCanonical(f)}
                      disabled={alreadyAdded}
                      className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                        alreadyAdded
                          ? 'border-border/30 bg-muted/40 opacity-60 cursor-not-allowed'
                          : 'border-border/50 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.type === 'NUMERIC' && (f.unit ?? 'numérique')}
                          {f.type === 'BOOLEAN' && 'positif / négatif'}
                          {f.type === 'TEXT' && 'texte libre'}
                          {f.type === 'ENUM' && (f.options?.join(' · ') ?? 'liste')}
                        </p>
                      </div>
                      {alreadyAdded ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                          <Check className="w-3 h-3" />
                          Ajoutée
                        </span>
                      ) : (
                        <Plus className="w-4 h-4 text-[#3899aa] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Mesure libre (toujours visible en bas) */}
        <div className="border-t border-border/60 pt-3 -mb-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-2 mb-1.5">
            Mesure libre
          </p>
          <div className="flex gap-2">
            <Input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              placeholder="Ex : Test de Neer, observation posturale…"
              className="h-9 text-sm flex-1"
            />
            <Button
              type="button"
              onClick={handleAddCustom}
              disabled={!customDraft.trim() || addedCustomLabels.has(customDraft.trim().toLowerCase())}
              className="btn-teal h-9 rounded-full px-4"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Ajouter
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground italic mt-1.5 px-1">
            Pour les tests et observations qui ne sont pas dans la liste prédéfinie
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full h-9 text-sm">
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
