'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Video, Gift, Wrench, Loader2, ZoomIn } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

/**
 * Système « Nouveautés » — icône Sparkles dans le header + modale liste.
 * Contenu servi par l'API (/api/nouveautes), état lu/non-lu en DB.
 */

type Categorie = 'NOUVEAUTE' | 'AMELIORATION' | 'OFFRE';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface Nouveaute {
  id: number;
  titre: string;
  description: string;
  imageUrls: string[];
  categorie: Categorie;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  publishedAt: string; // ISO
  vue: boolean;
}

const CATEGORIE_META: Record<
  Categorie,
  { label: string; badge: string; gradient: string; icon: React.ComponentType<{ className?: string }> }
> = {
  NOUVEAUTE: {
    label: 'Nouveauté',
    badge: 'bg-[#3899aa]/10 text-[#3899aa] dark:bg-[#3899aa]/20',
    gradient: 'from-[#3899aa] to-[#2a7a8a]',
    icon: Video,
  },
  AMELIORATION: {
    label: 'Amélioration',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20',
    gradient: 'from-blue-500 to-blue-700',
    icon: Wrench,
  },
  OFFRE: {
    label: 'Offre',
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 dark:bg-purple-500/20',
    gradient: 'from-purple-500 to-purple-700',
    icon: Gift,
  },
};

function NouveauteCarousel({
  imageUrls,
  gradient,
  Icon,
}: {
  imageUrls: string[];
  gradient: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const count = imageUrls.length;

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 4000);
    return () => clearInterval(id);
  }, [count, paused]);

  if (count === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
        <Icon className="h-12 w-12 text-white/90" />
      </div>
    );
  }

  return (
    <>
      <div
        className="relative h-full w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {imageUrls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            title="Cliquer pour agrandir"
            onClick={() => setZoomed(url)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
              i === index ? 'cursor-zoom-in opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
        ))}
        {/* Indice de zoom */}
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/45 p-1 text-white opacity-80">
          <ZoomIn className="h-3.5 w-3.5" />
        </span>
        {count > 1 && (
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {imageUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Image ${i + 1}`}
                className={`h-1.5 rounded-full bg-white transition-all ${
                  i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-60'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox zoom (image entière, fermeture X / Échap / clic hors image) */}
      <Dialog open={!!zoomed} onOpenChange={(o) => !o && setZoomed(null)}>
        <DialogContent className="w-[96vw] max-w-6xl border-0 bg-transparent p-0 shadow-none">
          {zoomed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoomed}
              alt=""
              className="mx-auto max-h-[90vh] w-auto rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NouveauteCard({ n, onCtaClick }: { n: Nouveaute; onCtaClick: () => void }) {
  const meta = CATEGORIE_META[n.categorie];

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Média héro 16:9 (carrousel crossfade si plusieurs images) */}
      <div className="relative aspect-[16/9] w-full bg-muted">
        <NouveauteCarousel imageUrls={n.imageUrls} gradient={meta.gradient} Icon={meta.icon} />
        {!n.vue && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-[#3899aa] shadow-sm dark:bg-gray-900/90">
            Nouveau
          </span>
        )}
      </div>

      {/* Corps */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.badge}`}
          >
            {meta.label}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={n.publishedAt}>
            {new Date(n.publishedAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        </div>
        <h3 className="mt-2 text-base font-semibold leading-tight text-foreground">{n.titre}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{n.description}</p>
        {n.ctaHref && n.ctaLabel && (
          <Link
            href={n.ctaHref}
            onClick={onCtaClick}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#3899aa] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d7a88]"
          >
            {n.ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </article>
  );
}

export default function NouveautesButton() {
  const [items, setItems] = useState<Nouveaute[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/nouveautes/unread-count`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setUnreadCount(data.count);
      }
    } catch {
      /* silencieux */
    }
  };

  const fetchNouveautes = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`${API_URL}/api/nouveautes`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setItems(data.nouveautes);
      }
    } catch {
      /* silencieux */
    } finally {
      setLoading(false);
    }
  };

  // Compteur au montage + polling 60s (comme la cloche)
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      fetchNouveautes();
      // Ouvrir la modale = marquer comme vu (le point s'éteint), l'historique reste visible
      if (unreadCount > 0) {
        setUnreadCount(0);
        fetchWithAuth(`${API_URL}/api/nouveautes/mark-seen`, { method: 'POST' }).catch(() => {});
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="relative inline-flex items-center gap-1.5 rounded-full border border-[#3899aa]/30 bg-[#3899aa]/5 px-2.5 py-1.5 text-sm font-medium text-[#3899aa] transition-colors hover:bg-[#3899aa]/10 sm:px-3"
        title="Nouveautés"
        aria-label="Nouveautés"
      >
        <Sparkles className={`h-4 w-4 ${unreadCount > 0 ? 'animate-twinkle' : ''}`} />
        <span className="hidden sm:inline">Nouveautés</span>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3899aa] opacity-90" />
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-[#3899aa]/60" />
            <span className="relative m-auto inline-flex h-3 w-3 rounded-full bg-[#3899aa] ring-2 ring-white dark:ring-gray-900" />
          </span>
        )}
      </button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="h-[92vh] w-[96vw] max-w-7xl gap-0 overflow-hidden p-0 sm:h-[90vh]">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-[#3899aa]" />
              Nouveautés
            </DialogTitle>
          </DialogHeader>

          <div className="h-[calc(92vh-61px)] overflow-y-auto p-4 sm:h-[calc(90vh-61px)] sm:p-6">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Aucune nouveauté pour le moment</p>
              </div>
            ) : (
              <div className="mx-auto flex max-w-4xl flex-col gap-6">
                {items.map((n) => (
                  <NouveauteCard key={n.id} n={n} onCtaClick={() => setIsOpen(false)} />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
