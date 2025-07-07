'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Bell, AlertCircle, Users, CheckCircle, XCircle, CalendarDays, Percent, Calendar as CalendarIcon, RefreshCw, Clock, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Interfaces pour les types de données
interface KineData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface NotificationData {
  id: number;
  type: 'DAILY_VALIDATION' | 'PROGRAM_COMPLETED' | 'PAIN_ALERT';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  patient: {
    id: number;
    name: string;
  } | null;
  programme: {
    id: number;
    titre: string;
  } | null;
  metadata: any;
}

interface PatientSession {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    nom: string;
    age: number;
  };
  programme: {
    id: number;
    titre: string;
    dateDebut: string;
    dateFin: string;
    isArchived: boolean;
  };
  session: {
    isValidated: boolean;
    painLevel: number | null;
    difficultyLevel: number | null;
    validatedAt: string | null;
  };
}

interface AdherenceData {
  success: boolean;
  date: string;
  isToday: boolean;
  isHistorical: boolean;
  dataScope: string;
  adherence: {
    totalPatients: number;
    validatedPatients: number;
    percentage: number;
  };
  metrics: {
    avgPainLevel: number | null;
    avgDifficultyLevel: number | null;
    validationsCount: number;
  };
}

interface PatientsSessionsData {
  success: boolean;
  date: string;
  isToday: boolean;
  isHistorical: boolean;
  dataScope: string;
  summary: {
    totalPatients: number;
    validatedCount: number;
    pendingCount: number;
    adherencePercentage: number;
  };
  patients: PatientSession[];
}

const getInitials = (name?: string): string => {
  if (!name) return '??';
  const names = name.split(' ');
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

// Helper pour l'icône des notifications (gardé au cas où, mais plus utilisé)
const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'DAILY_VALIDATION':
      return <CalendarDays className="h-4 w-4 text-blue-500" />;
    case 'PROGRAM_COMPLETED':
      return <Trophy className="h-4 w-4 text-green-500" />;
    case 'PAIN_ALERT':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Bell className="h-4 w-4 text-blue-500" />;
  }
};

export default function KineHomePage() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [adherenceData, setAdherenceData] = useState<AdherenceData | null>(null);
  const [patientsData, setPatientsData] = useState<PatientsSessionsData | null>(null);
  const [kine, setKine] = useState<KineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAdherence, setLoadingAdherence] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL de l'API
  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Récupération du token Firebase
  const getAuthToken = async () => {
    const user = getAuth().currentUser;
    if (!user) {
      throw new Error('Utilisateur non connecté');
    }
    return await user.getIdToken();
  };

  // Récupération du profil kiné
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (user) {
        try {
          const response = await fetch(`${API_URL}/kine/profile`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${await user.getIdToken()}`,
            },
          });

          if (response.ok) {
            const kineData = await response.json();
            setKine(kineData);
          }
        } catch (error) {
          console.error('Erreur lors du chargement du profil kiné:', error);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [API_URL]);

  // Chargement des données d'adhérence selon la date sélectionnée
  useEffect(() => {
    if (kine) {
      fetchAdherenceData(selectedDate);
    }
  }, [selectedDate, kine]);

  // Chargement du count des notifications
  useEffect(() => {
    if (kine) {
      fetchUnreadCount();
    }
  }, [kine]);

  const fetchUnreadCount = async () => {
    try {
      const token = await getAuthToken();

      // Récupérer seulement le count des non lues
      const unreadResponse = await fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (unreadResponse.ok) {
        const unreadData = await unreadResponse.json();
        if (unreadData.success) {
          setUnreadCount(unreadData.count);
        }
      }

    } catch (error) {
      console.error('Erreur chargement count notifications:', error);
    }
  };

  const fetchAdherenceData = async (date: Date) => {
    if (!kine) return;

    setLoadingAdherence(true);
    setError(null);

    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const token = await getAuthToken();

      // Récupérer les données d'adhérence
      const adherenceResponse = await fetch(`${API_URL}/kine/adherence/${dateStr}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      // Récupérer les détails des patients
      const patientsResponse = await fetch(`${API_URL}/kine/patients-sessions/${dateStr}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!adherenceResponse.ok || !patientsResponse.ok) {
        throw new Error('Erreur lors du chargement des données');
      }

      const adherenceResult = await adherenceResponse.json();
      const patientsResult = await patientsResponse.json();

      if (adherenceResult.success && patientsResult.success) {
        setAdherenceData(adherenceResult);
        setPatientsData(patientsResult);
      } else {
        throw new Error('Données invalides reçues du serveur');
      }

    } catch (err) {
      console.error('Erreur lors du chargement des données d\'adhérence:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      // Données par défaut en cas d'erreur
      setAdherenceData({
        success: false,
        date: format(date, 'yyyy-MM-dd'),
        isToday: format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'),
        isHistorical: format(date, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd'),
        dataScope: 'error',
        adherence: {
          totalPatients: 0,
          validatedPatients: 0,
          percentage: 0
        },
        metrics: {
          avgPainLevel: null,
          avgDifficultyLevel: null,
          validationsCount: 0
        }
      });
      setPatientsData({
        success: false,
        date: format(date, 'yyyy-MM-dd'),
        isToday: format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'),
        isHistorical: format(date, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd'),
        dataScope: 'error',
        summary: {
          totalPatients: 0,
          validatedCount: 0,
          pendingCount: 0,
          adherencePercentage: 0
        },
        patients: []
      });
    } finally {
      setLoadingAdherence(false);
    }
  };

  const handleRefresh = () => {
    fetchAdherenceData(selectedDate);
    fetchUnreadCount();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement de votre tableau de bord...</p>
        </div>
      </div>
    );
  }

  if (!kine) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Erreur de chargement</h2>
          <p className="text-muted-foreground mb-4">Impossible de charger vos informations.</p>
          <Button onClick={() => window.location.reload()}>Réessayer</Button>
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <AuthGuard role="kine" />
      <div className="space-y-6">
        <div className="pb-4 border-b border-border">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Bienvenue {kine.firstName}</h1>
          <p className="flex items-center gap-2 text-md md:text-lg text-muted-foreground mt-1">
            <CalendarDays className="h-5 w-5 text-accent" />
            Aujourd'hui : {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </p>
        </div>

        {/* Notifications urgentes - Version simplifiée */}
        {unreadCount > 0 && (
          <Card className="shadow-md bg-red-50 border-red-200 hover:shadow-lg transition-shadow duration-200 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-red-700 text-lg">
                <AlertCircle size={20} /> 
                Notifications Urgentes 
                <Badge variant="destructive" className="ml-2">
                  {unreadCount}
                </Badge>
              </CardTitle>
              <Link href="/dashboard/kine/notifications">
                <Button variant="destructive" size="sm" className="flex items-center gap-1">
                  <Bell className="h-4 w-4" /> Voir Tout
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <p className="text-sm text-red-700">
                {unreadCount === 1
                  ? `Vous avez 1 notification non lue nécessitant votre attention.`
                  : `Vous avez ${unreadCount} notifications non lues nécessitant votre attention.`
                }
              </p>
            </CardContent>
          </Card>
        )}

        {/* Card Adhérence Patients */}
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 ease-in-out border-border hover:border-accent">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3 text-primary">
                <Users className="text-accent h-6 w-6" />
                <span>Adhérence Patients</span>
                {adherenceData?.isHistorical && (
                  <Badge variant="secondary" className="ml-2">
                    <Clock className="h-3 w-3 mr-1" />
                    Historique
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Suivi des séances pour le <span className="font-medium">{format(selectedDate, 'd MMMM yyyy', { locale: fr })}</span>.
                {error && <span className="text-destructive ml-2">• Erreur de chargement</span>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loadingAdherence}
                className="flex items-center gap-1"
              >
                <RefreshCw className={cn("h-4 w-4", loadingAdherence && "animate-spin")} />
                Actualiser
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                    disabled={loadingAdherence}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP', { locale: fr }) : <span>Choisir une date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                    locale={fr}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Indicateur de chargement */}
            {loadingAdherence && (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Chargement des données...</p>
                </div>
              </div>
            )}

            {/* Données d'adhérence */}
            {!loadingAdherence && adherenceData && (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Taux d'adhésion global</p>
                    <p className="text-3xl font-bold text-primary flex items-center gap-1">
                      <Percent size={24} />{adherenceData.adherence.percentage}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ({adherenceData.adherence.validatedPatients} / {adherenceData.adherence.totalPatients} patients ont validé)
                    </p>
                  </div>
                  <Progress 
                    value={adherenceData.adherence.percentage} 
                    className="w-full sm:w-1/2 h-3 mt-2 sm:mt-0" 
                    indicatorClassName="bg-primary"
                  />
                </div>

                {/* Liste des patients */}
                {patientsData && patientsData.patients.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Programme</TableHead>
                          <TableHead className="text-right">Statut Séance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {patientsData.patients.map((patientSession) => (
                          <TableRow key={`${patientSession.patient.id}-${patientSession.programme.id}`} className="hover:bg-muted/30">
                            <TableCell>
                              <Link 
                                href={`/dashboard/kine/patients/${patientSession.patient.id}`} 
                                className="flex items-center gap-3 group hover:text-primary transition-colors"
                              >
                                <Avatar className="h-8 w-8 border group-hover:border-primary">
                                  <AvatarFallback className="text-xs bg-secondary text-secondary-foreground group-hover:bg-primary/10">
                                    {getInitials(patientSession.patient.nom)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <span className="font-medium">{patientSession.patient.nom}</span>
                                  <p className="text-xs text-muted-foreground">{patientSession.patient.age} ans</p>
                                </div>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{patientSession.programme.titre}</p>
                                {patientSession.programme.isArchived && (
                                  <Badge variant="secondary" className="mt-1 text-xs">
                                    Archivé
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {patientSession.session.isValidated ? (
                                <div className="flex flex-col items-end gap-1">
                                  <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Validée
                                  </Badge>
                                  {patientSession.session.painLevel !== null && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className={patientSession.session.painLevel >= 8 ? "text-red-600 font-medium" : ""}>
                                        D: {patientSession.session.painLevel}/10
                                      </span>
                                      {" • "}
                                      <span className={(patientSession.session.difficultyLevel ?? 0) >= 8 ? "text-red-600 font-medium" : ""}>
                                        Diff: {patientSession.session.difficultyLevel}/10
                                      </span>
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white">
                                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> En attente
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4 italic">
                    {error 
                      ? "Erreur lors du chargement des données. Veuillez réessayer."
                      : `Aucun patient avec séance prévue pour le ${format(selectedDate, 'dd/MM/yyyy')}.`
                    }
                  </p>
                )}
              </>
            )}
          </CardContent>
          
          <CardFooter className="border-t pt-4">
            <Button asChild variant="outline" className="ml-auto">
              <Link href="/dashboard/kine/patients">
                Voir Tous les Patients
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppLayout>
  );
}