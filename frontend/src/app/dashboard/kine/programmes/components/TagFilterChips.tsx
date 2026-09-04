'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TagFilterChipsProps {
  tags: readonly string[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
  className?: string;
}

/**
 * Rangée de « filter chips » (Material Design 3) : des boutons à bascule qui
 * affinent la liste en dessous. Chaque chip est un vrai bouton avec
 * `aria-pressed` (WAI-ARIA toggle button), la coche n'apparaît qu'à l'état
 * sélectionné, et le groupe est nommé pour les lecteurs d'écran.
 */
export function TagFilterChips({
  tags,
  selected,
  onToggle,
  onClear,
  className,
}: TagFilterChipsProps) {
  const hasSelection = selected.length > 0;

  return (
    <div
      role="group"
      aria-label="Filtrer par catégorie"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {tags.map((tag) => {
        const pressed = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(tag)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
              'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              pressed
                ? 'border-[#3899aa] bg-[#3899aa]/15 text-[#1f5c6a] dark:bg-[#3899aa]/25 dark:text-[#9fd8e3]'
                : 'border-input bg-background text-foreground hover:bg-muted',
            )}
          >
            {pressed && <Check className="size-4" aria-hidden="true" />}
            {tag}
          </button>
        );
      })}

      {hasSelection && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 px-2 text-muted-foreground"
        >
          <X className="size-4" aria-hidden="true" />
          Effacer
        </Button>
      )}
    </div>
  );
}
