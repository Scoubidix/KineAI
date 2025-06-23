'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X, Edit, Trash2, Send, Copy, Plus, User, Calendar, Mail, Phone, Target, Filter, Dumbbell, Clock, Activity } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

interface PatientData {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
  goals?: string;
}

interface ExerciseOption {
  id: number;
  nom: string;
  isPublic: boolean;
  tags?: string;
}

interface ProgrammeExercise {
  exerciseId: number;
  nom: string;
  series: number;
  repetitions: number;
  restTime: number;
  instructions: string;
}

interface Programme {
  id: number;
  titre: string;
  description: string;
  duree: number;
  dateFin: string;
  exercices: any[];
}

function calculateAge(birthDateStr: string) {
  const birthDate = new Date(birthDateStr);
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
}

function formatDate(birthDateStr: string): string {
  const date = new Date(birthDateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseTagsFromString(tagsString?: string): string[] {
  if (!tagsString) return [];
  return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [programmesData, setProgrammesData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États pour la création
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDuration, setCreateDuration] = useState(1);
  
  // États pour la modification
  const [openEditModal, setOpenEditModal] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState<Programme | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState(1);
  
  // États communs
  const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<ProgrammeExercise[]>([]);
  
  // Nouveaux états pour les filtres
  const [typeFilter, setTypeFilter] = useState<string>('all'); // 'all', 'public', 'private'
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  
  // États pour génération de lien
  const [generatingLink, setGeneratingLink] = useState<number | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/${patientId}`);
        if (!res.ok) throw new Error('Erreur récupération patient');
        const data = await res.json();
        setPatient(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (patientId) fetchPatient();
  }, [patientId]);

  useEffect(() => {
    const fetchProgrammes = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${patientId}`);
        const data = await res.json();
        setProgrammesData(data);
      } catch (err) {
        console.error("Erreur récupération programmes :", err);
      }
    };
    if (patientId) fetchProgrammes();
  }, [patientId]);

  useEffect(() => {
    const fetchExercises = async () => {
      try {
        const [priv, pub] = await Promise.all([
          fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/exercices/private`).then(r => r.json()),
          fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/exercices/public`).then(r => r.json())
        ]);
        const combined = [...priv, ...pub];
        setAllExercises(combined);
        
        // Extraire tous les tags uniques
        const allTags = new Set<string>();
        combined.forEach(exercise => {
          if (exercise.tags) {
            parseTagsFromString(exercise.tags).forEach(tag => allTags.add(tag));
          }
        });
        setAvailableTags(Array.from(allTags).sort());
        
      } catch (err) {
        console.error('Erreur chargement exercices', err);
      }
    };
    if (openCreateModal || openEditModal) fetchExercises();
  }, [openCreateModal, openEditModal]);

  // Effet pour filtrer les exercices selon les filtres sélectionnés
  useEffect(() => {
    let filtered = [...allExercises];
    
    // Filtre par type (public/privé)
    if (typeFilter === 'public') {
      filtered = filtered.filter(ex => ex.isPublic);
    } else if (typeFilter === 'private') {
      filtered = filtered.filter(ex => !ex.isPublic);
    }
    
    // Filtre par tag
    if (tagFilter !== 'all') {
      filtered = filtered.filter(ex => {
        if (!ex.tags) return false;
        const exerciseTags = parseTagsFromString(ex.tags);
        return exerciseTags.includes(tagFilter);
      });
    }
    
    // Exclure les exercices déjà sélectionnés
    filtered = filtered.filter(ex => 
      !selectedExercises.find(selected => selected.exerciseId === ex.id)
    );
    
    setFilteredExercises(filtered);
  }, [allExercises, typeFilter, tagFilter, selectedExercises]);

  const handleAddExercise = (exerciseId: string) => {
    const exercise = allExercises.find(ex => ex.id === parseInt(exerciseId));
    if (!exercise || selectedExercises.find(e => e.exerciseId === exercise.id)) return;
    
    setSelectedExercises([
      ...selectedExercises,
      {
        exerciseId: exercise.id,
        nom: exercise.nom,
        series: 1,
        repetitions: 10,
        restTime: 30,
        instructions: '',
      },
    ]);
    setSelectedExerciseId(''); // Reset la sélection
  };

  const handleInputChange = (index: number, field: keyof ProgrammeExercise, value: string | number) => {
    const updated = [...selectedExercises];
    (updated[index] as any)[field] = value;
    setSelectedExercises(updated);
  };

  const handleRemoveExercise = (index: number) => {
    const updated = [...selectedExercises];
    updated.splice(index, 1);
    setSelectedExercises(updated);
  };

  const refreshProgrammes = async () => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${patientId}`);
      const data = await res.json();
      setProgrammesData(data);
    } catch (err) {
      console.error("Erreur récupération programmes :", err);
    }
  };

  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreateDuration(1);
    setSelectedExercises([]);
    setTypeFilter('all');
    setTagFilter('all');
    setSelectedExerciseId('');
  };

  const resetEditForm = () => {
    setEditTitle('');
    setEditDescription('');
    setEditDuration(1);
    setSelectedExercises([]);
    setTypeFilter('all');
    setTagFilter('all');
    setSelectedExerciseId('');
    setEditingProgramme(null);
  };

  const handleCreateProgramme = async () => {
    try {
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + createDuration);

      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          titre: createTitle,
          description: createDescription,
          duree: createDuration,
          patientId: parseInt(patientId as string),
          dateFin: dateFin.toISOString(),
          exercises: selectedExercises.map((ex) => ({
            exerciceId: ex.exerciseId,
            series: ex.series,
            repetitions: ex.repetitions,
            tempsRepos: ex.restTime,
            instructions: ex.instructions || ''
          }))
        })
      });
      if (!res.ok) throw new Error("Erreur création programme");
      
      setOpenCreateModal(false);
      resetCreateForm();
      await refreshProgrammes();
    } catch (err) {
      console.error("Erreur création programme :", err);
    }
  };

  const handleEditProgramme = (programme: Programme) => {
    setEditingProgramme(programme);
    setEditTitle(programme.titre);
    setEditDescription(programme.description);
    setEditDuration(programme.duree);
    
    const exercises = (programme.exercices || []).map(ex => ({
      exerciseId: ex.exerciceModele?.id || ex.exerciceId,
      nom: ex.exerciceModele?.nom || ex.nom,
      series: ex.series,
      repetitions: ex.repetitions,
      restTime: ex.pause || ex.tempsRepos || ex.restTime || 30,
      instructions: ex.consigne || ex.instructions || '',
    }));
    
    setSelectedExercises(exercises);
    setOpenEditModal(true);
  };

  const handleUpdateProgramme = async () => {
    if (!editingProgramme) return;
    
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${editingProgramme.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          titre: editTitle,
          description: editDescription,
          duree: editDuration,
          exercises: selectedExercises.map((ex) => ({
            exerciceId: ex.exerciseId,
            series: ex.series,
            repetitions: ex.repetitions,
            tempsRepos: ex.restTime,
            instructions: ex.instructions || ''
          }))
        })
      });
      
      if (!res.ok) throw new Error("Erreur mise à jour programme");
      
      setOpenEditModal(false);
      resetEditForm();
      await refreshProgrammes();
    } catch (err) {
      console.error("Erreur mise à jour programme :", err);
    }
  };

  const handleDeleteProgramme = async (programmeId: number) => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${programmeId}`, {
        method: "DELETE"
      });
      
      if (!res.ok) throw new Error("Erreur suppression programme");
      
      await refreshProgrammes();
    } catch (err) {
      console.error("Erreur suppression programme :", err);
    }
  };

  const handleGenerateLink = async (programmeId: number) => {
    setGeneratingLink(programmeId);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${programmeId}/generate-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (!res.ok) throw new Error("Erreur génération lien");
      
      const data = await res.json();
      setGeneratedLink(data.chatLink);
      setShowLinkModal(true);
      
    } catch (err) {
      console.error("Erreur génération lien :", err);
      alert("Erreur lors de la génération du lien");
    } finally {
      setGeneratingLink(null);
    }
  };

  const copyLinkToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      alert("Lien copié dans le presse-papiers !");
    }
  };

  const renderProgrammeModal = (isEdit: boolean) => {
    const title = isEdit ? editTitle : createTitle;
    const setTitle = isEdit ? setEditTitle : setCreateTitle;
    const description = isEdit ? editDescription : createDescription;
    const setDescription = isEdit ? setEditDescription : setCreateDescription;
    const duration = isEdit ? editDuration : createDuration;
    const setDuration = isEdit ? setEditDuration : setCreateDuration;
    const handleSubmit = isEdit ? handleUpdateProgramme : handleCreateProgramme;
    const modalTitle = isEdit ? "Modifier le programme" : "Créer un nouveau programme";
    const buttonText = isEdit ? "Mettre à jour le programme" : "Créer le programme";

    return (
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader className="space-y-3 sticky top-0 bg-white dark:bg-gray-900 pb-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="text-lg sm:text-xl font-semibold">
            {modalTitle}
          </DialogTitle>
          <div className="h-px bg-gradient-to-r from-blue-500 to-purple-500"></div>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          {/* Section Informations du programme */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-blue-500 rounded-full"></div>
              Informations du programme
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="programme-title" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Titre du programme *
                </Label>
                <Input 
                  id="programme-title"
                  placeholder="Entrez le titre du programme"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="programme-description" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description *
                </Label>
                <Textarea
                  id="programme-description"
                  placeholder="Décrivez les objectifs et le contenu du programme..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="programme-duration" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Durée (jours) *
                </Label>
                <Input
                  id="programme-duration"
                  type="number"
                  min={1}
                  max={30}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  placeholder="Durée en jours (max 30)"
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Durée recommandée : 7-14 jours
                </p>
              </div>
            </div>
          </div>

          {/* Section Exercices avec filtres et sélection */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-green-500 rounded-full"></div>
              Exercices du programme
            </h3>
            
            <div className="space-y-4">
              {/* Filtres */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-gray-600" />
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Filtres de sélection
                  </Label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Filtre par type */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">Type d'exercice</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sélectionner le type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les exercices</SelectItem>
                        <SelectItem value="public">Exercices publics</SelectItem>
                        <SelectItem value="private">Mes exercices privés</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Filtre par tag */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">Catégorie</Label>
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes les catégories</SelectItem>
                        {availableTags.map(tag => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Résumé des filtres */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {typeFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      {typeFilter === 'public' ? 'Publics' : 'Privés'}
                    </Badge>
                  )}
                  {tagFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      {tagFilter}
                    </Badge>
                  )}
                  <span className="text-xs text-gray-500">
                    {filteredExercises.length} exercice{filteredExercises.length > 1 ? 's' : ''} disponible{filteredExercises.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Sélection d'exercice */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ajouter un exercice
                </Label>
                <div className="flex gap-2">
                  <Select value={selectedExerciseId} onValueChange={setSelectedExerciseId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choisissez un exercice à ajouter..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredExercises.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500">
                          Aucun exercice disponible avec ces filtres
                        </div>
                      ) : (
                        filteredExercises.map(exercise => (
                          <SelectItem key={exercise.id} value={exercise.id.toString()}>
                            <div className="flex items-center gap-2 w-full">
                              <span className="flex-1">{exercise.nom}</span>
                              <div className="flex gap-1">
                                <Badge variant={exercise.isPublic ? "default" : "secondary"} className="text-xs">
                                  {exercise.isPublic ? 'Public' : 'Privé'}
                                </Badge>
                                {exercise.tags && parseTagsFromString(exercise.tags).slice(0, 1).map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button 
                    type="button"
                    onClick={() => {
                      if (selectedExerciseId) {
                        handleAddExercise(selectedExerciseId);
                      }
                    }}
                    disabled={!selectedExerciseId}
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter
                  </Button>
                </div>
              </div>

              {/* Exercices sélectionnés */}
              {selectedExercises.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">
                      Exercices sélectionnés ({selectedExercises.length})
                    </span>
                  </div>
                  {selectedExercises.map((ex, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 relative">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2 text-gray-500 hover:text-red-600 h-6 w-6"
                        onClick={() => handleRemoveExercise(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 pr-8">
                        {ex.nom}
                      </h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-gray-600">Séries</Label>
                          <Input
                            type="number"
                            min="1"
                            value={ex.series}
                            onChange={(e) => handleInputChange(index, 'series', Number(e.target.value))}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-gray-600">Répétitions</Label>
                          <Input
                            type="number"
                            min="1"
                            value={ex.repetitions}
                            onChange={(e) => handleInputChange(index, 'repetitions', Number(e.target.value))}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-gray-600">Pause (sec)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={ex.restTime}
                            onChange={(e) => handleInputChange(index, 'restTime', Number(e.target.value))}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      
                      <div className="mt-3 space-y-1">
                        <Label className="text-xs font-medium text-gray-600">Consignes spécifiques</Label>
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

          {/* Section validation */}
          <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => {
                  if (isEdit) {
                    setOpenEditModal(false);
                    resetEditForm();
                  } else {
                    setOpenCreateModal(false);
                    resetCreateForm();
                  }
                }}
                className="flex-1 sm:flex-none text-sm sm:text-base"
              >
                Annuler
              </Button>
              <Button 
                onClick={handleSubmit}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg transition-all duration-200 text-sm sm:text-base"
                disabled={!title || !description || selectedExercises.length === 0}
              >
                {buttonText}
              </Button>
            </div>
            
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              * Champs obligatoires - Au moins un exercice requis
            </p>
          </div>
        </div>
      </DialogContent>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Section profil patient NOUVELLE VERSION */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg overflow-hidden">
          <div className="relative">
            {/* Pattern de fond */}
            <div className="absolute inset-0 bg-black/10">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
            </div>
            
            {loading ? (
              <div className="relative flex items-center justify-center py-6">
                <Loader2 className="animate-spin w-6 h-6 text-white" />
              </div>
            ) : patient && (
              <div className="relative p-4">
                {/* Tout dans un seul bloc ultra-compact */}
                <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="space-y-2">
                    {/* Ligne 1 : Avatar + Nom */}
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center ring-2 ring-white/30">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center ring-1 ring-white/30">
                          <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <h1 className="text-xl font-bold text-white leading-tight">
                          {patient.firstName} {patient.lastName.toUpperCase()}
                        </h1>
                        <div className="flex items-center gap-1 text-blue-100">
                          <Calendar className="w-3 h-3" />
                          <span className="text-xs">
                            {calculateAge(patient.birthDate)} ans • {formatDate(patient.birthDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Ligne 2 : Email */}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-white/20 rounded-md flex items-center justify-center">
                        <Mail className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{patient.email}</p>
                      </div>
                    </div>
                    
                    {/* Ligne 3 : Téléphone */}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-white/20 rounded-md flex items-center justify-center">
                        <Phone className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{patient.phone}</p>
                      </div>
                    </div>
                    
                    {/* Ligne 4 : Objectifs (si présents) */}
                    {patient.goals && (
                      <div className="flex items-start gap-2 pt-1 border-t border-white/20">
                        <div className="w-8 h-8 bg-white/20 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Target className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-xs leading-relaxed">{patient.goals}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section programmes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Programmes d'exercices
              </CardTitle>
              <p className="text-sm text-gray-600">
                Gérez les programmes de rééducation de votre patient
              </p>
            </div>
            {programmesData.length === 0 && (
              <Dialog open={openCreateModal} onOpenChange={(open) => {
                setOpenCreateModal(open);
                if (!open) resetCreateForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    Nouveau programme
                  </Button>
                </DialogTrigger>
                {renderProgrammeModal(false)}
              </Dialog>
            )}
          </CardHeader>
          
          <CardContent>
            {programmesData.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Aucun programme créé
                </h3>
                <p className="text-gray-600 mb-6">
                  Commencez par créer un programme d'exercices personnalisé pour ce patient
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {programmesData.map((programme: any, index: number) => (
                  <Card key={programme.id || index} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            {programme.titre}
                          </h3>
                          <p className="text-gray-700 mb-3">{programme.description}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{programme.duree} jours</span>
                            </div>
                            {programme.dateFin && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>Fin : {new Date(programme.dateFin).toLocaleDateString('fr-FR')}</span>
                              </div>
                            )}
                            {programme.exercices && (
                              <div className="flex items-center gap-1">
                                <Dumbbell className="w-4 h-4" />
                                <span>{programme.exercices.length} exercice{programme.exercices.length > 1 ? 's' : ''}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Dialog open={openEditModal && editingProgramme?.id === programme.id} onOpenChange={(open) => {
                            setOpenEditModal(open);
                            if (!open) resetEditForm();
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditProgramme(programme)}
                                className="hover:bg-blue-50 hover:border-blue-200"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            {renderProgrammeModal(true)}
                          </Dialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Êtes-vous sûr de vouloir supprimer le programme <strong>"{programme.titre}"</strong> ? 
                                  Cette action est irréversible et supprimera également l'accès chat du patient.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteProgramme(programme.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      
                      {/* Liste des exercices */}
                      {programme.exercices && programme.exercices.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <Dumbbell className="w-4 h-4 text-blue-600" />
                            Exercices du programme
                          </h4>
                          <div className="grid gap-3">
                            {programme.exercices.map((exercise: any, exIndex: number) => (
                              <div key={exercise.id || exIndex} className="p-4 bg-gray-50 border rounded-lg">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h5 className="font-medium text-gray-900 mb-2">
                                      {exercise.exerciceModele?.nom || exercise.nom}
                                    </h5>
                                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.series} série{exercise.series > 1 ? 's' : ''}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.repetitions} rép.
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.pause || exercise.tempsRepos || exercise.restTime}s repos
                                      </Badge>
                                    </div>
                                    {(exercise.consigne || exercise.instructions) && (
                                      <p className="text-sm text-gray-700 italic bg-blue-50 p-2 rounded border-l-2 border-blue-200">
                                        💡 {exercise.consigne || exercise.instructions}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bouton d'envoi du programme */}
                      <div className="border-t pt-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-green-800 mb-1">
                                Partager avec le patient
                              </h4>
                              <p className="text-sm text-green-700">
                                Générez un lien sécurisé pour que votre patient accède à son programme via chat
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="text-green-700 hover:text-green-800 border-green-300 hover:border-green-400 bg-white hover:bg-green-50"
                              onClick={() => handleGenerateLink(programme.id)}
                              disabled={generatingLink === programme.id}
                            >
                              {generatingLink === programme.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Send className="w-4 h-4 mr-2" />
                              )}
                              Générer le lien
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal pour afficher le lien généré */}
        <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-green-600" />
                Lien de chat généré
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 mb-3">
                  ✅ Lien sécurisé généré avec succès !
                </p>
                <p className="text-xs text-green-700">
                  Votre patient pourra accéder à son programme personnalisé et poser ses questions via ce lien.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Lien à partager :</Label>
                <div className="p-3 bg-gray-100 rounded-lg border text-sm break-all font-mono">
                  {generatedLink}
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={copyLinkToClipboard}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier le lien
                </Button>
                <Button 
                  onClick={() => setShowLinkModal(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Fermer
                </Button>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  🔒 <strong>Sécurité :</strong> Ce lien expire automatiquement à la fin du programme et est unique pour ce patient.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}