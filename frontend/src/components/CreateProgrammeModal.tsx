'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import {
  Search,
  Dumbbell,
  Plus,
  X,
  Eye,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExerciseOption {
  id: number;
  nom: string;
  isPublic: boolean;
  tags?: string;
  description?: string; // déjà renvoyé par l'API, exposé pour l'aperçu
  gifUrl?: string;      // URL signée GCS, déjà renvoyée par l'API
  gifPath?: string;     // chemin GCS, déjà renvoyé par l'API
}

interface ProgrammeExercise {
  exerciseId: number;
  nom: string;
  series: number;
  repetitions: number;
  restTime: number;
  tempsTravail: number;
  instructions: string;
}

interface ExerciceTemplate {
  id: number;
  nom: string;
  description?: string;
  isPublic: boolean;
  items: Array<{
    id: number;
    ordre: number;
    series: number;
    repetitions: number;
    tempsRepos: number;
    tempsTravail?: number;
    instructions?: string;
    exerciceModele: {
      id: number;
      nom: string;
    };
  }>;
}

export interface CreateProgrammeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  patientName?: string; // pour le titre "Créer un programme pour {patientName}"
  onCreated?: () => void; // appelé après succès ; la PAGE hôte gère toast/redirect/refresh
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse une chaîne de tags séparés par virgules en tableau. */
const parseTagsFromString = (tagsString?: string): string[] => {
  if (!tagsString) return [];
  return tagsString.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
};

// ---------------------------------------------------------------------------
// Sous-composant : aperçu GIF + tags d'un exercice
// ---------------------------------------------------------------------------

function ExercisePreviewPopover({ exercise }: { exercise: ExerciseOption }) {
  const tags = parseTagsFromString(exercise.tags);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // stopPropagation : ouvrir l'aperçu ne doit PAS cocher/décocher l'exercice
          onClick={(e) => e.stopPropagation()}
          aria-label={`Aperçu de ${exercise.nom}`}
          className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-500 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Eye className="h-4 w-4" />
          <span>Aperçu</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto max-w-[min(92vw,40rem)]"
        // Le contenu est rendu via Portal mais React propage les events à travers
        // l'arbre React → sans ce stopPropagation, un clic dans le popover cocherait la ligne.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2 min-w-0">
          <p className="font-medium text-sm text-foreground break-words">{exercise.nom}</p>

          {exercise.gifUrl ? (
            <img
              src={exercise.gifUrl}
              alt={`Démonstration : ${exercise.nom}`}
              className="max-w-full max-h-[70vh] mx-auto rounded-md border bg-muted object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-24 rounded-md border bg-muted text-xs text-gray-500">
              Pas d&apos;illustration
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap pt-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function CreateProgrammeModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  onCreated,
}: CreateProgrammeModalProps) {

  // --- États formulaire ---
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDuration, setCreateDuration] = useState(1);
  const [createError, setCreateError] = useState<string | null>(null);

  // --- États exercices ---
  const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<ProgrammeExercise[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]); // 'public' | 'private' | 'templates'
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [checkedExerciseIds, setCheckedExerciseIds] = useState<number[]>([]);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [creatingProgramme, setCreatingProgramme] = useState(false);

  // --- Ref scroll ---
  const selectedExercisesRef = useRef<HTMLDivElement>(null);

  // --- États templates ---
  const [allTemplates, setAllTemplates] = useState<ExerciceTemplate[]>([]);
  const [checkedTemplateIds, setCheckedTemplateIds] = useState<number[]>([]);

  // ---------------------------------------------------------------------------
  // Reset du formulaire
  // ---------------------------------------------------------------------------

  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreateDuration(1);
    setSelectedExercises([]);
    setTypeFilters([]);
    setTagFilters([]);
    setCheckedExerciseIds([]);
    setCheckedTemplateIds([]);
    setExerciseSearchQuery('');
    setCreateError(null);
  };

  // Réinitialiser à chaque ouverture/fermeture
  useEffect(() => {
    if (open) {
      resetCreateForm();
      fetchExercises();
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---------------------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------------------

  const fetchExercises = async () => {
    try {
      const [priv, pub] = await Promise.all([
        fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/exercices/private`).then((r) => r.json()),
        fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/exercices/public`).then((r) => r.json()),
      ]);
      const combined: ExerciseOption[] = [...priv, ...pub];
      setAllExercises(combined);

      // Extraire tous les tags uniques
      const allTags = new Set<string>();
      combined.forEach((exercise) => {
        if (exercise.tags) {
          parseTagsFromString(exercise.tags).forEach((tag) => allTags.add(tag));
        }
      });
      setAvailableTags(Array.from(allTags).sort());
    } catch (err) {
      console.error('Erreur chargement exercices', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const templates = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/exercice-templates/all`
      ).then((r) => r.json());
      setAllTemplates(templates);
    } catch (err) {
      console.error('Erreur chargement templates', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtrage des exercices
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let filtered = [...allExercises];

    // Correctif : ne filtrer par type QUE si le mode templates n'est pas actif
    if (typeFilters.length > 0 && !typeFilters.includes('templates')) {
      filtered = filtered.filter((ex) => {
        if (typeFilters.includes('public') && ex.isPublic) return true;
        if (typeFilters.includes('private') && !ex.isPublic) return true;
        return false;
      });
    }

    // Filtre par tags (AND logic : tous les tags doivent être présents)
    if (tagFilters.length > 0) {
      filtered = filtered.filter((ex) => {
        if (!ex.tags) return false;
        const exerciseTags = parseTagsFromString(ex.tags);
        return tagFilters.every((selectedTag) => exerciseTags.includes(selectedTag));
      });
    }

    // Filtre par recherche textuelle
    if (exerciseSearchQuery.trim()) {
      const searchLower = exerciseSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (ex) =>
          ex.nom.toLowerCase().includes(searchLower) ||
          (ex.tags && ex.tags.toLowerCase().includes(searchLower))
      );
    }

    // Exclure les exercices déjà configurés
    filtered = filtered.filter(
      (ex) => !selectedExercises.find((selected) => selected.exerciseId === ex.id)
    );

    setFilteredExercises(filtered);
  }, [allExercises, typeFilters, tagFilters, exerciseSearchQuery, selectedExercises]);

  // ---------------------------------------------------------------------------
  // Handlers filtres
  // ---------------------------------------------------------------------------

  const toggleTypeFilter = (type: string) => {
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleTagFilter = (tag: string) => {
    setTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearAllFilters = () => {
    setTypeFilters([]);
    setTagFilters([]);
    setExerciseSearchQuery('');
  };

  // ---------------------------------------------------------------------------
  // Handlers checkboxes exercices
  // ---------------------------------------------------------------------------

  const toggleExerciseCheck = (exerciseId: number) => {
    setCheckedExerciseIds((prev) =>
      prev.includes(exerciseId) ? prev.filter((id) => id !== exerciseId) : [...prev, exerciseId]
    );
  };

  const handleCheckAll = () => {
    setCheckedExerciseIds(filteredExercises.map((ex) => ex.id));
  };

  const handleUncheckAll = () => {
    setCheckedExerciseIds([]);
  };

  const handleConfirmSelection = () => {
    const newExercises = checkedExerciseIds.map((id) => {
      const exercise = allExercises.find((ex) => ex.id === id);
      return {
        exerciseId: id,
        nom: exercise?.nom || '',
        series: 3,
        repetitions: 10,
        restTime: 30,
        tempsTravail: 0,
        instructions: '',
      };
    });
    setSelectedExercises([...selectedExercises, ...newExercises]);
    setCheckedExerciseIds([]);
    setTimeout(() => {
      selectedExercisesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // ---------------------------------------------------------------------------
  // Handlers templates
  // ---------------------------------------------------------------------------

  const toggleTemplateCheck = (templateId: number) => {
    setCheckedTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  };

  const handleConfirmTemplateSelection = () => {
    const newExercises: ProgrammeExercise[] = [];

    checkedTemplateIds.forEach((templateId) => {
      const template = allTemplates.find((t) => t.id === templateId);
      if (template) {
        template.items.forEach((item) => {
          if (
            !selectedExercises.find((e) => e.exerciseId === item.exerciceModele.id) &&
            !newExercises.find((e) => e.exerciseId === item.exerciceModele.id)
          ) {
            newExercises.push({
              exerciseId: item.exerciceModele.id,
              nom: item.exerciceModele.nom,
              series: item.series,
              repetitions: item.repetitions,
              restTime: item.tempsRepos,
              tempsTravail: item.tempsTravail || 0,
              instructions: item.instructions || '',
            });
          }
        });
      }
    });

    setSelectedExercises([...selectedExercises, ...newExercises]);
    setCheckedTemplateIds([]);
    setTimeout(() => {
      selectedExercisesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // ---------------------------------------------------------------------------
  // Handlers configuration exercices sélectionnés
  // ---------------------------------------------------------------------------

  const handleInputChange = (
    index: number,
    field: keyof ProgrammeExercise,
    value: string | number
  ) => {
    const updated = [...selectedExercises];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[index] as any)[field] = value;
    setSelectedExercises(updated);
  };

  const handleRemoveExercise = (index: number) => {
    const updated = [...selectedExercises];
    updated.splice(index, 1);
    setSelectedExercises(updated);
  };

  // ---------------------------------------------------------------------------
  // Création du programme
  // ---------------------------------------------------------------------------

  const handleCreateProgramme = async () => {
    setCreateError(null);
    setCreatingProgramme(true);
    try {
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + createDuration);

      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titre: createTitle,
          description: createDescription,
          duree: createDuration,
          patientId,
          dateFin: dateFin.toISOString(),
          exercises: selectedExercises.map((ex) => ({
            exerciceId: ex.exerciseId,
            series: ex.series,
            repetitions: ex.repetitions,
            tempsRepos: ex.restTime,
            tempsTravail: ex.tempsTravail || 0,
            instructions: ex.instructions || '',
          })),
        }),
      });

      if (res.ok) {
        onCreated?.();
        onOpenChange(false);
      } else {
        // Gérer les erreurs métier (paywall, limite plan…)
        await handlePostError(res);
      }
    } catch (err) {
      console.error('Erreur création programme:', err);
      setCreateError('Impossible de contacter le serveur. Vérifie ta connexion.');
    } finally {
      setCreatingProgramme(false);
    }
  };

  /** Gère les réponses HTTP non-ok du POST /programmes et affiche un message dans la modal. */
  const handlePostError = async (res: Response) => {
    try {
      if (res.status === 403) {
        const errorData = await res.json();
        if (errorData?.code === 'PLAN_REQUIRED') {
          setCreateError(
            "Un abonnement est requis pour créer un programme. Clique sur 'Upgrade' en haut à droite."
          );
          return;
        }
        if (errorData?.code === 'PROGRAMME_LIMIT_REACHED') {
          setCreateError(
            errorData.message ||
              "Tu as atteint la limite de programmes de ton plan. Clique sur 'Upgrade' pour augmenter ta limite."
          );
          return;
        }
        setCreateError(errorData.message || "Accès refusé.");
        return;
      }
      setCreateError('Une erreur serveur est survenue. Réessaie.');
    } catch {
      setCreateError('Une erreur inattendue est survenue. Réessaie.');
    }
  };

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  const isTemplateMode = typeFilters.includes('templates');

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetCreateForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="w-[95vw] sm:max-w-6xl max-h-[95vh] overflow-y-auto top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
          <DialogTitle className="text-lg sm:text-xl font-semibold text-white">
            {patientName ? `Créer un programme pour ${patientName}` : 'Créer un programme'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">

          {/* ---------------------------------------------------------------- */}
          {/* Section Informations du programme                                 */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-foreground flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-blue-500 rounded-full" />
              Informations du programme
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="programme-title" className="text-xs sm:text-sm font-medium text-foreground">
                  Titre du programme *
                </Label>
                <Input
                  id="programme-title"
                  placeholder="Entre le titre du programme"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="programme-description" className="text-xs sm:text-sm font-medium text-foreground">
                  Objectifs du programme *
                </Label>
                <Textarea
                  id="programme-description"
                  placeholder="Décris les objectifs et le contenu du programme..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="programme-duration" className="text-xs sm:text-sm font-medium text-foreground">
                  Durée (jours) *
                </Label>
                <div className="relative">
                  <Input
                    id="programme-duration"
                    type="number"
                    min={1}
                    max={30}
                    value={createDuration}
                    onChange={(e) => setCreateDuration(Number(e.target.value))}
                    placeholder="Durée en jours (max 30)"
                    className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    required
                  />
                  {createDuration > 30 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-600 font-medium">
                      max 30j
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Durée recommandée : 7-14 jours
                </p>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Section Exercices                                                 */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-foreground flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-green-500 rounded-full" />
              Exercices du programme
            </h3>

            <div className="space-y-4">
              {/* Filtres */}
              <div className="space-y-3">
                {/* Barre de recherche */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom d'exercice..."
                    value={exerciseSearchQuery}
                    onChange={(e) => setExerciseSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Filtres Type */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Type</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={typeFilters.includes('public') ? 'default' : 'outline'}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleTypeFilter('public')}
                    >
                      Exercices Publics
                    </Badge>
                    <Badge
                      variant={typeFilters.includes('private') ? 'default' : 'outline'}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleTypeFilter('private')}
                    >
                      Mes exercices
                    </Badge>
                    <Badge
                      variant={isTemplateMode ? 'default' : 'outline'}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleTypeFilter('templates')}
                    >
                      📋 Templates
                    </Badge>
                  </div>
                </div>

                {/* Filtres Tags */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Catégories</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={tagFilters.includes(tag) ? 'default' : 'outline'}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => toggleTagFilter(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Résumé + Réinitialiser */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {filteredExercises.length} exercice{filteredExercises.length > 1 ? 's' : ''}{' '}
                    disponible{filteredExercises.length > 1 ? 's' : ''}
                  </span>
                  {(typeFilters.length > 0 || tagFilters.length > 0 || exerciseSearchQuery) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="h-6 text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Réinitialiser
                    </Button>
                  )}
                </div>
              </div>

              {/* Liste des exercices/templates — hauteur fixe pour stabilité UX */}
              <div className="flex flex-col h-[300px] sm:h-[480px] border rounded-lg overflow-hidden">
                {/* En-tête de la liste */}
                <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0 gap-2">
                  <Label className="text-xs sm:text-sm font-medium text-foreground flex-shrink-0">
                    {isTemplateMode ? 'Sélectionner des templates' : 'Sélectionner des exercices'}
                  </Label>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {(isTemplateMode ? checkedTemplateIds.length > 0 : checkedExerciseIds.length > 0) && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={isTemplateMode ? handleConfirmTemplateSelection : handleConfirmSelection}
                        className="btn-teal h-7 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {isTemplateMode
                          ? `Ajouter (${checkedTemplateIds.length})`
                          : `Ajouter (${checkedExerciseIds.length})`}
                      </Button>
                    )}
                    {(isTemplateMode ? allTemplates.length > 0 : filteredExercises.length > 0) && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={
                            isTemplateMode
                              ? () => setCheckedTemplateIds(allTemplates.map((t) => t.id))
                              : handleCheckAll
                          }
                          className="h-7 text-xs"
                        >
                          Tout sélectionner
                        </Button>
                        {(isTemplateMode ? checkedTemplateIds.length > 0 : checkedExerciseIds.length > 0) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={
                              isTemplateMode ? () => setCheckedTemplateIds([]) : handleUncheckAll
                            }
                            className="h-7 text-xs"
                          >
                            Tout désélectionner
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Corps de la liste */}
                <div className="flex-1 overflow-y-auto">
                  {isTemplateMode ? (
                    // AFFICHAGE DES TEMPLATES
                    allTemplates.length === 0 ? (
                      <div className="flex items-center justify-center h-full p-4 text-center text-sm text-gray-500">
                        Aucun template disponible
                      </div>
                    ) : (
                      <div className="divide-y">
                        {allTemplates.map((template) => (
                          <div
                            key={template.id}
                            className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start gap-3 cursor-pointer"
                            onClick={() => toggleTemplateCheck(template.id)}
                          >
                            <Checkbox
                              checked={checkedTemplateIds.includes(template.id)}
                              className="mt-0.5 pointer-events-none"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground">{template.nom}</p>
                              {template.description && (
                                <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                              )}
                              <div className="flex gap-1 mt-1 flex-wrap">
                                <Badge
                                  variant={template.isPublic ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {template.isPublic ? 'Public' : 'Privé'}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {template.items.length} exercice{template.items.length > 1 ? 's' : ''}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {template.items
                                  .slice(0, 2)
                                  .map((item) => item.exerciceModele.nom)
                                  .join(', ')}
                                {template.items.length > 2 &&
                                  ` +${template.items.length - 2} autre${template.items.length - 2 > 1 ? 's' : ''}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    // AFFICHAGE DES EXERCICES
                    filteredExercises.length === 0 ? (
                      <div className="flex items-center justify-center h-full p-4 text-center text-sm text-gray-500">
                        {exerciseSearchQuery || typeFilters.length > 0 || tagFilters.length > 0
                          ? 'Aucun exercice trouvé pour ces filtres'
                          : 'Aucun exercice disponible'}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredExercises.map((exercise) => (
                          <div
                            key={exercise.id}
                            className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start gap-3 cursor-pointer"
                            onClick={() => toggleExerciseCheck(exercise.id)}
                          >
                            <Checkbox
                              checked={checkedExerciseIds.includes(exercise.id)}
                              className="mt-0.5 pointer-events-none"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground">{exercise.nom}</p>
                              <div className="flex gap-1 mt-1 flex-wrap items-center">
                                <Badge
                                  variant={exercise.isPublic ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {exercise.isPublic ? 'Public' : 'Privé'}
                                </Badge>
                                {exercise.tags &&
                                  parseTagsFromString(exercise.tags).map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                <ExercisePreviewPopover exercise={exercise} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Exercices sélectionnés et configurés */}
              {selectedExercises.length > 0 && (
                <div ref={selectedExercisesRef} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">
                      Exercices sélectionnés ({selectedExercises.length})
                    </span>
                  </div>
                  {selectedExercises.map((ex, index) => (
                    <div
                      key={index}
                      className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 relative"
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2 text-gray-500 hover:text-red-600 h-6 w-6"
                        onClick={() => handleRemoveExercise(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>

                      <h4 className="font-medium text-foreground mb-3 pr-8">{ex.nom}</h4>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Séries</Label>
                          <Input
                            type="number"
                            min="1"
                            value={ex.series}
                            onChange={(e) => handleInputChange(index, 'series', Number(e.target.value))}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Répétitions</Label>
                          <Input
                            type="number"
                            min="1"
                            value={ex.repetitions}
                            onChange={(e) =>
                              handleInputChange(index, 'repetitions', Number(e.target.value))
                            }
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Travail (sec)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={ex.tempsTravail}
                            onChange={(e) =>
                              handleInputChange(index, 'tempsTravail', Number(e.target.value))
                            }
                            className="text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Pause (sec)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={ex.restTime}
                            onChange={(e) =>
                              handleInputChange(index, 'restTime', Number(e.target.value))
                            }
                            className="text-sm"
                          />
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <Label className="text-xs font-medium text-muted-foreground">
                          Consignes spécifiques
                        </Label>
                        <Textarea
                          value={ex.instructions}
                          onChange={(e) => handleInputChange(index, 'instructions', e.target.value)}
                          placeholder="Instructions particulières pour cet exercice..."
                          className="text-sm resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Erreur POST                                                       */}
          {/* ---------------------------------------------------------------- */}
          {createError && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              {createError}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Section validation                                                */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetCreateForm();
                  onOpenChange(false);
                }}
                className="flex-1 sm:flex-none text-sm sm:text-base"
                disabled={creatingProgramme}
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateProgramme}
                className="btn-teal flex-1 text-sm sm:text-base"
                disabled={
                  !createTitle ||
                  !createDescription ||
                  selectedExercises.length === 0 ||
                  creatingProgramme ||
                  createDuration <= 0 ||
                  createDuration > 30
                }
              >
                {creatingProgramme ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Création en cours...
                  </>
                ) : (
                  'Créer le programme'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
