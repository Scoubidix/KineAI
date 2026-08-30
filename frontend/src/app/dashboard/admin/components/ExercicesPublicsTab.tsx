'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import VideoUpload, { type ExerciceMediaValue } from '@/components/VideoUpload';
import { ExerciceMedia } from '@/components/ExerciceMedia';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { matchesSearch } from '@/utils/exerciceFiltering';
import { Loader2, Search, Users } from 'lucide-react';

export interface PublicExercice {
  id: number;
  nom: string;
  description: string;
  tags: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  gifUrl: string | null;
  videoPath: string | null;
  posterPath: string | null;
  gifPath: string | null;
  isPublic: boolean;
  kineId: number;
  usageCount: number;
  kine?: { firstName: string; lastName: string; email: string };
}

interface EditState {
  id: number; nom: string; description: string; tags: string;
  media: ExerciceMediaValue; usageCount: number;
}

interface PrivateExercice {
  id: number;
  nom: string;
  videoUrl: string | null;
  posterUrl: string | null;
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
  const [legacyGifCount, setLegacyGifCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  // Lecteur du dialogue d'édition : sert à choisir l'image de la miniature.
  const posterVideoRef = useRef<HTMLVideoElement | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);

  /**
   * Régénère la miniature à l'instant affiché dans le lecteur.
   *
   * N'écrit rien en base : la route renvoie le chemin, on le pose dans l'état
   * du formulaire, et c'est « Enregistrer » qui le persiste — le backend traite
   * alors l'ancienne miniature comme un orphelin et la supprime de GCS. C'est
   * le même chemin que le remplacement d'une vidéo.
   */
  const handleUsePosterFrame = async () => {
    const video = posterVideoRef.current;
    if (!editing || !video) return;

    setPosterBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/exercices/admin/${editing.id}/poster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atSeconds: video.currentTime }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Échec de la génération');
      }
      const data = await res.json();
      setEditing((prev) =>
        prev ? { ...prev, media: { ...prev.media, posterPath: data.posterPath, posterUrl: data.posterUrl } } : prev,
      );
      toast({ title: 'Miniature mise à jour', description: "Enregistre pour l'appliquer." });
    } catch (e) {
      toast({
        title: 'Échec',
        description: e instanceof Error ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setPosterBusy(false);
    }
  };

  // Même moteur que la bibliothèque côté kiné (`matchesSearch`) : multi-mots,
  // insensible aux accents et à la casse, sur nom + description + tags. Le
  // filtrage est côté client — les deux listes sont déjà chargées en entier.
  // Les exos privés n'ont pas de description dans cette vue : on passe une
  // chaîne vide plutôt que d'élargir le contrat de la fonction.
  const filteredPublics = useMemo(
    () => publics.filter((ex) => matchesSearch({ ...ex, tags: ex.tags ?? undefined }, search)),
    [publics, search],
  );
  const filteredPrivates = useMemo(
    () =>
      privates.filter((ex) =>
        matchesSearch({ nom: ex.nom, description: '', tags: ex.tags ?? undefined }, search),
      ),
    [privates, search],
  );

  const loadLegacyGifCount = async () => {
    const res = await fetchWithAuth(`${API_BASE}/exercices/admin/legacy-gif-count`);
    if (res.ok) {
      const data = await res.json();
      setLegacyGifCount(data.count);
    }
  };

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
    usageCount: ex.usageCount,
    media: {
      videoUrl: ex.videoUrl, videoPath: ex.videoPath,
      posterUrl: ex.posterUrl, posterPath: ex.posterPath,
      gifUrl: ex.gifUrl, gifPath: ex.gifPath,
    },
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
        videoPath: editing.media.videoPath,
        posterPath: editing.media.posterPath,
        gifPath: editing.media.gifPath,
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
    Promise.all([loadPublics(), loadPrivates(), loadLegacyGifCount()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8 mt-4">
      {/* Compteur de convergence de la transition GIF → vidéo. Il descend quand
          les kinés refilment ; c'est lui, et non le calendrier, qui déclenchera
          le retrait du chemin GIF. */}
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="font-medium">Transition GIF → vidéo</span>
        {' · '}
        {legacyGifCount === null ? (
          <span className="text-muted-foreground">chargement…</span>
        ) : legacyGifCount === 0 ? (
          <span className="text-green-700 dark:text-green-400">
            plus aucun exercice privé en GIF — la phase de sortie peut être engagée
          </span>
        ) : (
          <span className="text-muted-foreground">
            {legacyGifCount} exercice{legacyGifCount > 1 ? 's' : ''} privé
            {legacyGifCount > 1 ? 's' : ''} encore en GIF
          </span>
        )}
      </div>

      {/* Même barre que la bibliothèque côté kiné : elle filtre les DEUX
          sections d'un coup, publics et privés. Sans elle, la page devient
          impraticable dès que la bibliothèque publique s'étoffe. */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          className="pl-10"
          placeholder="Rechercher un exercice…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher un exercice"
        />
      </div>

      <section>
        <h3 className="text-lg font-semibold mb-3">
          Bibliothèque publique
          {search && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filteredPublics.length} / {publics.length}
            </span>
          )}
        </h3>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : filteredPublics.length === 0 ? (
          // Distinguer « la bibliothèque est vide » de « la recherche ne donne
          // rien » : sinon un admin croit avoir perdu ses exercices.
          <p className="text-sm text-muted-foreground">
            {search ? 'Aucun exercice public ne correspond à cette recherche.' : 'Aucun exercice public pour le moment.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPublics.map((ex) => (
              <Card key={ex.id} className="overflow-hidden">
                <ExerciceMedia
                  videoUrl={ex.videoUrl}
                  posterUrl={ex.posterUrl}
                  gifUrl={ex.gifUrl}
                  alt={ex.nom}
                  className="w-full aspect-video bg-muted"
                  autoPlayOnHover
                />
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
        <h3 className="text-lg font-semibold mb-3">
          Mes exos privés
          {search && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filteredPrivates.length} / {privates.length}
            </span>
          )}
        </h3>
        {filteredPrivates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {search ? 'Aucun exercice privé ne correspond à cette recherche.' : 'Aucun exercice privé à promouvoir.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPrivates.map((ex) => (
              <Card key={ex.id} className="overflow-hidden">
                <ExerciceMedia
                  videoUrl={ex.videoUrl}
                  posterUrl={ex.posterUrl}
                  gifUrl={ex.gifUrl}
                  alt={ex.nom}
                  className="w-full aspect-video bg-muted"
                  autoPlayOnHover
                />
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

              {/* Choix de la miniature. Le lecteur natif sert de sélecteur
                  d'image : l'admin déplace le curseur jusqu'à l'image voulue et
                  valide — il voit exactement ce qu'il choisit, sans slider à
                  part. L'extraction se fait côté serveur, avec la même chaîne
                  de filtres que la miniature automatique, sinon une image
                  choisie à la main sortirait avec un rendu différent. */}
              {editing.media.videoUrl && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label>Miniature</Label>
                  <video
                    ref={posterVideoRef}
                    src={editing.media.videoUrl}
                    poster={editing.media.posterUrl ?? undefined}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full rounded bg-muted"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleUsePosterFrame}
                      disabled={posterBusy}
                    >
                      {posterBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Utiliser cette image
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Place le curseur sur l&apos;image voulue.
                    </span>
                  </div>
                </div>
              )}

              <VideoUpload
                value={editing.media}
                onChange={(media) => setEditing({ ...editing, media })}
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
