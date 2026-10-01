'use client';

/**
 * Page « News de la semaine » — modèle « mise en avant + archive » des pages d'actualités :
 * la plus récente en grand, les précédentes en liste compacte dépliable, chargées par 10.
 * Pas de pastille de menu : le badge « Nouveau » sur la page suffit (décision du 2026-10-01).
 */

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Loader2, Newspaper } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { NewsArchiveItem, NewsFeatured } from './NewsCard';
import type { NewsItem, NewsPageResponse } from './types';

const API = process.env.NEXT_PUBLIC_API_URL;
const PAGE_SIZE = 10;

async function fetchNewsPage(cursor?: NewsItem): Promise<NewsPageResponse> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) {
    params.set('before', cursor.publishedAt);
    params.set('beforeId', String(cursor.id));
  }
  const res = await fetchWithAuth(`${API}/api/news?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await fetchNewsPage();
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.hasMore);
        // Vues dès l'affichage ; les badges « Nouveau » restent visibles pendant cette visite
        if (page.items.some((n) => !n.vue)) {
          fetchWithAuth(`${API}/api/news/mark-seen`, { method: 'POST' }).catch(() => {});
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setError(false);
    try {
      const page = await fetchNewsPage(items[items.length - 1]);
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
      // Une news non vue peut arriver sur une page suivante ; les badges déjà affichés restent visibles
      if (page.items.some((n) => !n.vue)) {
        fetchWithAuth(`${API}/api/news/mark-seen`, { method: 'POST' }).catch(() => {});
      }
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const [featured, ...archive] = items;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-[#3899aa] sm:text-2xl">
          <Newspaper className="h-6 w-6" />
          News de la semaine
        </h1>
      </header>

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : error && items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />Impossible de charger les news pour le moment.
        </p>
      ) : !featured ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Pas encore de news. Rendez-vous lundi !</p>
      ) : (
        <>
          <NewsFeatured n={featured} />
          {archive.length > 0 && (
            <section aria-labelledby="news-archive" className="mx-auto max-w-[720px]">
              <h2 id="news-archive" className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Précédemment
              </h2>
              {archive.map((n) => <NewsArchiveItem key={n.id} n={n} />)}
            </section>
          )}
          {error && (
            <p role="alert" className="text-center text-sm text-destructive">
              Impossible de charger la suite. Réessaie dans un instant.
            </p>
          )}
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="rounded-full">
                {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Voir plus
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
