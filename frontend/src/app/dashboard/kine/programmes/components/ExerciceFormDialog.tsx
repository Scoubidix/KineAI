'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Tag } from 'lucide-react';
import VideoUpload, { EMPTY_MEDIA, type ExerciceMediaValue } from '@/components/VideoUpload';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import type { ExerciceDeletionImpact, ExerciceModele } from '@/types/exercice';
import { parseTags, SUGGESTED_TAGS } from '@/utils/exerciceFiltering';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface FormState {
  id: number | null;
  nom: string;
  description: string;
  tags: string[];
  media: ExerciceMediaValue;
}

const EMPTY_FORM: FormState = {
  id: null,
  nom: '',
  description: '',
  tags: [],
  media: EMPTY_MEDIA,
};

interface ExerciceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création, sinon édition */
  exercice: ExerciceModele | null;
  onSaved: () => void;
}

export function ExerciceFormDialog({
  open,
  onOpenChange,
  exercice,
  onSaved,
}: ExerciceFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      exercice
        ? {
            id: exercice.id,
            nom: exercice.nom,
            description: exercice.description,
            tags: parseTags(exercice.tags),
            media: {
              videoUrl: exercice.videoUrl ?? null,
              videoPath: exercice.videoPath ?? null,
              posterUrl: exercice.posterUrl ?? null,
              posterPath: exercice.posterPath ?? null,
              gifUrl: exercice.gifUrl ?? null,
              gifPath: exercice.gifPath ?? null,
            },
          }
        : EMPTY_FORM,
    );
  }, [open, exercice]);

  const handleTagToggle = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const endpoint = form.id ? `${apiUrl}/exercices/${form.id}` : `${apiUrl}/exercices`;
      const res = await fetchWithAuth(endpoint, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: form.nom,
          description: form.description,
          tags: form.tags.length > 0 ? form.tags.join(', ') : null,
          // On envoie les chemins GCS, jamais les URLs signées.
          videoPath: form.media.videoPath,
          posterPath: form.media.posterPath,
          gifPath: form.media.gifPath,
          isPublic: false,
        }),
      });
      if (res.ok) {
        onOpenChange(false);
        onSaved();
      } else {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch (error) {
      console.error('Erreur sauvegarde exercice:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: "L'exercice n'a pas pu être enregistré.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
          <DialogTitle className="text-lg sm:text-xl font-semibold text-white">
            {form.id ? "Modifier l'exercice" : 'Créer un nouvel exercice'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-blue-500 rounded-full" />
              Informations de l&apos;exercice
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="nom"
                  className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Nom de l&apos;exercice *
                </Label>
                <Input
                  id="nom"
                  name="nom"
                  value={form.nom}
                  onChange={(e) => setForm((prev) => ({ ...prev, nom: e.target.value }))}
                  placeholder="Entre le nom de l'exercice"
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="description"
                  className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Description détaillée *
                </Label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Décris l'exercice en détail : position de départ, mouvement, répétitions recommandées, points d'attention..."
                  className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all duration-200 resize-none"
                  rows={6}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Une description claire aide les patients à bien exécuter l&apos;exercice
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Catégories (optionnel)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {SUGGESTED_TAGS.map((tag) => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tag-${tag}`}
                        checked={form.tags.includes(tag)}
                        onCheckedChange={() => handleTagToggle(tag)}
                      />
                      <Label htmlFor={`tag-${tag}`} className="text-sm font-normal cursor-pointer">
                        {tag}
                      </Label>
                    </div>
                  ))}
                </div>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sélectionne les catégories qui correspondent à cet exercice
                </p>
              </div>

              <VideoUpload
                value={form.media}
                onChange={(media) => setForm((prev) => ({ ...prev, media }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 sm:flex-none text-sm sm:text-base"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                className="btn-teal flex-1 text-sm sm:text-base"
                disabled={saving || !form.nom || !form.description}
              >
                {form.id ? 'Mettre à jour' : "Créer l'exercice"}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              * Champs obligatoires
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ExerciceDeleteDialogProps {
  exercice: ExerciceModele | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function ExerciceDeleteDialog({
  exercice,
  onOpenChange,
  onDeleted,
}: ExerciceDeleteDialogProps) {
  const { toast } = useToast();
  // Chargé à l'ouverture : la confirmation annonce ce que la suppression
  // entraîne, plutôt que de découvrir un refus après coup.
  const [impact, setImpact] = useState<ExerciceDeletionImpact | null>(null);
  const exerciceId = exercice?.id;

  // Dépend de l'id seul : le parent passe un onOpenChange inline, qui
  // relancerait l'appel à chacun de ses rendus.
  useEffect(() => {
    setImpact(null);
    if (!exerciceId) return;
    let cancelled = false;
    fetchWithAuth(`${apiUrl}/exercices/${exerciceId}/deletion-impact`)
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json();
      })
      .then((data: ExerciceDeletionImpact) => {
        if (!cancelled) setImpact(data);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Erreur aperçu suppression exercice:', error);
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: "Impossible de vérifier l'utilisation de cet exercice.",
        });
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exerciceId]);

  const handleDelete = async () => {
    if (!exercice) return;
    try {
      const res = await fetchWithAuth(`${apiUrl}/exercices/${exercice.id}`, { method: 'DELETE' });
      if (res.status === 204) {
        onOpenChange(false);
        onDeleted();
      } else if (res.status === 409) {
        // Un programme en cours l'a repris entre l'ouverture et la confirmation.
        toast({
          variant: 'destructive',
          title: 'Suppression impossible',
          description: 'Cet exercice est utilisé dans un programme en cours.',
        });
        onOpenChange(false);
      } else {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch (error) {
      console.error('Erreur suppression exercice:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'La suppression a échoué.',
      });
      onOpenChange(false);
    }
  };

  const blocked = !!impact && impact.programmes.length > 0;
  const templatesCount = impact?.templatesCount ?? 0;

  return (
    <AlertDialog open={!!exercice} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked ? 'Suppression impossible' : <>Supprimer &laquo;&nbsp;{exercice?.nom}&nbsp;&raquo; ?</>}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {!impact ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vérification de l&apos;utilisation de l&apos;exercice…
                </p>
              ) : blocked ? (
                <>
                  <p>
                    &laquo;&nbsp;{exercice?.nom}&nbsp;&raquo; est utilisé dans{' '}
                    {impact.programmes.length > 1 ? 'des programmes en cours' : 'un programme en cours'}&nbsp;:
                  </p>
                  <ul className="list-disc pl-5">
                    {impact.programmes.map((p, i) => (
                      <li key={i}>
                        {p.programme} ({p.patient})
                      </li>
                    ))}
                  </ul>
                  <p>Tu pourras le supprimer une fois ces programmes terminés.</p>
                </>
              ) : (
                <>
                  <p>
                    Il disparaîtra de ta bibliothèque. Les anciens programmes de tes patients le
                    gardent dans leur historique, sans la vidéo de démonstration.
                  </p>
                  {templatesCount > 0 && (
                    <p className="font-medium text-foreground">
                      Il sera aussi retiré de {templatesCount} template{templatesCount > 1 ? 's' : ''}.
                    </p>
                  )}
                  <p>Cette action est irréversible.</p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{blocked ? 'Fermer' : 'Annuler'}</AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!impact}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
