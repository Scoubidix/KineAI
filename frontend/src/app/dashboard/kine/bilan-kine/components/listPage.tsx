'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mobilier commun aux pages de liste du module bilan (brouillons, bilans réalisés).
 * Trois pages qui recopieraient ces morceaux finiraient par diverger : les partager fait
 * de « le même style » une propriété du code, pas une intention.
 */

/** Surface des blocs : la carte blanche élevée du reste de l'app (partie statique de .card-hover,
 *  sans son halo teal, réservé au cliquable). */
export const CARD = 'rounded-xl bg-white dark:bg-card border border-border shadow-md';

/** Repli pour comparer des textes sans accent ni casse : « lombalgie » trouve « Lombalgie ». */
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const formatDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Barre d'application (MD3 top app bar) : le retour partage la ligne du titre plutôt que de
 * flotter seul au-dessus. C'est un lien et non un bouton, pour que Ctrl-clic et clic-milieu
 * ouvrent le niveau parent dans un onglet.
 */
export function PageHeader({ backHref, backLabel, title, right }: {
  backHref: string;
  backLabel: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0">
        <Link href={backHref} aria-label={backLabel} title={backLabel}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <h1 className="text-lg font-semibold truncate text-[#3899aa] flex-1">{title}</h1>
      {right}
    </div>
  );
}

/** Squelettes à la forme d'une ligne (pastille ronde + deux barres), pas des barres génériques. */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className={`${CARD} divide-y divide-border/60 overflow-hidden`} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** État vide : pastille emoji sur fond pastel, message, action facultative. */
export function EmptyState({ emoji, badgeClass, message, action }: {
  emoji: string;
  badgeClass: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${CARD} py-12 text-center space-y-3`}>
      <div aria-hidden="true" className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-2xl ${badgeClass}`}>{emoji}</div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

/**
 * Puce de filtre (filter chip, Material Design 3) : le compteur répond à la question sans
 * qu'on ait besoin de filtrer. L'ambre est réservé à ce qui réclame une action du kiné.
 */
export function FilterChip({ label, count, active, amber = false, onClick }: {
  label: string;
  count: number;
  active: boolean;
  amber?: boolean;
  onClick: () => void;
}) {
  const tone = amber
    ? 'border-amber-500 bg-amber-500/10 text-amber-700'
    : 'border-[#3899aa] bg-[#3899aa]/10 text-[#3899aa]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-colors ${active ? tone : 'border-border bg-white dark:bg-card text-muted-foreground hover:bg-muted/60'}`}
    >
      {label}
      <span className={`tabular-nums ${active ? '' : amber ? 'text-amber-700' : 'text-foreground/70'}`}>{count}</span>
    </button>
  );
}

/** Avatar à initiales, ou une icône de repli quand le nom manque. */
export function Initials({ first, last, fallback }: { first?: string; last?: string; fallback: React.ReactNode }) {
  const ini = `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  return (
    <span aria-hidden="true" className="shrink-0 w-9 h-9 rounded-full bg-[#3899aa]/10 text-[#3899aa] text-xs font-semibold inline-flex items-center justify-center">
      {ini || fallback}
    </span>
  );
}
