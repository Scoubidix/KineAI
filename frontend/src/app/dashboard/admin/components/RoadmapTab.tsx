'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, RefreshCw, Target } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

type Horizon = 'COURT_TERME' | 'MOYEN_LONG_TERME';
type Statut = 'A_L_ETUDE' | 'PREVU' | 'EN_COURS';
type IdeeStatut = 'NOUVELLE' | 'VUE' | 'RETENUE' | 'ECARTEE';

interface AdminItem {
  id: number;
  titre: string;
  description: string;
  horizon: Horizon;
  statut: Statut;
  isObjectifPrincipal: boolean;
  isActive: boolean;
  createdAt: string;
  ideesCount: number;
}

interface AdminIdee {
  id: number;
  titre: string;
  description: string;
  statut: IdeeStatut;
  createdAt: string;
  kine: { id: number; firstName: string | null; lastName: string | null; email: string };
  item: { id: number; titre: string } | null;
}

interface FormState {
  id?: number;
  titre: string;
  description: string;
  horizon: Horizon;
  statut: Statut;
  isObjectifPrincipal: boolean;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  titre: '', description: '', horizon: 'COURT_TERME', statut: 'PREVU', isObjectifPrincipal: false, isActive: true,
};

const HORIZON_LABEL: Record<Horizon, string> = { COURT_TERME: 'Court terme', MOYEN_LONG_TERME: 'Moyen / long terme' };
const STATUT_LABEL: Record<Statut, string> = { A_L_ETUDE: 'À l\'étude', PREVU: 'Prévu', EN_COURS: 'En cours' };
const IDEE_STATUT_LABEL: Record<IdeeStatut, string> = { NOUVELLE: 'Nouvelle', VUE: 'Vue', RETENUE: 'Retenue', ECARTEE: 'Écartée' };
const IDEE_STATUT_CLASS: Record<IdeeStatut, string> = {
  NOUVELLE: 'bg-amber-100 text-amber-800',
  VUE: 'bg-gray-100 text-gray-700',
  RETENUE: 'bg-green-100 text-green-700',
  ECARTEE: 'bg-red-100 text-red-700',
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function RoadmapTab() {
  const { toast } = useToast();

  // ---- Cards ----
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminItem | null>(null);

  // ---- Idées ----
  const [idees, setIdees] = useState<AdminIdee[]>([]);
  const [loadingIdees, setLoadingIdees] = useState(true);
  const [ideeFilter, setIdeeFilter] = useState<IdeeStatut | 'ALL'>('ALL');
  const [ideeItemFilter, setIdeeItemFilter] = useState<number | 'ALL'>('ALL');

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await fetchWithAuth(`${API}/api/admin/roadmap/items`);
      const data = await res.json();
      if (data.success) setItems(data.items);
      else toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les cards.', variant: 'destructive' });
    } finally {
      setLoadingItems(false);
    }
  }, [toast]);

  const loadIdees = useCallback(async () => {
    setLoadingIdees(true);
    try {
      const params = new URLSearchParams();
      if (ideeFilter !== 'ALL') params.set('statut', ideeFilter);
      if (ideeItemFilter !== 'ALL') params.set('itemId', String(ideeItemFilter));
      const qs = params.toString();
      const res = await fetchWithAuth(`${API}/api/admin/roadmap/idees${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      if (data.success) setIdees(data.idees);
      else toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les idées.', variant: 'destructive' });
    } finally {
      setLoadingIdees(false);
    }
  }, [ideeFilter, ideeItemFilter, toast]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadIdees(); }, [loadIdees]);

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (item: AdminItem) => {
    setForm({
      id: item.id, titre: item.titre, description: item.description, horizon: item.horizon,
      statut: item.statut, isObjectifPrincipal: item.isObjectifPrincipal, isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const canSave = form.titre.trim().length >= 3 && form.description.trim().length >= 10 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { id, ...payload } = form;
      const url = id ? `${API}/api/admin/roadmap/items/${id}` : `${API}/api/admin/roadmap/items`;
      const res = await fetchWithAuth(url, {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ ...payload, titre: payload.titre.trim(), description: payload.description.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: id ? 'Card mise à jour' : 'Card créée' });
        setDialogOpen(false);
        loadItems();
      } else {
        toast({ title: 'Erreur', description: data.error || 'Enregistrement impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Enregistrement impossible', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetchWithAuth(`${API}/api/admin/roadmap/items/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Card supprimée' });
        loadItems();
      } else {
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Suppression impossible', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const setIdeeStatut = async (idee: AdminIdee, statut: IdeeStatut) => {
    const previous = idees;
    setIdees((list) => list.map((i) => (i.id === idee.id ? { ...i, statut } : i)));
    try {
      const res = await fetchWithAuth(`${API}/api/admin/roadmap/idees/${idee.id}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch {
      setIdees(previous);
      toast({ title: 'Erreur', description: 'Changement de statut impossible', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* ================= CARDS ================= */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Cards roadmap ({items.length})</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadItems} disabled={loadingItems}>
              <RefreshCw className={`h-4 w-4 ${loadingItems ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={openCreate} className="bg-[#3899aa] hover:bg-[#2f8393] text-white">
              <Plus className="h-4 w-4 mr-1" /> Nouvelle card
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingItems && items.length === 0 && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          {!loadingItems && items.length === 0 && <p className="text-sm text-gray-500">Aucune card. Crée la première.</p>}
          {items.map((item) => (
            <div key={item.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${item.isActive ? '' : 'opacity-60'}`}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-gray-900">{item.titre}</span>
                  {item.isObjectifPrincipal && (
                    <Badge className="bg-[#3899aa] text-white hover:bg-[#3899aa]"><Target className="h-3 w-3 mr-1" />Objectif n°1</Badge>
                  )}
                  <Badge variant="secondary">{HORIZON_LABEL[item.horizon]}</Badge>
                  <Badge variant="secondary">{STATUT_LABEL[item.statut]}</Badge>
                  {!item.isActive && <Badge variant="destructive">Inactive</Badge>}
                  {item.ideesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setIdeeItemFilter(item.id)}
                      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                      title="Voir les idées reçues sur cette card"
                    >
                      {item.ideesCount} idée{item.ideesCount > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item)} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ================= IDÉES ================= */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Idées reçues ({idees.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={String(ideeItemFilter)} onValueChange={(v) => setIdeeItemFilter(v === 'ALL' ? 'ALL' : Number(v))}>
              <SelectTrigger className="w-52 h-9" aria-label="Filtrer par card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les cards</SelectItem>
                {items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.titre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ideeFilter} onValueChange={(v) => setIdeeFilter(v as IdeeStatut | 'ALL')}>
              <SelectTrigger className="w-40 h-9" aria-label="Filtrer par statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes</SelectItem>
                {(Object.keys(IDEE_STATUT_LABEL) as IdeeStatut[]).map((s) => (
                  <SelectItem key={s} value={s}>{IDEE_STATUT_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadIdees} disabled={loadingIdees}>
              <RefreshCw className={`h-4 w-4 ${loadingIdees ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingIdees && idees.length === 0 && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          {!loadingIdees && idees.length === 0 && <p className="text-sm text-gray-500">Aucune idée pour ce filtre.</p>}
          {idees.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Kiné</th>
                    <th className="py-2 pr-3">Idée</th>
                    <th className="py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {idees.map((idee) => (
                    <tr key={idee.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3 whitespace-nowrap text-gray-600">{formatDate(idee.createdAt)}</td>
                      <td className="py-3 pr-3">
                        <div className="font-medium text-gray-900">{[idee.kine.firstName, idee.kine.lastName].filter(Boolean).join(' ') || '—'}</div>
                        <div className="text-xs text-gray-500">{idee.kine.email}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-medium text-gray-900">{idee.titre}</div>
                        {idee.item && (
                          <span className="inline-block mb-1 rounded bg-[#3899aa]/10 px-1.5 py-0.5 text-xs text-[#3899aa]">{idee.item.titre}</span>
                        )}
                        <p className="text-gray-600 whitespace-pre-line">{idee.description}</p>
                      </td>
                      <td className="py-3">
                        <Select value={idee.statut} onValueChange={(v) => setIdeeStatut(idee, v as IdeeStatut)}>
                          <SelectTrigger className={`w-32 h-8 border-0 ${IDEE_STATUT_CLASS[idee.statut]}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(IDEE_STATUT_LABEL) as IdeeStatut[]).map((s) => (
                              <SelectItem key={s} value={s}>{IDEE_STATUT_LABEL[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= DIALOG CARD ================= */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Modifier la card' : 'Nouvelle card'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rm-titre">Titre *</Label>
              <Input id="rm-titre" value={form.titre} maxLength={120} onChange={(e) => setForm({ ...form, titre: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-description">Description *</Label>
              <Textarea id="rm-description" rows={4} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Horizon</Label>
                <Select value={form.horizon} onValueChange={(v) => setForm({ ...form, horizon: v as Horizon })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(HORIZON_LABEL) as Horizon[]).map((h) => <SelectItem key={h} value={h}>{HORIZON_LABEL[h]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v as Statut })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUT_LABEL) as Statut[]).map((s) => <SelectItem key={s} value={s}>{STATUT_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="rm-objectif">Objectif n°1</Label>
                <p className="text-xs text-gray-500">Affichée en grand en tête de page. Retire le flag de l'autre card.</p>
              </div>
              <Switch id="rm-objectif" checked={form.isObjectifPrincipal} onCheckedChange={(v) => setForm({ ...form, isObjectifPrincipal: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="rm-active">Active</Label>
                <p className="text-xs text-gray-500">Une card inactive n'est pas visible par les kinés.</p>
              </div>
              <Switch id="rm-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={save} disabled={!canSave} className="bg-[#3899aa] hover:bg-[#2f8393] text-white">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= CONFIRMATION SUPPRESSION ================= */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette card ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.titre} » sera supprimée définitivement. Pour la masquer sans la perdre, désactive-la plutôt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
