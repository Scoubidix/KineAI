'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { NewsItem } from './types';

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

/** La news de la semaine : texte seul, l'image masquait la news (surtout sur téléphone) */
export function NewsFeatured({ n }: { n: NewsItem }) {
  return (
    <article>
      <div className="flex flex-wrap items-center gap-2">
        {!n.vue && <NewBadge />}
        <h2 className="text-xl font-semibold leading-tight text-foreground">{n.titre}</h2>
      </div>
      <time dateTime={n.publishedAt} className="mt-1 block text-sm text-muted-foreground">{dayLabel(n.publishedAt)}</time>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{n.description}</p>
      <Cta n={n} />
    </article>
  );
}

/**
 * Une news de l'archive : titre, date, deux lignes ; « Lire la suite » la déplie sur
 * place (motif disclosure WAI-ARIA) pour garder sa position dans la liste.
 */
export function NewsArchiveItem({ n }: { n: NewsItem }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <article className="border-b border-border/60 py-4 last:border-b-0">
      <h3 className="font-semibold leading-snug text-foreground">{n.titre}</h3>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {!n.vue && <NewBadge />}
        <time dateTime={n.publishedAt}>{dayLabel(n.publishedAt)}</time>
      </div>
      {!open && <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{n.description}</p>}
      {open && (
        <div id={bodyId} className="mt-3">
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
