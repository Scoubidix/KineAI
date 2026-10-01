'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Pencil, Trash2, Loader2, RefreshCw, ImagePlus, Image as ImageIcon, X } from 'lucide-react';

type Categorie = 'NOUVEAUTE' | 'AMELIORATION' | 'OFFRE';
type Plan = 'FREE' | 'DECLIC' | 'PRATIQUE' | 'PIONNIER' | 'EXPERT';

export type Canal = 'NOUVEAUTE' | 'NEWS';

// Libellés propres à chaque canal ; le formulaire est le même
const COPY: Record<Canal, { title: string; subtitle: string; empty: string; one: string; newOne: string; created: string; updated: string; deleted: string }> = {
  NOUVEAUTE: {
    title: 'Nouveautés',
    subtitle: 'Annonces produit affichées dans l’app (icône ✨).',
    empty: 'Aucune nouveauté. Clique sur « Nouvelle » pour en créer une.',
    one: 'la nouveauté', newOne: 'Nouvelle nouveauté',
    created: 'Nouveauté créée', updated: 'Nouveauté mise à jour', deleted: 'Nouveauté supprimée',
  },
  NEWS: {
    title: 'News de la semaine',
    subtitle: 'Page « News de la semaine » de la section Communauté, visible par tous les kinés.',
    empty: 'Aucune news. Clique sur « Nouvelle » pour en programmer une.',
    one: 'la news', newOne: 'Nouvelle news',
    created: 'News créée', updated: 'News mise à jour', deleted: 'News supprimée',
  },
};

// « Publiée le » en date + heure locales (input datetime-local) ; envoyé en ISO, donc converti
// dans le navigateur : le serveur (UTC) ne réinterprète pas « 08:00 » en 08:00 UTC
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const formatPublication = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface UploadedImage {
  path: string;
  url: string;
}

interface AdminNouveaute {
  id: number;
  titre: string;
  description: string;
  imagePaths: string[];
  imageUrls: string[];
  categorie: Categorie;
  ctaLabel: string | null;
  ctaHref: string | null;
  ciblePlans: Plan[];
  publishedAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface FormState {
  id?: number;
  titre: string;
  description: string;
  images: UploadedImage[];
  categorie: Categorie;
  ctaLabel: string;
  ctaHref: string;
  ciblePlans: Plan[];
  publishedAt: string; // yyyy-MM-ddTHH:mm (heure locale)
  expiresAt: string; // yyyy-mm-dd ou ''
  isActive: boolean;
}

const ALL_PLANS: Plan[] = ['FREE', 'DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'];
const CATEGORIES: { value: Categorie; label: string }[] = [
  { value: 'NOUVEAUTE', label: 'Nouveauté' },
  { value: 'AMELIORATION', label: 'Amélioration' },
  { value: 'OFFRE', label: 'Offre' },
];

const CATEGORIE_BADGE: Record<Categorie, string> = {
  NOUVEAUTE: 'bg-[#3899aa]/10 text-[#3899aa]',
  AMELIORATION: 'bg-blue-500/10 text-blue-600',
  OFFRE: 'bg-purple-500/10 text-purple-600',
};

const toDateInput = (iso: string | null): string => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

const EMPTY_FORM: FormState = {
  titre: '',
  description: '',
  images: [],
  categorie: 'NOUVEAUTE',
  ctaLabel: '',
  ctaHref: '',
  ciblePlans: [],
  publishedAt: '',
  expiresAt: '',
  isActive: true,
};

const API = process.env.NEXT_PUBLIC_API_URL;

export default function NouveautesTab({ canal = 'NOUVEAUTE' }: { canal?: Canal }) {
  const copy = COPY[canal];
  const isNews = canal === 'NEWS';
  const { toast } = useToast();
  const [items, setItems] = useState<AdminNouveaute[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminNouveaute | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`${API}/api/admin/nouveautes?canal=${canal}`);
      const data = await res.json();
      if (data.success) setItems(data.nouveautes);
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: `Chargement de ${copy.title.toLowerCase()} impossible` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, publishedAt: toLocalInput(new Date().toISOString()) });
    setDialogOpen(true);
  };

  const openEdit = (n: AdminNouveaute) => {
    setForm({
      id: n.id,
      titre: n.titre,
      description: n.description,
      images: (n.imagePaths ?? []).map((path, i) => ({ path, url: n.imageUrls?.[i] ?? '' })),
      categorie: n.categorie,
      ctaLabel: n.ctaLabel ?? '',
      ctaHref: n.ctaHref ?? '',
      ciblePlans: n.ciblePlans ?? [],
      publishedAt: toLocalInput(n.publishedAt),
      expiresAt: toDateInput(n.expiresAt),
      isActive: n.isActive,
    });
    setDialogOpen(true);
  };

  const togglePlan = (plan: Plan) => {
    setForm((f) => ({
      ...f,
      ciblePlans: f.ciblePlans.includes(plan)
        ? f.ciblePlans.filter((p) => p !== plan)
        : [...f.ciblePlans, plan],
    }));
  };

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetchWithAuth(`${API}/api/admin/nouveautes/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setForm((f) => ({ ...f, images: [...f.images, { path: data.imagePath, url: data.imageUrl }] }));
      } else {
        toast({ variant: 'destructive', title: 'Upload refusé', description: data.error || 'Erreur' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Upload de l'image impossible" });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (path: string) => {
    setForm((f) => ({ ...f, images: f.images.filter((img) => img.path !== path) }));
  };

  const save = async () => {
    if (!form.titre.trim() || !form.description.trim()) {
      toast({ variant: 'destructive', title: 'Champs requis', description: 'Titre et description obligatoires' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        titre: form.titre.trim(),
        description: form.description.trim(),
        imagePaths: form.images.map((img) => img.path),
        ctaLabel: form.ctaLabel.trim() || null,
        ctaHref: form.ctaHref.trim() || null,
        publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
        isActive: form.isActive,
        // Catégorie, ciblage et expiration n'existent que pour les nouveautés
        ...(isNews ? {} : { categorie: form.categorie, ciblePlans: form.ciblePlans, expiresAt: form.expiresAt || null }),
        // Le canal se fixe à la création, jamais ensuite
        ...(form.id ? {} : { canal }),
      };
      const url = form.id
        ? `${API}/api/admin/nouveautes/${form.id}`
        : `${API}/api/admin/nouveautes`;
      const res = await fetchWithAuth(url, {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: form.id ? copy.updated : copy.created });
        setDialogOpen(false);
        load();
      } else {
        toast({ variant: 'destructive', title: 'Erreur', description: data.error || 'Échec' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Enregistrement impossible' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetchWithAuth(`${API}/api/admin/nouveautes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: copy.deleted });
        setItems((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Suppression impossible' });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" className="btn-teal" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Nouvelle
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {copy.empty}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card key={n.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                  {n.imageUrls?.[0] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={n.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                      {n.imageUrls.length > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] font-medium text-white">
                          {n.imageUrls.length}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!isNews && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORIE_BADGE[n.categorie]}`}>
                        {CATEGORIES.find((c) => c.value === n.categorie)?.label}
                      </span>
                    )}
                    {new Date(n.publishedAt) > new Date() && (
                      <Badge className="bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">Programmée · {formatPublication(n.publishedAt)}</Badge>
                    )}
                    {!n.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{n.titre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {!isNews && <>Cible : {n.ciblePlans.length ? n.ciblePlans.join(', ') : 'Tous'} · </>}
                    Publiée le {formatPublication(n.publishedAt)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(n)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(n)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulaire créer / éditer */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? `Modifier ${copy.one}` : copy.newOne}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Images (carrousel) */}
            <div>
              <Label>Images — défilent en carrousel dans l&apos;app</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {form.images.map((img) => (
                  <div key={img.path} className="group relative aspect-[16/9] w-28 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(img.path)}
                      aria-label="Retirer l'image"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-[16/9] w-28 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  <span className="text-[10px]">Ajouter</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/gif,image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    for (const file of files) {
                      // upload séquentiel pour préserver l'ordre
                      // eslint-disable-next-line no-await-in-loop
                      await handleUpload(file);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Plusieurs images = carrousel automatique. Format paysage 16:9 recommandé, max 8 Mo/image.
              </p>
            </div>

            <div>
              <Label htmlFor="n-titre">Titre *</Label>
              <Input id="n-titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} />
            </div>

            <div>
              <Label htmlFor="n-desc">Description *</Label>
              <Textarea id="n-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!isNews && (
                <div>
                  <Label htmlFor="n-cat">Catégorie</Label>
                  <select
                    id="n-cat"
                    value={form.categorie}
                    onChange={(e) => setForm({ ...form, categorie: e.target.value as Categorie })}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-end gap-2 pb-1">
                <Switch id="n-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label htmlFor="n-active">Active</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="n-cta-label">Bouton — libellé</Label>
                <Input id="n-cta-label" placeholder="Découvrir la visio" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="n-cta-href">Bouton — lien</Label>
                <Input id="n-cta-href" placeholder="/dashboard/kine/visio" value={form.ctaHref} onChange={(e) => setForm({ ...form, ctaHref: e.target.value })} />
              </div>
            </div>

            {!isNews && (
              <div>
                <Label>Cible par plan (aucun coché = visible par tous)</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {ALL_PLANS.map((plan) => {
                    const active = form.ciblePlans.includes(plan);
                    return (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => togglePlan(plan)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          active ? 'border-[#3899aa] bg-[#3899aa] text-white' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {plan}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="n-pub">Publication (date et heure)</Label>
                <Input id="n-pub" type="datetime-local" value={form.publishedAt} onChange={(e) => setForm({ ...form, publishedAt: e.target.value })} />
                <p className="mt-1 text-[11px] text-muted-foreground">Dans le futur : programmée, invisible jusque-là.</p>
              </div>
              {!isNews && (
                <div>
                  <Label htmlFor="n-exp">Expiration (optionnel)</Label>
                  <Input id="n-exp" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button className="btn-teal" onClick={save} disabled={saving || uploading}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {form.id ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {copy.one} ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.titre} » sera définitivement supprimée, images comprises. Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
