'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';

import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { matchesAllTokens } from '@/utils/textSearch';
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
} from 'lucide-react';
import { format, differenceInDays, isAfter, isBefore, addDays, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { ProgrammeModal } from '@/components/ProgrammeModal';

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
  sessionValidations: {
    date: string;
    isValidated: boolean;
    painLevel: number | null;
    difficultyLevel: number | null;
  }[];
  _count: {
    exercices: number;
    chatSessions: number;
  };
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  hasActiveProgram?: boolean;
}


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

  // État pour la modal de création de programme
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  // Filtrage des programmes
  const filteredProgrammes = programmes.filter(programme => {
    const matchesSearch = matchesAllTokens(
      `${programme.titre} ${programme.patient.firstName} ${programme.patient.lastName}`,
      searchQuery
    );

    if (!matchesSearch) return false;
    
    if (statusFilter === 'all') return true;
    
    const statusInfo = getStatusInfo(programme);
    return statusInfo.status === statusFilter;
  });

  // Filtrage des patients pour la sélection
  const filteredPatients = patients.filter(patient =>
    matchesAllTokens(`${patient.lastName} ${patient.firstName} ${patient.email ?? ''}`, patientSearchQuery)
  );

  // Ouvrir la sélection de patient
  const handleOpenPatientSelector = () => {
    setShowPatientSelector(true);
    fetchPatients();
  };

  // Ouverture auto du sélecteur si redirigé depuis l'accueil (?new=1)
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      handleOpenPatientSelector();
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      router.replace(`/dashboard/kine/programmes${params.toString() ? `?${params.toString()}` : ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sélectionner un patient et ouvrir le modal de création
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientSelector(false);
    setShowCreateModal(true);
  };

  if (loading) {
    return (
      <>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des programmes...</p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Erreur de chargement</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthGuard role="kine" />
      <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* En-tête */}
        <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#3899aa]">Gestion des Programmes</h1>
            <p className="flex items-center gap-2 text-md md:text-lg text-muted-foreground mt-1">
              <Calendar className="h-5 w-5 text-accent" />
              Vue d'ensemble de tous tes programmes de rééducation
            </p>
          </div>
          <Button onClick={handleOpenPatientSelector} className="btn-teal flex items-center gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Créer un programme
          </Button>
        </div>

        {/* Barre de recherche et filtres */}
        <Card className="card-hover">
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
              
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                  className={`flex items-center gap-1 ${statusFilter === 'all' ? 'btn-teal' : ''}`}
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                >
                  <Filter className="h-4 w-4" />
                  Tous ({programmes.length})
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStatusFilter('active')}
                  className={statusFilter === 'active' ? 'btn-teal' : ''}
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                >
                  Actifs
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStatusFilter('ending')}
                  className={statusFilter === 'ending' ? 'btn-teal' : ''}
                  variant={statusFilter === 'ending' ? 'default' : 'outline'}
                >
                  Fin proche
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liste des programmes */}
        {filteredProgrammes.length === 0 ? (
          <Card className="card-hover">
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-foreground">Aucun programme trouvé</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== 'all' 
                  ? 'Aucun programme ne correspond à tes critères de recherche.'
                  : 'Tu n\'as pas encore créé de programmes.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredProgrammes.map((programme) => {
              const statusInfo = getStatusInfo(programme);

              return (
                <Card key={programme.id} className="card-hover group">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Infos principales */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-primary group-hover:text-accent transition-colors">
                              {programme.titre}
                            </h3>
                            <p className="text-sm text-foreground line-clamp-1">
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
                            <p className="font-medium text-sm text-foreground">
                              {programme.patient.firstName} {programme.patient.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {programme.patient.phone}
                            </p>
                          </div>
                        </div>

                        {/* Progression basée sur les validations */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-foreground">Progression</span>
                            <span className={`font-medium ${
                              statusInfo.status === 'expired' ? 'text-destructive' : 'text-[#3899aa]'
                            }`}>{statusInfo.daysText}</span>
                          </div>
                          <TooltipProvider delayDuration={200}>
                            <div className="flex gap-1.5">
                              {Array.from({ length: Math.min(programme.duree, 30) }).map((_, i) => {
                                const dayDate = addDays(new Date(programme.dateDebut), i);
                                const now = new Date();
                                const isPastDay = isBefore(dayDate, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
                                const isToday = isSameDay(dayDate, now);
                                const validation = (programme.sessionValidations ?? []).find(v =>
                                  isSameDay(new Date(v.date), dayDate)
                                );

                                const isFutureDay = !isPastDay && !isToday;
                                const segmentClass = isFutureDay
                                  ? 'bg-muted/60'
                                  : (isToday && !validation?.isValidated)
                                    ? 'bg-muted/60'
                                    : validation?.isValidated
                                      ? 'bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] shadow-[0_0_6px_rgba(56,153,170,0.4)]'
                                      : 'bg-destructive shadow-[0_0_6px_rgba(220,38,38,0.4)]';

                                const showTooltip = isPastDay || (isToday && validation?.isValidated);
                                if (showTooltip) {
                                  return (
                                    <Tooltip key={i}>
                                      <TooltipTrigger asChild>
                                        <div className={`h-2.5 flex-1 rounded-full transition-all duration-300 cursor-pointer ${segmentClass}`} />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        <p className="font-medium">{format(dayDate, 'dd/MM/yyyy', { locale: fr })}</p>
                                        {validation?.isValidated ? (
                                          <>
                                            <p>Douleur : {validation.painLevel ?? '—'}/10</p>
                                            <p>Difficulté : {validation.difficultyLevel ?? '—'}/10</p>
                                          </>
                                        ) : (
                                          <p className="text-destructive">Pas de validation</p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                }

                                return (
                                  <div
                                    key={i}
                                    className={`h-2.5 flex-1 rounded-full transition-all duration-300 ${segmentClass}`}
                                  />
                                );
                              })}
                            </div>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Métriques */}
                      <div className="flex flex-row lg:flex-col gap-4 lg:gap-2 lg:items-end">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Dumbbell className="h-4 w-4" />
                          <span>{programme._count.exercices} exercices</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <MessageSquare className="h-4 w-4" />
                          <span>{programme._count.chatSessions} messages</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{programme.duree} jours</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-row lg:flex-col gap-2">
                        <Button asChild size="sm" className="btn-teal flex-1 lg:flex-none">
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
          <Card className="card-hover">
            <CardContent className="pt-6">
              <div className="text-center text-sm text-foreground">
                Affichage de <span className="font-medium text-[#3899aa]">{filteredProgrammes.length}</span> programme(s) 
                {searchQuery && <span> correspondant à "{searchQuery}"</span>}
                {programmes.length > 0 && <span> sur un total de {programmes.length}</span>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de sélection de patient */}
      <Dialog open={showPatientSelector} onOpenChange={setShowPatientSelector}>
        <DialogContent className="w-[95vw] sm:max-w-md top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
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
                      className={`p-3 transition-all duration-300 ${
                        hasActiveProgram
                          ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-[#3899aa]/10'
                      }`}
                      onClick={() => !hasActiveProgram && handleSelectPatient(patient)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                          {getInitials(patient.firstName, patient.lastName)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium text-sm ${hasActiveProgram ? 'text-gray-500 dark:text-gray-400' : ''}`}>
                              {patient.lastName.toUpperCase()} {patient.firstName}
                            </p>
                            {hasActiveProgram && (
                              <Badge variant="secondary" className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                                Programme en cours
                              </Badge>
                            )}
                          </div>
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
      {selectedPatient && (
        <ProgrammeModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          onCreated={() => {
            // Toast de succès + redirection vers la fiche patient (comportement original)
            toast({
              title: "✅ Programme créé avec succès !",
              description: `Un nouveau programme a été créé pour ${selectedPatient.firstName} ${selectedPatient.lastName}.`,
              duration: 4000,
            });
            const patientId = selectedPatient.id;
            setSelectedPatient(null);
            setTimeout(() => {
              router.push(`/dashboard/kine/patients/${patientId}`);
            }, 1000);
          }}
        />
      )}

    </>
  );
}