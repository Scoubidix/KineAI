'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Newspaper } from 'lucide-react';
import NouveauteCarousel from '@/components/nouveautes/NouveauteCarousel';
import type { NewsItem } from './types';

const GRADIENT = 'from-[#3899aa] to-[#2a7a8a]';

/** Lit l'année/mois/jour/jour-de-semaine d'une date en heure de Paris, indépendamment du fuseau local */
function getParisDateParts(d: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdayMap[get('weekday')] ?? 1,
  };
}

/** « Semaine du 6 octobre » : le lundi de la semaine de publication, calculé en heure de Paris */
export function weekLabel(iso: string): string {
  const { year, month, day, weekday } = getParisDateParts(new Date(iso));
  // Date UTC « neutre » représentant le jour calendaire parisien, pour l'arithmétique de dates
  const mondayUtc = new Date(Date.UTC(year, month - 1, day - (weekday - 1)));
  return `Semaine du ${mondayUtc.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
}

const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

function NewBadge() {
  return <span className="rounded-full bg-[#3899aa]/10 px-2 py-0.5 text-[11px] font-semibold text-[#3899aa]">Nouveau</span>;
}

function Cta({ n }: { n: NewsItem }) {
  if (!n.ctaHref || !n.ctaLabel) return null;
  return (
    <Link href={n.ctaHref} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#3899aa] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d7a88]">
      {n.ctaLabel}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/** La news de la semaine : image et texte côte à côte sur ordinateur, empilés sur téléphone */
export function NewsFeatured({ n }: { n: NewsItem }) {
  return (
    <article className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        <NouveauteCarousel imageUrls={n.imageUrls} gradient={GRADIENT} Icon={Newspaper} />
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {!n.vue && <NewBadge />}
          <time dateTime={n.publishedAt}>{weekLabel(n.publishedAt)}</time>
        </div>
        <h2 className="mt-2 text-xl font-semibold leading-tight text-foreground">{n.titre}</h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{n.description}</p>
        <Cta n={n} />
      </div>
    </article>
  );
}

/**
 * Une news de l'archive : vignette, titre, date, deux lignes ; « Lire la suite » la déplie sur
 * place (motif disclosure WAI-ARIA) pour garder sa position dans la liste.
 */
export function NewsArchiveItem({ n }: { n: NewsItem }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <article className="border-b border-border/60 py-4 last:border-b-0">
      <div className="flex gap-3">
        {!open && (
          <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md bg-muted">
            {n.imageUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.imageUrls[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${GRADIENT}`}>
                <Newspaper className="h-6 w-6 text-white/90" />
              </div>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-foreground">{n.titre}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {!n.vue && <NewBadge />}
            <time dateTime={n.publishedAt}>{dayLabel(n.publishedAt)}</time>
          </div>
          {!open && <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{n.description}</p>}
        </div>
      </div>
      {open && (
        <div id={bodyId} className="mt-3 space-y-3">
          {n.imageUrls.length > 0 && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
              <NouveauteCarousel imageUrls={n.imageUrls} gradient={GRADIENT} Icon={Newspaper} />
            </div>
          )}
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{n.description}</p>
          <Cta n={n} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="mt-2 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-[#3899aa] hover:underline"
      >
        {open ? 'Réduire' : 'Lire la suite'}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </article>
  );
}
