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
    instructions?: string;
    exerciceModele: {
      id: number;
      nom: string;
    };
  }>;
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
  const [typeFilters, setTypeFilters] = useState<string[]>([]); // Multi-select: 'public', 'private', 'templates'
  const [tagFilters, setTagFilters] = useState<string[]>([]); // Multi-select tags
  const [checkedExerciseIds, setCheckedExerciseIds] = useState<number[]>([]); // IDs cochés avant config
  const [showConfigSection, setShowConfigSection] = useState(false); // Afficher section config
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');
  const [creatingProgramme, setCreatingProgramme] = useState(false);

  // États pour les templates
  const [allTemplates, setAllTemplates] = useState<ExerciceTemplate[]>([]);
  const [checkedTemplateIds, setCheckedTemplateIds] = useState<number[]>([]);

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

  // Charger les templates
  const fetchTemplates = async () => {
    try {
      const templates = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/exercice-templates/all`).then(r => r.json());
      setAllTemplates(templates);
    } catch (err) {
      console.error('Erreur chargement templates', err);
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

  // Charger exercices et templates quand on ouvre le modal de création
  useEffect(() => {
    if (showCreateModal) {
      fetchExercises();
      fetchTemplates();
    }
  }, [showCreateModal]);

  // Effet pour filtrer les exercices selon les filtres sélectionnés
  useEffect(() => {
    let filtered = [...allExercises];

    // Filtre par type (multi-select)
    if (typeFilters.length > 0) {
      filtered = filtered.filter(ex => {
        if (typeFilters.includes('public') && ex.isPublic) return true;
        if (typeFilters.includes('private') && !ex.isPublic) return true;
        return false;
      });
    }

    // Filtre par tags (multi-select - AND logic: tous les tags doivent être présents)
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

    // Exclure les exercices déjà configurés (pas juste cochés)
    filtered = filtered.filter(ex =>
      !selectedExercises.find(selected => selected.exerciseId === ex.id)
    );

    setFilteredExercises(filtered);
  }, [allExercises, typeFilters, tagFilters, exerciseSearchQuery, selectedExercises]);

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

  // Fonctions de gestion des filtres
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

  // Fonctions de gestion des checkboxes
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

  // Confirmer la sélection et passer à la configuration
  const handleConfirmSelection = () => {
    const newExercises = checkedExerciseIds.map(id => {
      const exercise = allExercises.find(ex => ex.id === id);
      return {
        exerciseId: id,
        nom: exercise?.nom || '',
        series: 3,
        repetitions: 10,
        restTime: 30,
        instructions: '',
      };
    });
    setSelectedExercises([...selectedExercises, ...newExercises]);
    setCheckedExerciseIds([]);
    setShowConfigSection(true);
  };

  // Ancienne fonction pour compatibilité (gardée au cas où)
  const handleAddExercise = (exerciseId: string) => {
    const exercise = allExercises.find(ex => ex.id === parseInt(exerciseId));
    if (!exercise || selectedExercises.find(e => e.exerciseId === exercise.id)) return;

    setSelectedExercises([
      ...selectedExercises,
      {
        exerciseId: exercise.id,
        nom: exercise.nom,
        series: 3,
        repetitions: 10,
        restTime: 30,
        instructions: '',
      },
    ]);
    setSelectedExerciseId('');
  };

  // Gestion des templates
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
              !newExercises.find(e => e.exerciceId === item.exerciceModele.id)) {
            newExercises.push({
              exerciseId: item.exerciceModele.id,
              nom: item.exerciceModele.nom,
              series: item.series,
              repetitions: item.repetitions,
              restTime: item.tempsRepos,
              instructions: item.instructions || '',
            });
          }
        });
      }
    });

    setSelectedExercises([...selectedExercises, ...newExercises]);
    setCheckedTemplateIds([]);
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
    setTypeFilters([]);
    setTagFilters([]);
    setCheckedExerciseIds([]);
    setShowConfigSection(false);
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
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto mx-4 sm:mx-auto">
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
                  <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                    <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                      {typeFilters.includes('templates') ? 'Sélectionner des templates' : 'Sélectionner des exercices'}
                    </Label>
                    {(typeFilters.includes('templates') ? allTemplates.length > 0 : filteredExercises.length > 0) && (
                      <div className="flex gap-2">
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
                      </div>
                    )}
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

                  {/* Bouton sticky en bas de la zone fixe */}
                  {(typeFilters.includes('templates') ? checkedTemplateIds.length > 0 : checkedExerciseIds.length > 0) && (
                    <div className="border-t bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 p-3 flex-shrink-0">
                      <Button
                        type="button"
                        onClick={typeFilters.includes('templates') ? handleConfirmTemplateSelection : handleConfirmSelection}
                        className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white shadow-lg"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {typeFilters.includes('templates')
                          ? `Ajouter ${checkedTemplateIds.length} template${checkedTemplateIds.length > 1 ? 's' : ''} sélectionné${checkedTemplateIds.length > 1 ? 's' : ''}`
                          : `Ajouter ${checkedExerciseIds.length} exercice${checkedExerciseIds.length > 1 ? 's' : ''} sélectionné${checkedExerciseIds.length > 1 ? 's' : ''}`
                        }
                      </Button>
                    </div>
                  )}
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}