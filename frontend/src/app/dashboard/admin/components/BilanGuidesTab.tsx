'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pencil, PenLine, RefreshCw, Search } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { matchesAllTokens } from '@/utils/textSearch';
import type { AdminBilanGuide, AdminBilanGuideRow } from '@/types/bilan';
import BilanGuideEditorDialog from './BilanGuideEditorDialog';

const API = process.env.NEXT_PUBLIC_API_URL;

type Filter = 'all' | 'missing' | 'done';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'missing', label: 'Sans fiche' },
  { value: 'done', label: 'Avec fiche' },
];

// Une fiche « compte » dès que sa description est remplie : c'est ce qui affiche le bouton ⓘ au kiné
const hasText = (row: AdminBilanGuideRow) => Boolean(row.guide?.content.trim());

/** Sous-onglet admin « Fiches tests » : avancement, recherche, édition des fiches pratiques. */
export default function BilanGuidesTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminBilanGuideRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<AdminBilanGuideRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API}/api/admin/bilan-guides`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur');
      setRows(json.fields);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les fiches', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const doneCount = useMemo(() => rows.filter(hasText).length, [rows]);

  const groups = useMemo(() => {
    const visible = rows.filter((r) =>
      (filter === 'all' || (filter === 'done') === hasText(r)) && (!query.trim() || matchesAllTokens(r.label, query))
    );
    const byCategory = new Map<string, AdminBilanGuideRow[]>();
    for (const r of visible) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
    return [...byCategory.entries()];
  }, [rows, filter, query]);

  const handleSaved = (fieldKey: string, guide: AdminBilanGuide) => {
    setRows((prev) => prev.map((r) => (r.fieldKey === fieldKey ? { ...r, guide } : r)));
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">{doneCount} / {rows.length}</span> fiches rédigées
          </p>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un test…" className="h-9 pl-8" aria-label="Rechercher un test" />
          </div>
          <div className="flex gap-1" role="group" aria-label="Filtrer les tests">
            {FILTERS.map((f) => (
              <Button key={f.value} type="button" size="sm" variant={filter === f.value ? 'default' : 'outline'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun test ne correspond.</p>
        ) : (
          <div className="space-y-5">
            {groups.map(([category, list]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-semibold text-[#3899aa]">{category}</h3>
                <div className="divide-y rounded-md border">
                  {list.map((r) => (
                    <div key={r.fieldKey} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{r.label}</span>
                      {hasText(r) && <Badge variant="secondary" className="text-[10px]">texte ✓</Badge>}
                      {r.guide?.youtubeId && <Badge variant="secondary" className="text-[10px]">vidéo ✓</Badge>}
                      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEditing(r)}>
                        {hasText(r) ? <Pencil className="h-3.5 w-3.5 mr-1.5" /> : <PenLine className="h-3.5 w-3.5 mr-1.5" />}
                        {hasText(r) ? 'Modifier' : 'Rédiger'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <BilanGuideEditorDialog row={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
    </Card>
  );
}
