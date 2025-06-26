'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Bell, AlertCircle, Users, CheckCircle, XCircle, CalendarDays, Percent, Calendar as CalendarIcon } from 'lucide-react';
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

const getSimulatedNotifications = () => [
  { id: 'notif1', type: 'pain_alert', patientName: 'Alice Martin', painLevel: 8, timestamp: new Date(Date.now() - 3600000), read: false },
  { id: 'notif2', type: 'message', patientName: 'Bob Dubois', timestamp: new Date(Date.now() - 86400000 * 2), read: true },
  { id: 'notif3', type: 'pain_alert', patientName: 'Charlie Petit', painLevel: 7, timestamp: new Date(Date.now() - 86400000 * 3), read: false },
];

const getSimulatedAdherence = (selectedDate: Date) => {
  const dateSeed = selectedDate.getDate();
  const baseAdherence = 80;
  const dailyVariation = (dateSeed % 10) * 2 - 10;
  let simulatedPercentage = baseAdherence + dailyVariation;
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  if (!isToday) {
    simulatedPercentage = Math.max(50, simulatedPercentage - 5);
  }
  const totalPatients = 5 + (dateSeed % 3);
  const completedCount = Math.round((simulatedPercentage / 100) * totalPatients);
  const patients = Array.from({ length: totalPatients }, (_, i) => ({
    id: `sim-patient-${dateSeed}-${i + 1}`,
    name: `Patient ${String.fromCharCode(65 + i)} (${format(selectedDate, 'dd/MM')})`,
    completed: i < completedCount,
  }));
  return {
    patients,
    adherencePercentage: totalPatients > 0 ? Math.round((completedCount / totalPatients) * 100) : 0,
    completedCount,
    totalCount: totalPatients
  };
};

const getInitials = (name?: string): string => {
  if (!name) return '??';
  const names = name.split(' ');
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

interface KineData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export default function KineHomePage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [adherenceData, setAdherenceData] = useState({ patients: [] as any[], adherencePercentage: 0, completedCount: 0, totalCount: 0 });
  const [kine, setKine] = useState<KineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (user) {
        try {
          // Récupérer les données depuis PostgreSQL
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
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
          // Erreur silencieuse, gérée par l'UI
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setNotifications(getSimulatedNotifications());
    setAdherenceData(getSimulatedAdherence(selectedDate));
  }, [selectedDate]);

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

  const unreadNotifications = notifications.filter(n => !n.read);

  return (
    <AppLayout>
      <AuthGuard role="kine" />
      <div className="space-y-6">
        <div className="pb-4 border-b border-border">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Bienvenue Dr. {kine.firstName} {kine.lastName}</h1>
          <p className="flex items-center gap-2 text-md md:text-lg text-muted-foreground mt-1">
            <CalendarDays className="h-5 w-5 text-accent" />
            Aujourd'hui : {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </p>
        </div>

         {unreadNotifications.length > 0 && (
            <Card className="shadow-md bg-destructive/10 border-destructive hover:shadow-lg transition-shadow duration-200 ease-in-out">
                 <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="flex items-center gap-2 text-destructive text-lg">
                        <AlertCircle size={20} /> Notifications Urgentes ({unreadNotifications.length})
                    </CardTitle>
                     <Link href="/dashboard/kine/notifications">
                        <Button variant="destructive" size="sm" className="flex items-center gap-1">
                             <Bell className="h-4 w-4" /> Voir Tout
                        </Button>
                    </Link>
                 </CardHeader>
                 <CardContent className="pt-0 pb-4">
                    <p className="text-sm text-destructive">
                        {unreadNotifications.length === 1
                            ? `Vous avez 1 notification non lue nécessitant votre attention.`
                            : `Vous avez ${unreadNotifications.length} notifications non lues nécessitant votre attention.`
                        }
                    </p>
                 </CardContent>
            </Card>
         )}

         <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 ease-in-out border-border hover:border-accent">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-3 text-primary">
                        <Users className="text-accent h-6 w-6" />
                        <span>Adhérence Patients</span>
                    </CardTitle>
                    <CardDescription>Suivi des séances pour le <span className="font-medium">{format(selectedDate, 'd MMMM yyyy', { locale: fr })}</span>.</CardDescription>
                </div>
                <Popover>
                   <PopoverTrigger asChild>
                     <Button
                       variant={"outline"}
                       className={cn(
                         "w-[200px] justify-start text-left font-normal",
                         !selectedDate && "text-muted-foreground"
                       )}
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
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg border border-border">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Taux d'adhésion global</p>
                        <p className="text-3xl font-bold text-primary flex items-center gap-1">
                            <Percent size={24} />{adherenceData.adherencePercentage}%
                        </p>
                        <p className="text-xs text-muted-foreground">({adherenceData.completedCount} / {adherenceData.totalCount} patients ont validé)</p>
                    </div>
                    <Progress value={adherenceData.adherencePercentage} className="w-full sm:w-1/2 h-3 mt-2 sm:mt-0" indicatorClassName="bg-primary"/>
                </div>

                {adherenceData.patients.length > 0 ? (
                    <div className="max-h-60 overflow-y-auto border rounded-md">
                        <Table>
                            <TableHeader className="sticky top-0 bg-card z-10">
                                <TableRow>
                                    <TableHead>Patient</TableHead>
                                    <TableHead className="text-right">Statut Séance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {adherenceData.patients.map((patient) => (
                                    <TableRow key={patient.id} className="hover:bg-muted/30">
                                        <TableCell>
                                            <Link href={`/dashboard/kine/patients/sim-patient-${(Math.abs(patient.id.hashCode()) % 3) + 1}`} className="flex items-center gap-3 group hover:text-primary transition-colors">
                                                <Avatar className="h-8 w-8 border group-hover:border-primary">
                                                    <AvatarFallback className="text-xs bg-secondary text-secondary-foreground group-hover:bg-primary/10">
                                                        {getInitials(patient.name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{patient.name}</span>
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {patient.completed ? (
                                                <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                                                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Validée
                                                </Badge>
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
                    <p className="text-muted-foreground text-center py-4 italic">Aucun patient avec séance prévue pour le {format(selectedDate, 'dd/MM/yyyy')}.</p>
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

String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
};