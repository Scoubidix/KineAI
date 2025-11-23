'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { handleProgrammeCreationError } from '@/utils/handleProgrammeError';
import { 
  Search, 
  Calendar, 
  User, 
  Clock, 
  MessageSquare, 
  Dumbbell, 
  AlertCircle, 
  Filter,
  Plus,
  X,
  Tag
} from 'lucide-react';
import { format, differenceInDays, isAfter, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

interface Programme {
  id: number;
  titre: string;
  description: string;
  duree: number;
  dateDebut: string;
  dateFin: string;
  isArchived: boolean;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
  };
  _count: {
    exercices: number;
    chatSessions: number;
  };
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  hasActiveProgram?: boolean;
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

// Tags suggérés avec ordre de priorité
const SUGGESTED_TAGS = [
  'Mobilité articulaire',
  'Renforcement musculaire', 
  'Étirements',
  'Proprioception',
  'Cardio-respiratoire',
  'Membre supérieur',
  'Membre inférieur',
  'Rachis'
];

const getStatusInfo = (programme: Programme) => {
  const now = new Date();
  const dateFin = new Date(programme.dateFin);
  const dateDebut = new Date(programme.dateDebut);
  const daysRemaining = differenceInDays(dateFin, now);
  
  if (isBefore(dateFin, now)) {
    return {
      status: 'expired',
      label: 'Expiré',
      variant: 'destructive' as const,
      daysText: `Expiré depuis ${Math.abs(daysRemaining)} jour(s)`
    };
  }
  
  if (isBefore(now, dateDebut)) {
    const daysUntilStart = differenceInDays(dateDebut, now);
    return {
      status: 'future',
      label: 'À venir',
      variant: 'secondary' as const,
      daysText: `Débute dans ${daysUntilStart} jour(s)`
    };
  }
  
  if (daysRemaining <= 3) {
    return {
      status: 'ending',
      label: 'Fin proche',
      variant: 'default' as const,
      daysText: `${daysRemaining} jour(s) restant(s)`
    };
  }
  
  return {
    status: 'active',
    label: 'Actif',
    variant: 'default' as const,
    daysText: `${daysRemaining} jour(s) restant(s)`
  };
};

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

// Fonction pour parser les tags depuis la string
const parseTagsFromString = (tagsString?: string): string[] => {
  if (!tagsString) return [];
  return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
};

export default function ProgrammesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ending'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // États pour la sélection de patient
  const [showPatientSelector, setShowPatientSelector] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(false);

  // États pour la création de programme
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDuration, setCreateDuration] = useState(1);
  
  // États pour les exercices
  const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<ProgrammeExercise[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');
  const [creatingProgramme, setCreatingProgramme] = useState(false);

  const fetchData = async (token: string) => {
    try {
      const programmesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/programmes/kine/all`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (programmesRes.ok) {
        const programmesData = await programmesRes.json();
        setProgrammes(programmesData);
      } else {
        throw new Error('Erreur lors du chargement des programmes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  // Charger la liste des patients
  const fetchPatients = async () => {
    setLoadingPatients(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;
      
      // Récupérer d'abord les infos du kiné pour avoir son ID
      const kineProfileRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
      if (!kineProfileRes.ok) return;
      
      const kineData = await kineProfileRes.json();
      
      // Puis récupérer ses patients
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/kine/${kineData.id}`);
      if (res.ok) {
        const data = await res.json();
        
        // Enrichir chaque patient avec l'info s'il a un programme actif
        const patientsWithProgramStatus = data.map((patient: Patient) => ({
          ...patient,
          hasActiveProgram: programmes.some(prog => prog.patient.id === patient.id)
        }));
        
        setPatients(patientsWithProgramStatus);
      }
    } catch (err) {
      console.error('Erreur chargement patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  // Charger les exercices
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (user) {
        const token = await user.getIdToken();
        fetchData(token);
      } else {
        setLoading(false);
        setError('Non authentifié');
      }
    });
    return () => unsubscribe();
  }, []);

  // Charger exercices quand on ouvre le modal de création
  useEffect(() => {
    if (showCreateModal) {
      fetchExercises();
    }
  }, [showCreateModal]);

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

    // Filtre par recherche textuelle
    if (exerciseSearchQuery.trim()) {
      const searchLower = exerciseSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(ex =>
        ex.nom.toLowerCase().includes(searchLower) ||
        (ex.tags && ex.tags.toLowerCase().includes(searchLower))
      );
    }

    // Exclure les exercices déjà sélectionnés
    filtered = filtered.filter(ex =>
      !selectedExercises.find(selected => selected.exerciseId === ex.id)
    );

    setFilteredExercises(filtered);
  }, [allExercises, typeFilter, tagFilter, exerciseSearchQuery, selectedExercises]);

  // Filtrage des programmes
  const filteredProgrammes = programmes.filter(programme => {
    const matchesSearch = programme.titre.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         `${programme.patient.firstName} ${programme.patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (statusFilter === 'all') return true;
    
    const statusInfo = getStatusInfo(programme);
    return statusInfo.status === statusFilter;
  });

  // Filtrage des patients pour la sélection
  const filteredPatients = patients.filter(patient =>
    `${patient.lastName.toUpperCase()} ${patient.firstName}`.toLowerCase().includes(patientSearchQuery.toLowerCase()) ||
    patient.email.toLowerCase().includes(patientSearchQuery.toLowerCase())
  );

  // Fonctions de gestion des exercices
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
    setSelectedExerciseId('');
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

  // Ouvrir la sélection de patient
  const handleOpenPatientSelector = () => {
    setShowPatientSelector(true);
    fetchPatients();
  };

  // Sélectionner un patient et ouvrir le modal de création
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientSelector(false);
    setShowCreateModal(true);
  };

  // Reset des formulaires
  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreateDuration(1);
    setSelectedExercises([]);
    setTypeFilter('all');
    setTagFilter('all');
    setSelectedExerciseId('');
    setExerciseSearchQuery('');
    setSelectedPatient(null);
  };

  // Créer le programme
  const handleCreateProgramme = async () => {
    if (!selectedPatient) return;
    
    setCreatingProgramme(true);
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
          patientId: selectedPatient.id,
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

      if (res.ok) {
        setShowCreateModal(false);
        resetCreateForm();
        
        // Afficher le toast de succès
        toast({
          title: "✅ Programme créé avec succès !",
          description: `Le programme "${createTitle}" a été créé pour ${selectedPatient.firstName} ${selectedPatient.lastName}.`,
          duration: 4000,
        });
        
        // Rediriger vers la page patient après un court délai
        setTimeout(() => {
          router.push(`/dashboard/kine/patients/${selectedPatient.id}`);
        }, 1000);
      } else {
        throw res; // Passer la Response pour que handleProgrammeCreationError puisse lire le status et le JSON
      }
    } catch (err) {
      // Utiliser le gestionnaire d'erreur centralisé  
      await handleProgrammeCreationError(err, toast);
    } finally {
      setCreatingProgramme(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des programmes...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Erreur de chargement</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AuthGuard role="kine" />
      <div className="space-y-6">
        {/* En-tête */}
        <div className="pb-4 border-b border-border flex justify-between items-start pr-16 lg:pr-0">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Gestion des Programmes</h1>
            <p className="flex items-center gap-2 text-md md:text-lg text-muted-foreground mt-1">
              <Calendar className="h-5 w-5 text-accent" />
              Vue d'ensemble de tous vos programmes de rééducation
            </p>
          </div>
          <Button onClick={handleOpenPatientSelector} className="flex items-center gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Créer un programme
          </Button>
        </div>

        {/* Barre de recherche et filtres */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par titre ou nom du patient..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                  className="flex items-center gap-1"
                >
                  <Filter className="h-4 w-4" />
                  Tous ({programmes.length})
                </Button>
                <Button
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('active')}
                >
                  Actifs
                </Button>
                <Button
                  variant={statusFilter === 'ending' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('ending')}
                >
                  Fin proche
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liste des programmes */}
        {filteredProgrammes.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucun programme trouvé</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== 'all' 
                  ? 'Aucun programme ne correspond à vos critères de recherche.'
                  : 'Vous n\'avez pas encore créé de programmes.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredProgrammes.map((programme) => {
              const statusInfo = getStatusInfo(programme);
              const progressPercent = Math.max(0, Math.min(100, 
                ((programme.duree - differenceInDays(new Date(programme.dateFin), new Date())) / programme.duree) * 100
              ));

              return (
                <Card key={programme.id} className="shadow-md hover:shadow-lg transition-all duration-200 ease-in-out border-border hover:border-accent group">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Infos principales */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-primary group-hover:text-accent transition-colors">
                              {programme.titre}
                            </h3>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {programme.description}
                            </p>
                          </div>
                          <Badge variant={statusInfo.variant} className="ml-4">
                            {statusInfo.label}
                          </Badge>
                        </div>

                        {/* Patient */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                            {getInitials(programme.patient.firstName, programme.patient.lastName)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {programme.patient.firstName} {programme.patient.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {programme.patient.phone}
                            </p>
                          </div>
                        </div>

                        {/* Progression */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Progression</span>
                            <span className="text-primary font-medium">{statusInfo.daysText}</span>
                          </div>
                          <Progress 
                            value={progressPercent} 
                            className="h-2" 
                            indicatorClassName={
                              statusInfo.status === 'expired' ? 'bg-destructive' :
                              statusInfo.status === 'ending' ? 'bg-orange-500' : 'bg-primary'
                            }
                          />
                        </div>
                      </div>

                      {/* Métriques */}
                      <div className="flex flex-row lg:flex-col gap-4 lg:gap-2 lg:items-end">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Dumbbell className="h-4 w-4" />
                          <span>{programme._count.exercices} exercices</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          <span>{programme._count.chatSessions} messages</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{programme.duree} jours</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-row lg:flex-col gap-2">
                        <Button asChild variant="default" size="sm" className="flex-1 lg:flex-none">
                          <Link href={`/dashboard/kine/patients/${programme.patient.id}`}>
                            <User className="h-4 w-4 mr-2" />
                            Voir Patient
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Résumé en bas */}
        {filteredProgrammes.length > 0 && (
          <Card className="shadow-sm bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center text-sm text-muted-foreground">
                Affichage de <span className="font-medium text-primary">{filteredProgrammes.length}</span> programme(s) 
                {searchQuery && <span> correspondant à "{searchQuery}"</span>}
                {programmes.length > 0 && <span> sur un total de {programmes.length}</span>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de sélection de patient */}
      <Dialog open={showPatientSelector} onOpenChange={setShowPatientSelector}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choisir un patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un patient..."
                value={patientSearchQuery}
                onChange={(e) => setPatientSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {loadingPatients ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  {patientSearchQuery ? 'Aucun patient trouvé' : 'Aucun patient disponible'}
                </div>
              ) : (
                filteredPatients.map(patient => {
                  const hasActiveProgram = patient.hasActiveProgram;
                  
                  return (
                    <Card 
                      key={patient.id} 
                      className={`p-3 transition-colors ${
                        hasActiveProgram 
                          ? 'bg-gray-100 cursor-not-allowed opacity-60' 
                          : 'cursor-pointer hover:bg-accent'
                      }`}
                      onClick={() => !hasActiveProgram && handleSelectPatient(patient)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                          {getInitials(patient.firstName, patient.lastName)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium text-sm ${hasActiveProgram ? 'text-gray-500' : ''}`}>
                              {patient.lastName.toUpperCase()} {patient.firstName}
                            </p>
                            {hasActiveProgram && (
                              <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                                Programme en cours
                              </Badge>
                            )}
                          </div>
                          <p className={`text-xs text-muted-foreground ${hasActiveProgram ? 'text-gray-400' : ''}`}>
                            {patient.email}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de création de programme */}
      <Dialog open={showCreateModal} onOpenChange={(open) => {
        setShowCreateModal(open);
        if (!open) resetCreateForm();
      }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto mx-4 sm:mx-auto">
          <DialogHeader className="space-y-3 sticky top-0 bg-white dark:bg-gray-900 pb-4 border-b border-gray-200 dark:border-gray-700">
            <DialogTitle className="text-lg sm:text-xl font-semibold">
              Créer un programme pour {selectedPatient?.firstName} {selectedPatient?.lastName}
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
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
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
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
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

                {/* Barre de recherche d'exercices */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rechercher un exercice à ajouter
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par nom ou catégorie..."
                      value={exerciseSearchQuery}
                      onChange={(e) => setExerciseSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Liste des exercices filtrés */}
                <div className="space-y-2">
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    {filteredExercises.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">
                        {exerciseSearchQuery ? 'Aucun exercice trouvé pour cette recherche' : 'Aucun exercice disponible avec ces filtres'}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredExercises.slice(0, 10).map(exercise => (
                          <div
                            key={exercise.id}
                            className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                {exercise.nom}
                              </p>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                <Badge variant={exercise.isPublic ? "default" : "secondary"} className="text-xs">
                                  {exercise.isPublic ? 'Public' : 'Privé'}
                                </Badge>
                                {exercise.tags && parseTagsFromString(exercise.tags).slice(0, 2).map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleAddExercise(exercise.id.toString())}
                              className="shrink-0"
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Ajouter
                            </Button>
                          </div>
                        ))}
                        {filteredExercises.length > 10 && (
                          <div className="p-2 text-center text-xs text-gray-500 bg-gray-50 dark:bg-gray-800">
                            +{filteredExercises.length - 10} exercice(s) supplémentaire(s) - Affinez votre recherche
                          </div>
                        )}
                      </div>
                    )}
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
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="flex-1 sm:flex-none text-sm sm:text-base"
                  disabled={creatingProgramme}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleCreateProgramme}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg transition-all duration-200 text-sm sm:text-base"
                  disabled={!createTitle || !createDescription || selectedExercises.length === 0 || creatingProgramme || createDuration <= 0 || createDuration > 30}
                >
                  {creatingProgramme ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Création en cours...
                    </>
                  ) : (
                    'Créer le programme'
                  )}
                </Button>
              </div>
              
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                * Champs obligatoires - Au moins un exercice requis
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}