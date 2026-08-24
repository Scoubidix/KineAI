'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import VideoUpload from '@/components/VideoUpload';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users } from 'lucide-react';

export interface PublicExercice {
  id: number;
  nom: string;
  description: string;
  tags: string | null;
  gifUrl: string | null;
  gifPath: string | null;
  isPublic: boolean;
  kineId: number;
  usageCount: number;
  kine?: { firstName: string; lastName: string; email: string };
}

interface EditState {
  id: number; nom: string; description: string; tags: string;
  gifUrl: string | null; gifPath: string | null; usageCount: number;
}

interface PrivateExercice {
  id: number;
  nom: string;
  gifUrl: string | null;
  tags: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function ExercicesPublicsTab() {
  const { toast } = useToast();
  const [publics, setPublics] = useState<PublicExercice[]>([]);
  const [privates, setPrivates] = useState<PrivateExercice[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);

  const loadPublics = async () => {
    const res = await fetchWithAuth(`${API_BASE}/exercices/admin/public`);
    if (res.ok) {
      setPublics(await res.json());
    } else if (res.status === 403) {
      toast({ title: 'Accès refusé', description: 'Réservé aux administrateurs.', variant: 'destructive' });
    }
  };

  const loadPrivates = async () => {
    const res = await fetchWithAuth(`${API_BASE}/exercices/private`);
    if (res.ok) setPrivates(await res.json());
  };

  const handleUnpublish = async (id: number) => {
    const res = await fetchWithAuth(`${API_BASE}/exercices/admin/${id}/unpublish`, { method: 'PATCH' });
    if (res.ok) {
      toast({ title: 'Exercice dé-publié' });
      await Promise.all([loadPublics(), loadPrivates()]);
    } else {
      toast({ title: 'Échec', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetchWithAuth(`${API_BASE}/exercices/admin/${id}`, { method: 'DELETE' });
    if (res.status === 204) {
      toast({ title: 'Exercice supprimé' });
      await loadPublics();
    } else if (res.status === 400) {
      const err = await res.json();
      const list = (err.programmes || []).map((p: { programme: string; patient: string }) => `${p.programme} (${p.patient})`).join(', ');
      toast({ title: 'Suppression impossible', description: `Utilisé dans : ${list}`, variant: 'destructive' });
    } else {
      toast({ title: 'Échec', variant: 'destructive' });
    }
  };

  const openEdit = (ex: PublicExercice) => setEditing({
    id: ex.id, nom: ex.nom, description: ex.description, tags: ex.tags || '',
    gifUrl: ex.gifUrl, gifPath: ex.gifPath, usageCount: ex.usageCount,
  });

  const handleSaveEdit = async () => {
    if (!editing) return;
    const res = await fetchWithAuth(`${API_BASE}/exercices/admin/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: editing.nom,
        description: editing.description,
        tags: editing.tags || null,
        gifPath: editing.gifPath,
      }),
    });
    if (res.ok) {
      toast({ title: 'Exercice mis à jour' });
      setEditing(null);
      await loadPublics();
    } else {
      toast({ title: 'Échec de la mise à jour', variant: 'destructive' });
    }
  };

  const handlePublish = async (id: number) => {
    const res = await fetchWithAuth(`${API_BASE}/exercices/admin/${id}/publish`, { method: 'PATCH' });
    if (res.ok) {
      toast({ title: 'Exercice rendu public' });
      await Promise.all([loadPublics(), loadPrivates()]);
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: 'Échec', description: err.error || 'Erreur', variant: 'destructive' });
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadPublics(), loadPrivates()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8 mt-4">
      <section>
        <h3 className="text-lg font-semibold mb-3">Bibliothèque publique</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : publics.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun exercice public pour le moment.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publics.map((ex) => (
              <Card key={ex.id} className="overflow-hidden">
                {ex.gifUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ex.gifUrl} alt={ex.nom} className="w-full aspect-[3/4] object-cover" />
                )}
                <CardContent className="p-3 space-y-2">
                  <div className="font-medium">{ex.nom}</div>
                  <div className="text-xs text-muted-foreground">
                    {ex.kine ? `${ex.kine.firstName} ${ex.kine.lastName}` : '—'}
                  </div>
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    <Users className="h-3 w-3" /> {ex.usageCount} programme{ex.usageCount > 1 ? 's' : ''}
                  </Badge>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(ex)}>Éditer</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-1">Dé-publier</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Dé-publier « {ex.nom} » ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cet exercice ne sera plus ajoutable par les autres kinés. Les programmes qui l'utilisent déjà ne sont pas affectés.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleUnpublish(ex.id)}>Dé-publier</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="flex-1">Supprimer</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer « {ex.nom} » ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Suppression définitive. Elle sera refusée si l'exercice est utilisé dans un programme.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(ex.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">Mes exos privés</h3>
        {privates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun exercice privé à promouvoir.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {privates.map((ex) => (
              <Card key={ex.id} className="overflow-hidden">
                {ex.gifUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ex.gifUrl} alt={ex.nom} className="w-full aspect-[3/4] object-cover" />
                )}
                <CardContent className="p-3 space-y-2">
                  <div className="font-medium">{ex.nom}</div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" className="w-full">Rendre public</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rendre « {ex.nom} » public ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cet exercice deviendra visible et ajoutable par tous les kinés.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handlePublish(ex.id)}>Rendre public</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Éditer l'exercice public</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 flex-1 overflow-y-auto pr-1 -mr-1">
              {editing.usageCount > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3">
                  ⚠️ Cette modification s'appliquera immédiatement à {editing.usageCount} programme
                  {editing.usageCount > 1 ? 's' : ''} en cours (les patients verront la nouvelle version).
                </div>
              )}
              <div className="space-y-1">
                <Label>Nom</Label>
                <Input value={editing.nom} onChange={(e) => setEditing({ ...editing, nom: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Tags (séparés par des virgules)</Label>
                <Input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
              </div>
              <VideoUpload
                gifUrl={editing.gifUrl}
                gifPath={editing.gifPath}
                onGifChange={({ gifUrl, gifPath }) => setEditing({ ...editing, gifUrl, gifPath })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={handleSaveEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
