

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Play, Check, TrendingUp, ArrowRight, Info, Dumbbell, Clock } from 'lucide-react'; // Added icons
import type { Program, Feedback, ExerciseInProgram } from '@/types/program';
import { getExampleExercises } from '@/services/exercise-library';
import { useToast } from '@/hooks/use-toast';
import ProgramHeader from '@/components/patient/ProgramHeader';
import ChatbotTeaser from '@/components/patient/ChatbotTeaser';
import ExerciseSessionView from '@/components/patient/ExerciseSessionView'; // Updated Import
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import Image from 'next/image';
// Removed Badge import as it's not used directly here
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils'; // Import cn for conditional classes
import { Progress } from '@/components/ui/progress'; // Import Progress


// Simulate a more complete program
const getSimulatedProgram = (): Program => {
    const exampleExercises = getExampleExercises();
    const patientId = 'sim-patient-id';
    return {
        id: 'simulated-program-1',
        id_kine: 'sim-kine-id',
        id_patient: patientId,
        objective: 'Renforcement général post-confinement',
        longTermObjective: 'Reprendre la course à pied sans douleur',
        difficultyLevel: 'beginner',
        availableEquipment: 'Poids du corps, bandes élastiques',
        duration: '4 semaines',
        createdAt: new Date(Date.now() - 86400000 * 3),
        content: exampleExercises.slice(0, 3).map((ex, index) => ({
            id: `${patientId}-${Date.now()}-sim-${index}`,
            title: ex.title,
            description: index === 0
                ? "- Tenez-vous droit, pieds écartés largeur épaules.\n- Haltères en main, paumes vers l'avant.\n- Gardez les coudes près du corps.\n- Montez les haltères vers les épaules en contractant les biceps.\n- Redescendez lentement."
                : index === 1
                ? "- Debout, pieds largeur épaules, pointes légèrement vers l'extérieur.\n- Descendez les hanches comme pour vous asseoir.\n- Dos droit, poitrine haute.\n- Genoux alignés avec les pieds, ne dépassant pas les orteils.\n- Poussez sur les talons pour remonter."
                : "- Position pompe, mais sur les avant-bras.\n- Corps droit de la tête aux talons.\n- Contractez les abdominaux et les fessiers.\n- Maintenez la position sans creuser le dos.",
            frequency: '3 fois par semaine',
            repetitions: index === 0 ? '3 sets of 12 repetitions' : index === 1 ? '4 sets of 10 repetitions' : '4 sets of 30 seconds hold',
            restTime: index === 0 ? '60 seconds' : index === 1 ? '90 seconds' : '45 seconds',
            illustrationUrl: ex.illustrationUrl,
            requiredEquipment: ex.requiredEquipment || [],
            targetMuscles: ex.targetMuscles || [],
        })),
    };
};

// --- Simulated Feedback Data for Chart ---
const simulatedFeedbackData: Omit<Feedback, 'id' | 'id_kine' | 'id_programme' | 'id_patient'>[] = [
    { id_exercise: 'sim-exercise-1', date: new Date(Date.now() - 86400000 * 7), painLevel: 5, difficultyLevel: 6, comment: 'Difficile au début' },
    { id_exercise: 'sim-exercise-2', date: new Date(Date.now() - 86400000 * 6), painLevel: 4, difficultyLevel: 5 },
    { id_exercise: 'sim-exercise-1', date: new Date(Date.now() - 86400000 * 5), painLevel: 4, difficultyLevel: 4, comment: 'Un peu mieux' },
    { id_exercise: 'sim-exercise-3', date: new Date(Date.now() - 86400000 * 4), painLevel: 3, difficultyLevel: 5 },
    { id_exercise: 'sim-exercise-1', date: new Date(Date.now() - 86400000 * 3), painLevel: 2, difficultyLevel: 3, comment: 'Ca progresse bien !' },
    { id_exercise: 'sim-exercise-2', date: new Date(Date.now() - 86400000 * 2), painLevel: 2, difficultyLevel: 4 },
    { id_exercise: 'sim-exercise-3', date: new Date(Date.now() - 86400000 * 1), painLevel: 1, difficultyLevel: 3, comment: 'Presque plus de douleur' },
].sort((a, b) => a.date.getTime() - b.date.getTime());

const chartData = simulatedFeedbackData.map(fb => ({
  date: format(fb.date, 'dd/MM'),
  Douleur: fb.painLevel,
  Difficulté: fb.difficultyLevel,
}));

const chartConfig = {
  Douleur: { label: "Douleur (0-10)", color: "hsl(var(--destructive))" },
  Difficulté: { label: "Difficulté (0-10)", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

// Helper to format description with bullet points
const formatDescriptionForPopup = (description: string): React.ReactNode[] => {
    return description.split('\n').map((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
            return <li key={index} className="mb-1">{trimmedLine.substring(1).trim()}</li>;
        } else if (trimmedLine) {
            return <li key={index} className="mb-1">{trimmedLine}</li>; // Treat non-bullet lines as list items too
        }
        return null;
    }).filter(Boolean);
};

// Helper to parse repetitions string - Moved here
const parseRepetitions = (repsString: string): { sets: number, reps: string | number, isTimeBased: boolean } => {
    const setsMatch = repsString.match(/(\d+)\s*sets?/i);
    const repsMatch = repsString.match(/of\s*([\d-]+)\s*rep/i);
    const timeMatch = repsString.match(/(\d+)\s*(seconds?|sec|s)\s*hold/i);
    let sets = setsMatch ? parseInt(setsMatch[1], 10) : 1;
    let reps: string | number = repsMatch ? repsMatch[1] : 'N/A';
    let isTimeBased = false;
    if (timeMatch) {
        reps = parseInt(timeMatch[1], 10);
        isTimeBased = true;
        if (!setsMatch) {
            const setsTimeMatch = repsString.match(/(\d+)\s*times?/i);
            if (setsTimeMatch) sets = parseInt(setsTimeMatch[1], 10);
        }
    }
    // Default to 1 set if parsing fails to find sets explicitly
    if (sets <= 0) sets = 1;
    return { sets, reps, isTimeBased };
};

// --- Page Component ---

export default function PatientHomePage() {
  const { toast } = useToast();
  const [program, setProgram] = useState<Program | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<Feedback[]>([]);
  const [exerciseCompletion, setExerciseCompletion] = useState<{ [key: string]: number }>({}); // Track completed sets per exercise { exerciseId: completedSets }

  const currentDate = new Date();

  const loadProgram = useCallback(async () => {
    setProgramLoading(true);
    setError(null);
    setSessionActive(false);
    setCurrentExerciseIndex(0);
    setIsSessionComplete(false);
    setFeedbackHistory([]);
    setExerciseCompletion({}); // Reset completion status

    await new Promise(resolve => setTimeout(resolve, 800));

    try {
       const loadedProgram = getSimulatedProgram();
       setProgram(loadedProgram);
       const initialCompletion: { [key: string]: number } = {};
        if (loadedProgram?.content) {
            loadedProgram.content.forEach(ex => {
                if (ex.id) initialCompletion[ex.id] = 0;
            });
        }
       setExerciseCompletion(initialCompletion);

      // Load feedback history
      setFeedbackHistory(simulatedFeedbackData.map((fb, index) => ({
          ...fb,
          id: `fb-hist-${index}`,
          id_programme: 'simulated-program-1',
          id_patient: 'sim-patient-id',
          id_kine: 'sim-kine-id',
      })));
    } catch (err) {
      console.error("Erreur simulation programme:", err);
      setError("Impossible de charger votre programme d'exercices simulé.");
    } finally {
      setProgramLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgram();
  }, [loadProgram]);

  const handleStartSession = (startIndex = 0) => { // Allow starting from a specific index
    if (program && program.content.length > 0) {
      setSessionActive(true);
      setIsSessionComplete(false);
      setCurrentExerciseIndex(startIndex);
      // Reset completion for the current session (optional, maybe persist progress?)
      // const resetCompletion: { [key: string]: number } = {};
      // program.content.forEach(ex => {
      //     if (ex.id) resetCompletion[ex.id] = 0;
      // });
      // setExerciseCompletion(resetCompletion);
    } else {
      toast({ variant: "destructive", title: "Erreur", description: "Aucun exercice trouvé dans le programme." });
    }
  };

  const handleNextExercise = () => {
    if (program && currentExerciseIndex < program.content.length - 1) {
      setCurrentExerciseIndex(prevIndex => prevIndex + 1);
    } else {
      setSessionActive(false);
      setIsSessionComplete(true);
      toast({ title: "Séance terminée !", description: "Bravo ! Vous avez terminé votre séance.", duration: 5000 });
    }
  };

  const handlePreviousExercise = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(prevIndex => prevIndex - 1);
    }
  };

  const handleStopSession = () => {
      setSessionActive(false);
      setIsSessionComplete(false);
      // Resetting index might be confusing if user wants to resume
      // setCurrentExerciseIndex(0);
      toast({ title: "Séance arrêtée", description: "Vous pouvez reprendre plus tard.", variant: "default"});
  }

  const handleExerciseFeedback = (feedbackData: Omit<Feedback, 'id' | 'id_kine' | 'id_programme' | 'id_patient'> & { completedSets: number }) => {
    const { completedSets, ...restFeedbackData } = feedbackData;
    if (!program?.id || !program?.id_kine || !program?.id_patient || !feedbackData.id_exercise) {
      console.error("Missing details for feedback submission", { program, feedbackData });
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de lier le feedback." });
      return;
    }
    const fullFeedback: Feedback = {
      ...restFeedbackData,
      id: `fb-${Date.now()}`,
      id_programme: program.id,
      id_kine: program.id_kine,
      id_patient: program.id_patient,
    };
    console.log("Simulating feedback save:", fullFeedback);

    // Update exercise completion status
     if (feedbackData.id_exercise) {
       setExerciseCompletion(prev => ({
           ...prev,
           [feedbackData.id_exercise!]: completedSets
       }));
     }

    setFeedbackHistory(prev => [...prev, fullFeedback]);
    handleNextExercise();
  };

  // Update chart data when feedbackHistory changes
  const currentChartData = feedbackHistory.map(fb => ({
     date: format(fb.date, 'dd/MM'),
     Douleur: fb.painLevel,
     Difficulté: fb.difficultyLevel,
   })).sort((a, b) => {
     // Simple date sorting based on dd/MM string for this year
     const [dayA, monthA] = a.date.split('/').map(Number);
     const [dayB, monthB] = b.date.split('/').map(Number);
     const dateA = new Date(currentDate.getFullYear(), monthA - 1, dayA); // Use current year
     const dateB = new Date(currentDate.getFullYear(), monthB - 1, dayB);
     return dateA.getTime() - dateB.getTime();
   });

  // --- Render Logic ---

  if (programLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center p-10 min-h-[calc(100vh-150px)]">
          <Loader2 className="h-12 w-12 animate-spin text-accent" />
          <p className="ml-3 text-muted-foreground mt-4">Chargement de votre programme...</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <Card className="bg-destructive/10 border-destructive max-w-lg mx-auto mt-10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle size={20} /> Erreur de Chargement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
            <Button variant="destructive" size="sm" className="mt-4" onClick={loadProgram}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  // Session View
  if (sessionActive && program && program.content.length > 0) {
    const currentExercise = program.content[currentExerciseIndex];
    return (
        <AppLayout>
           <ExerciseSessionView
               exercise={currentExercise}
               programContent={program.content}
               currentExerciseIndex={currentExerciseIndex}
               totalExercises={program.content.length}
               onNext={handleNextExercise}
               onPrevious={handlePreviousExercise}
               onSubmitFeedback={handleExerciseFeedback}
               onStopSession={handleStopSession}
              //  initialCompletedSets={exerciseCompletion[currentExercise.id || ''] || 0} // Pass initial completed sets
               exerciseCompletion={exerciseCompletion} // Pass full completion map for progress bar
           />
        </AppLayout>
    );
  }

  // Main Dashboard View (Not in session)
  return (
    <AppLayout>
      <div className="space-y-6 md:space-y-8 pb-10">
        <ProgramHeader currentDate={currentDate} longTermObjective={program?.longTermObjective} />

        <ChatbotTeaser />

         {program && program.content.length > 0 && (
           <>
              <Separator className="my-6 md:my-8 bg-border/50" />
                {/* Program Overview Card */}
                <Card className="shadow-md border-border bg-card/80 backdrop-blur-sm">
                   <CardHeader>
                     <CardTitle className="text-xl md:text-2xl font-semibold text-primary">Votre Séance du Jour</CardTitle>
                     <CardDescription>
                        Programme : {program.objective} (<span className="capitalize">{program.difficultyLevel}</span>) - {program.content.length} exercices
                     </CardDescription>
                   </CardHeader>
                   <CardContent>
                     {/* Display Exercise List */}
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                       {program.content.map((ex, index) => {
                         const completedSets = exerciseCompletion[ex.id || ''] || 0;
                         const repsInfo = parseRepetitions(ex.repetitions);
                         const totalSets = repsInfo.sets;
                         const isCompleted = completedSets >= totalSets;

                         return (
                         <Card
                              key={ex.id || index}
                              className={cn(
                                 "flex flex-col overflow-hidden hover:shadow-lg transition-shadow duration-200 border-border cursor-pointer", // Add cursor-pointer
                                 isCompleted && "opacity-60 border-green-500 bg-green-500/5" // Style for completed
                              )}
                              onClick={() => handleStartSession(index)} // Start session at this exercise
                           >
                           <div className="relative h-40 w-full">
                                <Image
                                    src={ex.illustrationUrl || `https://picsum.photos/seed/${encodeURIComponent(ex.title)}/400/300`}
                                    alt={`Illustration: ${ex.title}`}
                                    fill
                                    sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 30vw"
                                    style={{ objectFit: 'cover' }}
                                    className="bg-muted"
                                    data-ai-hint={`${ex.targetMuscles?.join(' ') || ''} exercise workout physiotherapy`}
                                />
                                {isCompleted && (
                                   <div className="absolute inset-0 bg-green-900/50 flex items-center justify-center">
                                     <Check className="h-12 w-12 text-white" />
                                   </div>
                                )}
                           </div>
                            <CardHeader className="p-3 flex-grow">
                                <CardTitle className="text-base font-medium line-clamp-2">{ex.title}</CardTitle>
                                <CardDescription asChild>
                                    <div className="text-xs mt-1 space-y-1">
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Dumbbell size={12}/>
                                            <span>{ex.requiredEquipment?.join(', ') || 'Poids du corps'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Clock size={12}/>
                                            <span>{ex.repetitions}{ex.restTime && ` | Repos: ${ex.restTime}`}</span>
                                        </div>
                                        {/* Mini Progress Bar for Sets */}
                                        <div className="pt-1">
                                           <Progress
                                               max={totalSets}
                                               value={completedSets}
                                               className="w-full h-1 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                                            />
                                        </div>
                                    </div>
                                </CardDescription>
                            </CardHeader>
                            <CardFooter className="p-3 border-t">
                                 <Dialog>
                                    <DialogTrigger asChild>
                                         {/* Move onClick handler to the Button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-accent hover:text-accent/80 p-0 h-auto flex items-center gap-1"
                                            onClick={(e) => e.stopPropagation()} // Stop propagation to prevent card click
                                        >
                                           <Info size={14}/> Instructions
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md">
                                        <DialogHeader>
                                            <DialogTitle>{ex.title}</DialogTitle>
                                            <DialogDescription>
                                                {ex.repetitions}{ex.restTime && ` | Repos: ${ex.restTime}`}
                                            </DialogDescription>
                                        </DialogHeader>
                                         <ScrollArea className="max-h-[60vh] mt-4 pr-4">
                                            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground marker:text-accent">
                                                {formatDescriptionForPopup(ex.description)}
                                            </ul>
                                         </ScrollArea>
                                    </DialogContent>
                                 </Dialog>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto text-primary hover:text-primary/80 p-0 h-auto flex items-center gap-1"
                                    onClick={(e) => { e.stopPropagation(); handleStartSession(index); }} // Stop propagation
                                >
                                   <Play size={14}/> {isCompleted ? 'Refaire' : 'Démarrer'}
                                </Button>
                            </CardFooter>
                         </Card>
                       )})}
                     </div>
                   </CardContent>
                   <CardFooter className="border-t pt-4">
                      <Button onClick={() => handleStartSession(0)} size="lg" className="w-full md:w-auto ml-auto bg-accent hover:bg-accent/90 text-accent-foreground">
                          <Play className="mr-2 h-5 w-5" /> Démarrer la Séance Complète
                      </Button>
                   </CardFooter>
                 </Card>

                 {isSessionComplete && (
                     <Card className="shadow-md border-green-500 bg-green-500/10 mt-6">
                         <CardHeader>
                             <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2"><Check className="h-6 w-6"/> Séance Terminée !</CardTitle>
                             <CardDescription className="text-sm text-green-600 dark:text-green-500">
                                Félicitations ! Vous pouvez démarrer une nouvelle séance ou consulter votre progression.
                             </CardDescription>
                         </CardHeader>
                         <CardFooter>
                              <Button onClick={() => handleStartSession(0)} size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-500/20">
                                  Refaire la séance
                              </Button>
                         </CardFooter>
                     </Card>
                 )}

             {/* Progression Tracking Chart */}
             <div className="mt-10">
                 <Card className="shadow-md border-border bg-card/80 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-primary">
                           <TrendingUp className="text-accent"/> Suivi de Progression
                        </CardTitle>
                        <CardDescription>
                            Evolution de votre douleur et difficulté ressenties.
                        </CardDescription>
                    </CardHeader>
                     <CardContent>
                         {currentChartData.length > 1 ? (
                             <ChartContainer config={chartConfig} className="h-[250px] w-full">
                               <LineChart data={currentChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                 <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                                 <XAxis
                                     dataKey="date"
                                     tickLine={false}
                                     axisLine={false}
                                     tickMargin={8}
                                     tickFormatter={(value) => value}
                                     style={{ fontSize: '0.75rem' }}
                                     />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    domain={[0, 10]}
                                    ticks={[0, 2, 4, 6, 8, 10]}
                                    style={{ fontSize: '0.75rem' }}
                                    />
                                 <ChartTooltip
                                     cursor={false}
                                     content={<ChartTooltipContent indicator="line" />}
                                 />
                                 <ChartLegend content={<ChartLegendContent />} />
                                 <Line dataKey="Douleur" type="monotone" stroke="var(--color-Douleur)" strokeWidth={2} dot={false} />
                                  <Line dataKey="Difficulté" type="monotone" stroke="var(--color-Difficulté)" strokeWidth={2} dot={false} />
                               </LineChart>
                             </ChartContainer>
                         ) : (
                             <p className="text-muted-foreground italic text-center py-6">Données de feedback insuffisantes pour afficher le graphique (besoin d'au moins 2 retours).</p>
                         )}
                     </CardContent>
                 </Card>
             </div>
           </>
         )}

         {!programLoading && !program && (
             <Card className="shadow-md text-center border-border mt-8 bg-card/80 backdrop-blur-sm">
               <CardHeader>
                 <CardTitle>Aucun Programme Assigné</CardTitle>
                 <CardDescription>
                    Votre kinésithérapeute ne vous a pas encore assigné de programme.
                 </CardDescription>
               </CardHeader>
             </Card>
         )}
      </div>
    </AppLayout>
  );
}

    