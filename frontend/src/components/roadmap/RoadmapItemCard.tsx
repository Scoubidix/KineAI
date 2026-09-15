'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Target, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoadmapItem, RoadmapStatut, STATUT_META } from './types';

interface Props {
  item: RoadmapItem;
  featured?: boolean;
  onProposerIdee?: (item: RoadmapItem) => void;
}

/**
 * Pill de statut à point coloré (Linear / Jira) : le libellé est toujours écrit,
 * le point n'est qu'un renfort visuel (aria-hidden). `onDark` pour le hero teal.
 */
export function StatusPill({ statut, onDark = false, className }: { statut: RoadmapStatut; onDark?: boolean; className?: string }) {
  const meta = STATUT_META[statut];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        onDark ? 'border-white/25 bg-white/20 text-white' : meta.pill,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', onDark ? 'bg-white' : meta.dot, onDark && statut === 'EN_COURS' && 'animate-pulse')}
      />
      {meta.label}
    </span>
  );
}

function IdeeButton({ item, onProposerIdee, onDark = false }: { item: RoadmapItem; onProposerIdee: (item: RoadmapItem) => void; onDark?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'px-2',
        onDark
          ? 'text-white hover:bg-white/15 hover:text-white'
          : '-ml-2 text-[#3899aa] hover:bg-[#3899aa]/10 hover:text-[#2f8393]'
      )}
      onClick={() => onProposerIdee(item)}
    >
      <Lightbulb aria-hidden="true" className="mr-1.5 h-4 w-4" />
      Une idée sur ce sujet ?
    </Button>
  );
}

export default function RoadmapItemCard({ item, featured = false, onProposerIdee }: Props) {
  if (featured) {
    // Hero « Objectif n°1 » (Notion, Canny « Now ») : bandeau pleine largeur.
    // Fond teal foncé uni (#2a7a88) : blanc sur ce fond ≈ 4,96:1, soit AA sur toute la zone de
    // texte, quel que soit le retour à la ligne. Seule variation : le motif décoratif 100 % CSS
    // (aucune image), cantonné au coin bas-droite, donc jamais sous le texte.
    return (
      <Card className="relative overflow-hidden rounded-2xl border-0 bg-[#2a7a88] text-white shadow-md animate-in fade-in duration-500">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 92% 88%, rgba(255,255,255,0.18), transparent 55%), radial-gradient(circle at 72% 118%, rgba(255,255,255,0.10), transparent 45%)',
          }}
        />
        <CardContent className="relative p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Target aria-hidden="true" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/90">Objectif n°1</p>
              <h2 className="mt-1.5 text-xl font-bold md:text-2xl">{item.titre}</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-white md:text-base">{item.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StatusPill statut={item.statut} onDark />
                {onProposerIdee && <IdeeButton item={item} onProposerIdee={onProposerIdee} onDark />}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full rounded-xl border-gray-200 bg-white shadow-sm transition hover:border-[#3899aa]/40 hover:shadow-md animate-in fade-in">
      <CardContent className="flex h-full flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-gray-900">{item.titre}</h3>
          <StatusPill statut={item.statut} />
        </div>
        <p className="whitespace-pre-line text-sm text-gray-600">{item.description}</p>
        {onProposerIdee && (
          <div className="mt-auto pt-3">
            <IdeeButton item={item} onProposerIdee={onProposerIdee} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
