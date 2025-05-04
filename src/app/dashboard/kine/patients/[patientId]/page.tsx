'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, ArrowLeft, MessageCircle, BarChart2, PlusCircle, AlertCircle, Wand2 } from 'lucide-react'; // Added Wand2
import type { UserProfileData } from '@/types/user';
import type { Feedback } from '@/types/feedback';
import type { Program } from '@/types/program';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Keep AvatarImage
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Simulate patient data for detail view (Ensure photoURL is present)
const simulatedPatients: { [key: string]: UserProfileData } = {
    'sim-patient-1': { id: 'sim-patient-1', name: 'Alice Martin', email: 'alice.m@email.com', role: 'patient', linkedKine: 'sim-kine-id', photoURL: 'https://picsum.photos/seed/alice/100' },
    'sim-patient-2': { id: 'sim-patient-2', name: 'Bob Dubois', email: 'bob.d@email.com', role: 'patient', linkedKine: 'sim-kine-id', photoURL: 'https://picsum.photos/seed/bob/100' },
    'sim-patient-3': { id: 'sim-patient-3', name: 'Charlie Petit', email: 'charlie.p@email.com', role: 'patient', linkedKine: 'sim-kine-id', photoURL: 'https://picsum.photos/seed/charlie/100' },
};

// Simulate feedback data
const simulatedFeedbacks: { [key: string]: Feedback[] } = {
    'sim-patient-1': [
        { id: 'fb1-1', id_programme: 'prog1', id_patient: 'sim-patient-1', id_kine: 'sim-kine-id', date: new Date(Date.now() - 86400000), painLevel: 3, difficultyLevel: 4, comment: 'Bonne séance, un peu de difficulté sur les fentes.', id_exercise: 'ex1' },
        { id: 'fb1-2', id_programme: 'prog1', id_patient: 'sim-patient-1', id_kine: 'sim-kine-id', date: new Date(Date.now() - 86400000 * 3), painLevel: 2, difficultyLevel: 3, comment: 'Ça va mieux !', id_exercise: 'ex2' },
    ],
    'sim-patient-2': [
        { id: 'fb2-1', id_programme: 'prog2', id_patient: 'sim-patient-2', id_kine: 'sim-kine-id', date: new Date(Date.now() - 86400000 * 2), painLevel: 6, difficultyLevel: 7, comment: 'Très fatigué après la séance.', id_exercise: 'ex3' },
    ],
    'sim-patient-3': [], // No feedback yet
};

// Simulate program data
const simulatedPrograms: { [key: string]: Program[] } = {
     'sim-patient-1': [
        { id: 'prog1', id_kine: 'sim-kine-id', id_patient: 'sim-patient-1', objective: 'Renforcement genou', difficultyLevel: 'intermediate', availableEquipment: 'Bandes élastiques', duration: '6 semaines', createdAt: new Date(Date.now() - 86400000 * 7), content: [{id: 'ex1', title: 'Leg Press (Bande)', description: '...', frequency: '3/sem', repetitions: '3x15' }, { id: 'ex2', title: 'Squat (Bande)', description: '...', frequency: '3/sem', repetitions: '3x12'}] },
     ],
     'sim-patient-2': [
        { id: 'prog2', id_kine: 'sim-kine-id', id_patient: 'sim-patient-2', objective: 'Mobilisation épaule', difficultyLevel: 'beginner', availableEquipment: 'Poids du corps', duration: '4 semaines', createdAt: new Date(Date.now() - 86400000 * 5), content: [{id: 'ex3', title: 'Pendule épaule', description: '...', frequency: '5/sem', repetitions: '3x20' }] },
     ],
     'sim-patient-3': [], // No program yet
};


const getInitials = (name?: string): string => {
  if (!name) return '??';
  const names = name.split(' ');
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

const getPainLevelBadgeVariant = (level: number): "default" | "secondary" | "destructive" | "outline" => {
    if (level >= 7) return "destructive";
    if (level >= 4) return "secondary";
    return "default";
};
const getDifficultyLevelBadgeVariant = (level: number): "default" | "secondary" | "destructive" | "outline" => {
     if (level >= 7) return "destructive";
     if (level >= 4) return "secondary";
     return "default";
};

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.patientId as string;

  const [patientData, setPatientData] = useState<UserProfileData | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
     setLoading(true);
     setError(null);

     await new Promise(resolve => setTimeout(resolve, 700));

     try {
       const fetchedPatient = simulatedPatients[patientId];
       const fetchedFeedbacks = simulatedFeedbacks[patientId] || [];
       const fetchedPrograms = simulatedPrograms[patientId] || [];

       if (!fetchedPatient) {
         setError("Patient simulé non trouvé.");
         setPatientData(null);
         setFeedbacks([]);
         setPrograms([]);
       } else {
         setPatientData(fetchedPatient);
         setFeedbacks(fetchedFeedbacks.sort((a, b) => b.date.getTime() - a.date.getTime())); // Sort by date desc
         setPrograms(fetchedPrograms.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())); // Sort by date desc
       }

     } catch (err) {
       console.error("Erreur lors de la simulation:", err);
       setError("Impossible de charger les détails simulés du patient.");
       setPatientData(null);
       setFeedbacks([]);
       setPrograms([]);
     } finally {
       setLoading(false);
     }
   }, [patientId]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);


  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-accent" />
        </div>
      </AppLayout>
    );
  }

   if (error) {
      return (
          <AppLayout>
               <Button variant="outline" onClick={() => router.push('/dashboard/kine/patients')} className="mb-4">
                   <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux Patients
               </Button>
               <Card className="bg-destructive/10 border-destructive">
                   <CardHeader>
                       <CardTitle className="flex items-center gap-2 text-destructive">
                           <AlertCircle size={20} /> Erreur de chargement
                       </CardTitle>
                   </CardHeader>
                   <CardContent>
                       <p className="text-destructive">{error}</p>
                   </CardContent>
               </Card>
          </AppLayout>
      );
    }

  if (!patientData) {
     return (
        <AppLayout>
             <Button variant="outline" onClick={() => router.push('/dashboard/kine/patients')} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux Patients
             </Button>
             <p className="text-center text-muted-foreground">Patient non trouvé.</p>
        </AppLayout>
     );
  }

  const latestProgram = programs.length > 0 ? programs[0] : null;


  return (
    <AppLayout>
      <div className="space-y-8">
         <Button variant="outline" onClick={() => router.push('/dashboard/kine/patients')}>
           <ArrowLeft className="mr-2 h-4 w-4" /> Retour à la liste des patients
         </Button>

        {/* Patient Info Card */}
        <Card className="shadow-lg overflow-hidden">
             <CardHeader className="bg-gradient-to-r from-primary/10 via-secondary/10 to-background p-6">
                <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-primary">
                        {patientData.photoURL ? (
                           <AvatarImage src={patientData.photoURL} alt={`${patientData.name} avatar`} data-ai-hint="user profile picture" />
                        ) : (
                           <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                             {getInitials(patientData.name)}
                           </AvatarFallback>
                        )}
                    </Avatar>
                    <div>
                         <CardTitle className="text-2xl text-primary">{patientData.name}</CardTitle>
                         <CardDescription className="text-muted-foreground">{patientData.email}</CardDescription>
                    </div>
                </div>
            </CardHeader>
           <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <h3 className="font-semibold mb-2 text-lg">Programme le Plus Récent</h3>
                 {latestProgram ? (
                    <div className="space-y-1 text-sm">
                        <p><strong>Objectif :</strong> {latestProgram.objective}</p>
                        <p><strong>Niveau :</strong> <span className="capitalize">{latestProgram.difficultyLevel}</span></p>
                        {latestProgram.createdAt && (
                            <p><strong>Assigné le :</strong> {format(latestProgram.createdAt, 'PPP', { locale: fr })}</p>
                        )}
                        {/* Link to view/edit the specific program instance if needed later */}
                        {/* <Button variant="link" size="sm" asChild className="p-0 h-auto text-accent">
                           <Link href={`/dashboard/kine/programs/${latestProgram.id}`}>Voir/Modifier Programme</Link>
                        </Button> */}
                    </div>
                 ) : (
                    <p className="text-muted-foreground italic">Aucun programme assigné pour le moment.</p>
                 )}
              </div>
              <div className="flex flex-col justify-between items-start md:items-end space-y-2">
                 {/* Button to go back to the patients list page to generate a new program */}
                 <Button asChild className="w-full md:w-auto bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Link href="/dashboard/kine/patients"> {/* Link back to the list page */}
                       <Wand2 className="mr-2 h-4 w-4" /> Créer Nouveau Programme
                    </Link>
                 </Button>
                  {/* Placeholder for future actions */}
                 <Button variant="outline" disabled className="w-full md:w-auto opacity-50">
                    <MessageCircle className="mr-2 h-4 w-4" /> Envoyer Message (Bientôt)
                 </Button>
              </div>
           </CardContent>
        </Card>

        {/* Recent Feedback Card */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <BarChart2 className="text-accent" /> Feedbacks Récents
            </CardTitle>
            <CardDescription>Derniers feedbacks soumis par {patientData.name}.</CardDescription>
          </CardHeader>
          <CardContent>
            {feedbacks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Douleur</TableHead>
                    <TableHead>Difficulté</TableHead> {/* Changed from Fatigue */}
                    <TableHead>Commentaire</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedbacks.map((fb) => (
                    <TableRow key={fb.id}>
                      <TableCell className="whitespace-nowrap">{format(fb.date, 'Pp', { locale: fr })}</TableCell>
                      <TableCell>
                        <Badge variant={getPainLevelBadgeVariant(fb.painLevel)}>{fb.painLevel}/10</Badge>
                      </TableCell>
                      <TableCell>
                         <Badge variant={getDifficultyLevelBadgeVariant(fb.difficultyLevel)}>{fb.difficultyLevel}/10</Badge> {/* Changed from fatigueLevel */}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground">{fb.comment || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-6">Aucun feedback soumis pour le moment.</p>
            )}
          </CardContent>
           <CardFooter>
                {/* Link to a future dedicated feedback/analytics page for this patient */}
                <Button variant="outline" disabled className="ml-auto opacity-50">
                    Voir tous les feedbacks & Stats (Bientôt)
                </Button>
           </CardFooter>
        </Card>

         {/* Placeholder for Detailed Analytics */}
        <Card className="shadow-md opacity-50">
           <CardHeader>
             <CardTitle>Statistiques Détaillées Patient (Bientôt)</CardTitle>
             <CardDescription>Visualisez les tendances des feedbacks et l'adhésion au programme.</CardDescription>
           </CardHeader>
           <CardContent>
             <p className="text-muted-foreground italic text-center py-6">Graphiques et statistiques détaillées apparaîtront ici.</p>
           </CardContent>
         </Card>

      </div>
    </AppLayout>
  );
}
