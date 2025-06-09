'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Loader2, X, Edit, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

interface PatientData {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
}

interface ExerciseOption {
  id: number;
  nom: string;
  isPublic: boolean;
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
  exercices: any[]; // Changé de 'exercises' à 'exercices'
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
      } catch (err) {
        console.error('Erreur chargement exercices', err);
      }
    };
    if (openCreateModal || openEditModal) fetchExercises();
  }, [openCreateModal, openEditModal]);

  const handleAddExercise = (exercise: ExerciseOption) => {
    if (selectedExercises.find(e => e.exerciseId === exercise.id)) return;
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
    setFilteredExercises([]);
  };

  const resetEditForm = () => {
    setEditTitle('');
    setEditDescription('');
    setEditDuration(1);
    setSelectedExercises([]);
    setFilteredExercises([]);
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
    
    // Convertir les exercices du programme en format ProgrammeExercise
    // Vérifier si exercices existe et est un tableau
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
        method: "DELETE" // Utilise l'archivage au lieu de la suppression définitive
      });
      
      if (!res.ok) throw new Error("Erreur suppression programme");
      
      await refreshProgrammes();
    } catch (err) {
      console.error("Erreur suppression programme :", err);
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
    const modalTitle = isEdit ? "Modifier le programme" : "Créer un programme";
    const buttonText = isEdit ? "Mettre à jour" : "Créer mon programme";

    return (
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Label>Titre du programme</Label>
          <Input placeholder="Titre du programme" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Label>Description</Label>
          <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Label>Durée en jours (max 30)</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            placeholder="Durée"
          />

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">Ajouter un exercice</h3>
            <Input
              placeholder="Rechercher un exercice..."
              onChange={(e) => {
                const query = e.target.value.toLowerCase();
                if (query === '') {
                  setFilteredExercises([]);
                } else {
                  setFilteredExercises(
                    allExercises.filter(ex => ex.nom.toLowerCase().includes(query))
                  );
                }
              }}
            />

            {filteredExercises.map(ex => (
              <div key={ex.id} className="flex items-center justify-between mt-2 p-2 border rounded">
                <span>{ex.nom} {ex.isPublic ? '(Public)' : '(Privé)'}</span>
                <Button size="sm" onClick={() => handleAddExercise(ex)}>Ajouter</Button>
              </div>
            ))}
          </div>

          {selectedExercises.map((ex, index) => (
            <div key={index} className="mt-4 p-4 border rounded space-y-2 bg-gray-50 relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 text-gray-500 hover:text-red-600"
                onClick={() => handleRemoveExercise(index)}
              >
                <X className="w-4 h-4" />
              </Button>
              <h4 className="font-medium">{ex.nom}</h4>
              <Label>Nombre de séries</Label>
              <Input
                type="number"
                value={ex.series}
                onChange={(e) => handleInputChange(index, 'series', Number(e.target.value))}
                placeholder="Séries"
              />
              <Label>Nombre de répétitions</Label>
              <Input
                type="number"
                value={ex.repetitions}
                onChange={(e) => handleInputChange(index, 'repetitions', Number(e.target.value))}
                placeholder="Répétitions"
              />
              <Label>Temps de pause (secondes)</Label>
              <Input
                type="number"
                value={ex.restTime}
                onChange={(e) => handleInputChange(index, 'restTime', Number(e.target.value))}
                placeholder="Pause"
              />
              <Label>Consignes spécifiques</Label>
              <Textarea
                value={ex.instructions}
                onChange={(e) => handleInputChange(index, 'instructions', e.target.value)}
                placeholder="Consignes"
              />
            </div>
          ))}
        </div>

        {selectedExercises.length > 0 && (
          <div className="pt-6 border-t">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSubmit}
            >
              {buttonText}
            </Button>
          </div>
        )}
      </DialogContent>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <Card className="bg-slate-800 text-white p-4">
          {loading ? (
            <Loader2 className="animate-spin mx-auto" />
          ) : patient && (
            <div className="flex items-start gap-4">
              <Image src="/default-avatar.jpg" alt="Avatar" width={64} height={64} className="rounded-full border" />
              <div>
                <h2 className="text-xl font-bold">{patient.lastName.toUpperCase()} {patient.firstName}</h2>
                <p>Date de naissance : {formatDate(patient.birthDate)}</p>
                <p>Âge : {calculateAge(patient.birthDate)} ans</p>
                <p>Email : {patient.email}</p>
                <p>Téléphone : {patient.phone}</p>
              </div>
            </div>
          )}
        </Card>

        <Card className="border-blue-500 border-2 bg-white rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h2 className="text-xl font-semibold text-gray-800">Programmes</h2>
            {programmesData.length === 0 && (
              <Dialog open={openCreateModal} onOpenChange={(open) => {
                setOpenCreateModal(open);
                if (!open) resetCreateForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-500 text-white hover:bg-blue-600">Créer un programme</Button>
                </DialogTrigger>
                {renderProgrammeModal(false)}
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {programmesData.length === 0 ? (
              <p className="text-gray-600 italic">Aucun programme attribué</p>
            ) : (
              <div className="space-y-4">
                {programmesData.map((programme: any, index: number) => (
                  <div key={programme.id || index} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg">{programme.titre}</h3>
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
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          {renderProgrammeModal(true)}
                        </Dialog>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                              <AlertDialogDescription>
                                Êtes-vous sûr de vouloir supprimer le programme "{programme.titre}" ? Cette action est irréversible.
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
                    
                    <p className="text-gray-700 mb-2">{programme.description}</p>
                    <div className="text-sm text-gray-600 mb-3">
                      <p>Durée : {programme.duree} jours</p>
                      {programme.dateFin && (
                        <p>Date de fin : {new Date(programme.dateFin).toLocaleDateString('fr-FR')}</p>
                      )}
                    </div>
                    
                    {programme.exercices && programme.exercices.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Exercices :</h4>
                        <div className="space-y-2">
                          {programme.exercices.map((exercise: any, exIndex: number) => (
                            <div key={exercise.id || exIndex} className="p-3 bg-white border rounded">
                              <p className="font-medium">{exercise.exerciceModele?.nom || exercise.nom}</p>
                              <div className="text-sm text-gray-600 mt-1">
                                <span>{exercise.series} séries × {exercise.repetitions} répétitions</span>
                                <span className="ml-4">Repos : {exercise.pause || exercise.tempsRepos || exercise.restTime}s</span>
                              </div>
                              {(exercise.consigne || exercise.instructions) && (
                                <p className="text-sm text-gray-700 mt-1 italic">{exercise.consigne || exercise.instructions}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}