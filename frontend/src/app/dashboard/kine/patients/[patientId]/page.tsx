'use client';

import React, { useEffect, useState, useRef } from 'react';
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
import { Loader2, X, Edit, Trash2, Send, Copy, Plus, User, Calendar, Mail, Phone, Target, Filter, Dumbbell, Clock, Activity, MessageCircle, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { handleProgrammeCreationError } from '@/utils/handleProgrammeError';

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
  tempsTravail: number;
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

// Type pour le statut WhatsApp
type WhatsAppStatus = 'idle' | 'sending' | 'success' | 'error';

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
  const { toast } = useToast();
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
  
  // États pour les filtres (nouvelle UI chips)
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');
  const [checkedExerciseIds, setCheckedExerciseIds] = useState<number[]>([]);

  // Ref pour scroll automatique vers exercices sélectionnés
  const selectedExercisesRef = useRef<HTMLDivElement>(null);

  // États pour les templates
  const [allTemplates, setAllTemplates] = useState<ExerciceTemplate[]>([]);
  const [checkedTemplateIds, setCheckedTemplateIds] = useState<number[]>([]);
  
  // États pour génération de lien et WhatsApp
  const [generatingLink, setGeneratingLink] = useState<number | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [currentProgrammeId, setCurrentProgrammeId] = useState<number | null>(null);
  
  // États WhatsApp
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>('idle');
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

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
    const fetchExercisesAndTemplates = async () => {
      try {
        // Charger exercices
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

        // Charger templates
        const templates = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/exercice-templates/all`).then(r => r.json());
        setAllTemplates(templates);

      } catch (err) {
        console.error('Erreur chargement exercices/templates', err);
      }
    };
    if (openCreateModal || openEditModal) fetchExercisesAndTemplates();
  }, [openCreateModal, openEditModal]);

  // Effet pour filtrer les exercices selon les filtres sélectionnés
  useEffect(() => {
    let filtered = [...allExercises];

    // Filtre par type (multi-select)
    if (typeFilters.length > 0 && !typeFilters.includes('templates')) {
      filtered = filtered.filter(ex => {
        if (typeFilters.includes('public') && ex.isPublic) return true;
        if (typeFilters.includes('private') && !ex.isPublic) return true;
        return false;
      });
    }

    // Filtre par tags (multi-select - AND logic)
    if (tagFilters.length > 0) {
      filtered = filtered.filter(ex => {
        if (!ex.tags) return false;
        const exerciseTags = parseTagsFromString(ex.tags);
        return tagFilters.every(selectedTag => exerciseTags.includes(selectedTag));
      });
    }

    // Filtre par recherche textuelle
    if (exerciseSearchQuery.trim()) {
      const searchLower = exerciseSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(ex =>
        ex.nom.toLowerCase().includes(searchLower) ||
        (ex.tags && ex.tags.toLowerCase().includes(searchLower))
      );
    }

    // Exclure les exercices déjà configurés
    filtered = filtered.filter(ex =>
      !selectedExercises.find(selected => selected.exerciseId === ex.id)
    );

    setFilteredExercises(filtered);
  }, [allExercises, typeFilters, tagFilters, exerciseSearchQuery, selectedExercises]);

  // Fonctions de gestion des filtres chips
  const toggleTypeFilter = (type: string) => {
    setTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleTagFilter = (tag: string) => {
    setTagFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const clearAllFilters = () => {
    setTypeFilters([]);
    setTagFilters([]);
    setExerciseSearchQuery('');
  };

  // Fonctions de gestion des checkboxes exercices
  const toggleExerciseCheck = (exerciseId: number) => {
    setCheckedExerciseIds(prev =>
      prev.includes(exerciseId) ? prev.filter(id => id !== exerciseId) : [...prev, exerciseId]
    );
  };

  const handleCheckAll = () => {
    const allIds = filteredExercises.map(ex => ex.id);
    setCheckedExerciseIds(allIds);
  };

  const handleUncheckAll = () => {
    setCheckedExerciseIds([]);
  };

  // Confirmer la sélection d'exercices et les ajouter
  const handleConfirmSelection = () => {
    const newExercises = checkedExerciseIds.map(id => {
      const exercise = allExercises.find(ex => ex.id === id);
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
    // Scroll vers la section des exercices sélectionnés
    setTimeout(() => {
      selectedExercisesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Fonctions de gestion des templates
  const toggleTemplateCheck = (templateId: number) => {
    setCheckedTemplateIds(prev =>
      prev.includes(templateId) ? prev.filter(id => id !== templateId) : [...prev, templateId]
    );
  };

  const handleConfirmTemplateSelection = () => {
    const newExercises: ProgrammeExercise[] = [];

    checkedTemplateIds.forEach(templateId => {
      const template = allTemplates.find(t => t.id === templateId);
      if (template) {
        template.items.forEach(item => {
          // Vérifier que l'exercice n'est pas déjà dans la liste
          if (!selectedExercises.find(e => e.exerciseId === item.exerciceModele.id) &&
              !newExercises.find(e => e.exerciseId === item.exerciceModele.id)) {
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
    // Scroll vers la section des exercices sélectionnés
    setTimeout(() => {
      selectedExercisesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
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
    setTypeFilters([]);
    setTagFilters([]);
    setExerciseSearchQuery('');
    setCheckedExerciseIds([]);
    setCheckedTemplateIds([]);
  };

  const resetEditForm = () => {
    setEditTitle('');
    setEditDescription('');
    setEditDuration(1);
    setSelectedExercises([]);
    setTypeFilters([]);
    setTagFilters([]);
    setExerciseSearchQuery('');
    setCheckedExerciseIds([]);
    setCheckedTemplateIds([]);
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
            tempsTravail: ex.tempsTravail || 0,
            instructions: ex.instructions || ''
          }))
        })
      });
      if (!res.ok) throw res; // Passer la Response pour que handleProgrammeCreationError puisse lire le status et le JSON
      
      setOpenCreateModal(false);
      resetCreateForm();
      await refreshProgrammes();
    } catch (err) {
      // Utiliser le gestionnaire d'erreur centralisé
      await handleProgrammeCreationError(err, toast);
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
      tempsTravail: ex.tempsTravail || 0,
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
            tempsTravail: ex.tempsTravail || 0,
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
    setCurrentProgrammeId(programmeId);
    setWhatsappStatus('idle');
    setWhatsappError(null);
    
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

  // NOUVELLE FONCTION : Envoyer le lien par WhatsApp
  const handleSendWhatsApp = async () => {
    if (!currentProgrammeId || !generatedLink || !patient) return;

    setSendingWhatsApp(true);
    setWhatsappStatus('sending');
    setWhatsappError(null);

    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${currentProgrammeId}/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chatLink: generatedLink
        })
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setWhatsappStatus('success');
      } else {
        setWhatsappStatus('error');
        setWhatsappError(result.error || 'Erreur inconnue');
      }
    } catch (err) {
      console.error("Erreur envoi WhatsApp :", err);
      setWhatsappStatus('error');
      setWhatsappError('Erreur technique lors de l\'envoi');
    } finally {
      setSendingWhatsApp(false);
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
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
          <DialogTitle className="text-lg sm:text-xl font-semibold text-white">
            {modalTitle}
          </DialogTitle>
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
                  Objectifs du programme *
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
                <div className="relative">
                  <Input
                    id="programme-duration"
                    type="number"
                    min={1}
                    max={30}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    placeholder="Durée en jours (max 30)"
                    className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    required
                  />
                  {duration > 30 && (
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

          {/* Section Exercices avec filtres et sélection */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-green-500 rounded-full"></div>
              Exercices du programme
            </h3>

            <div className="space-y-4">
              {/* Filtres par chips cliquables */}
              <div className="space-y-3">
                {/* Barre de recherche en premier */}
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
                  <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Type</Label>
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
                      variant={typeFilters.includes('templates') ? 'default' : 'outline'}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleTypeFilter('templates')}
                    >
                      📋 Templates
                    </Badge>
                  </div>
                </div>

                {/* Filtres Tags */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Catégories</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
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

                {/* Résumé + Actions */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {filteredExercises.length} exercice{filteredExercises.length > 1 ? 's' : ''} disponible{filteredExercises.length > 1 ? 's' : ''}
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

              {/* Liste des exercices/templates avec checkboxes - Hauteur fixe pour stabilité UX */}
              <div className="flex flex-col h-[480px] border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0 gap-2">
                  <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                    {typeFilters.includes('templates') ? 'Sélectionner des templates' : 'Sélectionner des exercices'}
                  </Label>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {(typeFilters.includes('templates') ? checkedTemplateIds.length > 0 : checkedExerciseIds.length > 0) && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={typeFilters.includes('templates') ? handleConfirmTemplateSelection : handleConfirmSelection}
                        className="h-7 text-xs bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] hover:from-[#3899aa] hover:to-[#1a4f5b] text-white"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {typeFilters.includes('templates')
                          ? `Ajouter (${checkedTemplateIds.length})`
                          : `Ajouter (${checkedExerciseIds.length})`
                        }
                      </Button>
                    )}
                    {(typeFilters.includes('templates') ? allTemplates.length > 0 : filteredExercises.length > 0) && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={typeFilters.includes('templates') ? () => setCheckedTemplateIds(allTemplates.map(t => t.id)) : handleCheckAll}
                          className="h-7 text-xs"
                        >
                          Tout sélectionner
                        </Button>
                        {(typeFilters.includes('templates') ? checkedTemplateIds.length > 0 : checkedExerciseIds.length > 0) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={typeFilters.includes('templates') ? () => setCheckedTemplateIds([]) : handleUncheckAll}
                            className="h-7 text-xs"
                          >
                            Tout désélectionner
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {typeFilters.includes('templates') ? (
                    // AFFICHAGE DES TEMPLATES
                    allTemplates.length === 0 ? (
                      <div className="flex items-center justify-center h-full p-4 text-center text-sm text-gray-500">
                        Aucun template disponible
                      </div>
                    ) : (
                      <div className="divide-y">
                        {allTemplates.map(template => (
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
                              <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                {template.nom}
                              </p>
                              {template.description && (
                                <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                              )}
                              <div className="flex gap-1 mt-1 flex-wrap">
                                <Badge variant={template.isPublic ? "default" : "secondary"} className="text-xs">
                                  {template.isPublic ? 'Public' : 'Privé'}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {template.items.length} exercice{template.items.length > 1 ? 's' : ''}
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {template.items.slice(0, 2).map(item => item.exerciceModele.nom).join(', ')}
                                {template.items.length > 2 && ` +${template.items.length - 2} autre${template.items.length - 2 > 1 ? 's' : ''}`}
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
                        {filteredExercises.map(exercise => (
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
                              <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                {exercise.nom}
                              </p>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                <Badge variant={exercise.isPublic ? "default" : "secondary"} className="text-xs">
                                  {exercise.isPublic ? 'Public' : 'Privé'}
                                </Badge>
                                {exercise.tags && parseTagsFromString(exercise.tags).slice(0, 3).map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>

              </div>

              {/* Exercices sélectionnés */}
              {selectedExercises.length > 0 && (
                <div ref={selectedExercisesRef} className="space-y-3">
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
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                          <Label className="text-xs font-medium text-gray-600">Travail (sec)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={ex.tempsTravail}
                            onChange={(e) => handleInputChange(index, 'tempsTravail', Number(e.target.value))}
                            className="text-sm"
                            placeholder="0"
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
          <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
            {selectedExercises.length > 5 && (
              <p className="text-sm text-red-500 text-center">
                Maximum 5 exercices par programme ({selectedExercises.length} sélectionnés)
              </p>
            )}
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
                className="flex-1 bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] hover:from-[#3899aa] hover:to-[#1a4f5b] text-white shadow-lg transition-all duration-200 text-sm sm:text-base"
                disabled={!title || !description || selectedExercises.length === 0 || selectedExercises.length > 5 || duration <= 0 || duration > 30}
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
        <div className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] rounded-lg overflow-hidden">
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
                                className="hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-200 dark:hover:border-blue-700"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            {renderProgrammeModal(true)}
                          </Dialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700">
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
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                            <Dumbbell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            Exercices du programme
                          </h4>
                          <div className="grid gap-3">
                            {programme.exercices.map((exercise: any, exIndex: number) => (
                              <div key={exercise.id || exIndex} className="p-4 bg-gray-50 dark:bg-gray-800 border rounded-lg">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                                      {exercise.exerciceModele?.nom || exercise.nom}
                                    </h5>
                                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2 flex-wrap">
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.series} série{exercise.series > 1 ? 's' : ''}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.repetitions} rép.
                                      </Badge>
                                      {exercise.tempsTravail > 0 && (
                                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/30">
                                          {exercise.tempsTravail}s travail
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.pause || exercise.tempsRepos || exercise.restTime}s repos
                                      </Badge>
                                    </div>
                                    {(exercise.consigne || exercise.instructions) && (
                                      <p className="text-sm text-gray-700 dark:text-gray-300 italic bg-blue-50 dark:bg-blue-900/30 p-2 rounded border-l-2 border-blue-200 dark:border-blue-700">
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
                        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-green-800 dark:text-green-300 mb-1">
                                Partager avec le patient
                              </h4>
                              <p className="text-sm text-green-700 dark:text-green-400">
                                Générez un lien sécurisé pour que votre patient accède à son programme via chat
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 border-green-300 dark:border-green-600 hover:border-green-400 dark:hover:border-green-500 bg-white dark:bg-green-900/20 hover:bg-green-50 dark:hover:bg-green-900/40"
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

        {/* Modal pour afficher le lien généré avec WhatsApp */}
        <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-green-600" />
                Lien de chat généré
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
                <p className="text-sm text-green-800 dark:text-green-300 mb-3">
                  ✅ Lien sécurisé généré avec succès !
                </p>
                <p className="text-xs text-green-700 dark:text-green-400">
                  Votre patient pourra accéder à son programme personnalisé et poser ses questions via ce lien.
                </p>
              </div>
              
              {/* Section WhatsApp */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-600" />
                  <Label className="text-sm font-medium">Envoi WhatsApp</Label>
                </div>
                
                {/* Statut WhatsApp */}
                {whatsappStatus === 'idle' && patient?.phone && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                      📱 Prêt à envoyer à : <strong>{patient.phone}</strong>
                    </p>
                    <Button 
                      onClick={handleSendWhatsApp}
                      disabled={sendingWhatsApp}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {sendingWhatsApp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Envoyer sur WhatsApp
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                {whatsappStatus === 'sending' && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        Envoi du message WhatsApp en cours...
                      </p>
                    </div>
                  </div>
                )}
                
                {whatsappStatus === 'success' && (
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                        Message WhatsApp envoyé avec succès ! 📱
                      </p>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Votre patient va recevoir le lien sur WhatsApp dans quelques instants.
                    </p>
                  </div>
                )}
                
                {whatsappStatus === 'error' && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                        Erreur lors de l'envoi WhatsApp
                      </p>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-400 mb-3">
                      {whatsappError || 'Une erreur est survenue lors de l\'envoi.'}
                    </p>
                    <Button
                      onClick={handleSendWhatsApp}
                      disabled={sendingWhatsApp}
                      size="sm"
                      variant="outline"
                      className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Réessayer
                    </Button>
                  </div>
                )}
                
                {!patient?.phone && (
                  <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <p className="text-sm text-orange-800 dark:text-orange-300">
                        Numéro de téléphone manquant - WhatsApp indisponible
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Section lien manuel */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Lien à partager manuellement :</Label>
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border text-sm break-all font-mono">
                  {generatedLink}
                </div>
                <Button 
                  onClick={copyLinkToClipboard}
                  variant="outline"
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier le lien
                </Button>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={() => {
                    setShowLinkModal(false);
                    setWhatsappStatus('idle');
                    setWhatsappError(null);
                    setCurrentProgrammeId(null);
                    setGeneratedLink(null);
                  }}
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