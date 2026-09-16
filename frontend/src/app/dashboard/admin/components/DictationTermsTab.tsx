'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';

type Statut = 'NOUVEAU' | 'RETENU' | 'ECARTE';

interface TermRow {
  id: number;
  heard: string;
  expected: string;
  /** Ce que le correcteur avait produit, quand le signalement portait sur SA sortie */
  correctorOutput: string | null;
  statut: Statut;
  reportCount: number;
  kineCount: number;
  lastReportedAt: string;
}

const FILTRES: { value: Statut | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'NOUVEAU', label: 'Nouveaux' },
  { value: 'RETENU', label: 'Retenus' },
  { value: 'ECARTE', label: 'Écartés' },
];

const STATUT_LABEL: Record<Statut, string> = { NOUVEAU: 'Nouveau', RETENU: 'Retenu', ECARTE: 'Écarté' };

/**
 * Vocabulaire signalé par les kinés. Un terme retenu rejoint le vocabulaire de la passe de
 * correction pour toute la plateforme, sans déploiement — d'où l'arbitrage manuel.
 *
 * Le nombre de kinés distincts compte plus que le nombre de signalements : sept fois par un seul
 * kiné, c'est sa prononciation ; par quatre kinés, c'est un trou de vocabulaire.
 */
export default function DictationTermsTab() {
  const { toast } = useToast();
  const [filtre, setFiltre] = useState<Statut | ''>('NOUVEAU');
  const [rows, setRows] = useState<TermRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ id: number; heard: string; expected: string } | null>(null);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setRows(null);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/admin/dictation-terms${filtre ? `?statut=${filtre}` : ''}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error('Lecture impossible');
      const data = await res.json();
      // Filtre changé pendant la requête : cette réponse ne concerne plus ce que l'écran affiche
      if (!isCurrent()) return;
      setRows(data.terms ?? []);
    } catch (e) {
      if (!isCurrent()) return;
      setRows([]);
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  }, [filtre, toast]);

  useEffect(() => {
    let cancelled = false;
    void load(() => !cancelled);
    return () => { cancelled = true; };
  }, [load]);

  /**
   * Corrige une paire. Rogner une sélection trop large la fait souvent converger vers une paire
   * déjà présente : le serveur fusionne alors les deux lignes, compteurs additionnés.
   */
  const saveEdit = async (id: number) => {
    if (!edit) return;
    setBusy(id);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/dictation-terms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ heard: edit.heard, expected: edit.expected }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Écriture impossible');
      setEdit(null);
      toast({ title: 'Paire corrigée' });
      await load();
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const setStatut = async (id: number, statut: Statut) => {
    setBusy(id);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/dictation-terms/${id}/statut`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }),
      });
      if (!res.ok) throw new Error('Écriture impossible');
      toast({ title: statut === 'RETENU' ? 'Terme retenu' : 'Terme écarté' });
      await load();
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTRES.map((f) => (
          <Button key={f.value || 'tous'} size="sm" variant={filtre === f.value ? 'default' : 'outline'} onClick={() => setFiltre(f.value)} className="h-8 rounded-full px-3">
            {f.label}
          </Button>
        ))}
      </div>

      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Aucun terme signalé pour ce filtre.</p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                {edit?.id === r.id ? (
                  // Les deux formes se corrigent : un kiné qui sélectionne « de la saigue » produit
                  // une correspondance trop spécifique, qui ne se déclencherait presque jamais.
                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={edit.heard} onChange={(e) => setEdit({ ...edit, heard: e.target.value })} maxLength={80} aria-label="Forme entendue" className="h-9 w-48 text-sm" />
                    <span className="text-muted-foreground" aria-hidden>→</span>
                    <Input value={edit.expected} onChange={(e) => setEdit({ ...edit, expected: e.target.value })} maxLength={80} aria-label="Forme attendue" className="h-9 w-48 text-sm" />
                    <Button size="sm" disabled={busy === r.id} onClick={() => saveEdit(r.id)} className="btn-teal h-9 rounded-full px-3">Enregistrer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(null)} className="h-9 rounded-full px-3">Annuler</Button>
                  </div>
                ) : (
                  <p className="text-sm">
                    <span className="text-muted-foreground">« {r.heard} »</span>
                    <span className="mx-2" aria-hidden>→</span>
                    <span className="font-semibold">{r.expected}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.reportCount} signalement{r.reportCount > 1 ? 's' : ''} · {r.kineCount} kiné{r.kineCount > 1 ? 's' : ''} · {new Date(r.lastReportedAt).toLocaleDateString('fr-FR')} · {STATUT_LABEL[r.statut]}
                </p>
                {/* Une provenance veut dire que le correcteur s'est trompé sur ce terme : il avait
                    produit cette forme-là, et c'est elle que le kiné a jugée fausse. */}
                {r.correctorOutput && (
                  <p className="text-xs text-amber-700 mt-0.5">Le correcteur avait écrit « {r.correctorOutput} »</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {edit?.id !== r.id && (
                  <Button size="sm" variant="ghost" aria-label="Corriger la paire" onClick={() => setEdit({ id: r.id, heard: r.heard, expected: r.expected })} className="h-8 w-8 p-0">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" disabled={busy === r.id || r.statut === 'RETENU'} onClick={() => setStatut(r.id, 'RETENU')} className="btn-teal h-8 rounded-full px-3">Retenir</Button>
                <Button size="sm" variant="outline" disabled={busy === r.id || r.statut === 'ECARTE'} onClick={() => setStatut(r.id, 'ECARTE')} className="h-8 rounded-full px-3">Écarter</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
