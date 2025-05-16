// src/components/patient/ExerciseSessionView.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Play, Check, RefreshCcw, Timer, Volume2, VolumeX, XSquare, Dumbbell, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ExerciseInProgram, Feedback } from '@/types/program';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area'; // Import ScrollArea

interface ExerciseSessionViewProps {
    exercise: ExerciseInProgram;
    programContent: ExerciseInProgram[]; // Full program content for progress bar
    currentExerciseIndex: number;
    totalExercises: number;
    onNext: () => void;
    onPrevious: () => void;
    onSubmitFeedback: (feedback: Omit<Feedback, 'id' | 'id_kine' | 'id_programme' | 'id_patient'> & { completedSets: number }) => void; // Pass completed sets back
    onStopSession: () => void;
    exerciseCompletion: { [key: string]: number }; // Map of exerciseId to completed sets
}


type ExercisePhase = 'initial' | 'active' | 'resting' | 'feedback';

// Helper Functions (copied and adapted from PatientHomePage)
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

const parseRestTime = (restString?: string): number => {
    if (!restString) return 0;
    const secondsMatch = restString.match(/(\d+)\s*(seconds?|sec|s)/i);
    const minutesMatch = restString.match(/(\d+)\s*(minutes?|min)/i);
    if (minutesMatch) return parseInt(minutesMatch[1], 10) * 60;
    if (secondsMatch) return parseInt(secondsMatch[1], 10);
    return 0;
};

const formatDescription = (description: string): React.ReactNode[] => {
    return description.split('\n').map((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
            return <li key={index} className="mb-1">{trimmedLine.substring(1).trim()}</li>;
        } else if (trimmedLine) {
            // Allow non-bullet points to appear as well, styled consistently if needed
            return <li key={index} className="mb-1 list-none">{trimmedLine}</li>;
        }
        return null;
    }).filter(Boolean);
};

const motivationalPhrases = ["C'est parti !", "À vous de jouer !", "Donnez tout !", "Concentration !", "Vous pouvez le faire !"];
const getRandomPhrase = () => motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];

// --- ExerciseSessionView Component ---

const ExerciseSessionView: React.FC<ExerciseSessionViewProps> = ({
    exercise,
    programContent, // Receive full program content
    currentExerciseIndex,
    totalExercises,
    onNext,
    onPrevious,
    onSubmitFeedback,
    onStopSession,
    exerciseCompletion, // Receive full completion map
}) => {
    const { toast } = useToast();
    const [phase, setPhase] = useState<ExercisePhase>('initial');
    const [currentSet, setCurrentSet] = useState(1);
    const [restTimer, setRestTimer] = useState(0);
    const [activeTimer, setActiveTimer] = useState(0);
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [painLevel, setPainLevel] = useState(3);
    const [difficultyLevel, setDifficultyLevel] = useState(3);
    const [comment, setComment] = useState('');
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [isMuted, setIsMuted] = useState(true); // Muted by default
    // Use initial completed sets from the map, defaulting to 0
    const [completedSets, setCompletedSets] = useState<number>(exerciseCompletion[exercise.id || ''] || 0);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false); // State for instruction dialog


    const repsInfo = parseRepetitions(exercise.repetitions);
    const totalSets = repsInfo.sets;
    const restDuration = parseRestTime(exercise.restTime);
    const activeDuration = repsInfo.isTimeBased ? repsInfo.reps as number : 0;

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Reset state when exercise changes, using completion from map
    useEffect(() => {
        setPhase('initial');
        setCurrentSet(1);
        setCompletedSets(exerciseCompletion[exercise.id || ''] || 0); // Use map value
        setRestTimer(0);
        setActiveTimer(0);
        setIsFeedbackDialogOpen(false);
        setIsInfoDialogOpen(false); // Close info dialog on exercise change
        setPainLevel(3);
        setDifficultyLevel(3);
        setComment('');
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, [exercise, exerciseCompletion]); // Depend on exerciseCompletion

    // Preload audio effect
    useEffect(() => {
        // Simple beep sound for transitions
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'+Array(1e3).join('123'));
        audio.load();
        audioRef.current = audio;

        return () => {
             audioRef.current?.pause();
             audioRef.current = null;
        }
    }, []);

    const playSound = () => {
        if (!isMuted && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.error("Error playing sound:", e));
        }
    };

    // Timer logic
    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        if (phase === 'resting' && restTimer > 0) {
            intervalRef.current = setInterval(() => setRestTimer(prev => Math.max(0, prev - 1)), 1000);
        } else if (phase === 'active' && repsInfo.isTimeBased && activeTimer > 0) {
            intervalRef.current = setInterval(() => setActiveTimer(prev => Math.max(0, prev - 1)), 1000);
        }

        // Handle timer completion
        if (phase === 'resting' && restTimer <= 0 && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            playSound();
            if (currentSet < totalSets) {
                setCurrentSet(prev => prev + 1);
                setPhase('active');
                if (repsInfo.isTimeBased) setActiveTimer(activeDuration);
            } else {
                setPhase('feedback');
                 setIsFeedbackDialogOpen(true);
            }
        } else if (phase === 'active' && repsInfo.isTimeBased && activeTimer <= 0 && intervalRef.current) {
            clearInterval(intervalRef.current);
             intervalRef.current = null;
            playSound();
            handleCompleteSetOrHold();
        }

        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [phase, restTimer, activeTimer, currentSet, totalSets, repsInfo.isTimeBased, activeDuration, isMuted]); // Added dependencies


    const handleStartExercise = () => {
        setPhase('active');
        setCurrentSet(1);
        if (repsInfo.isTimeBased) {
            setActiveTimer(activeDuration);
        }
    };

    const handleCompleteSetOrHold = () => {
        const newCompletedSets = currentSet; // The set being completed is `currentSet`
        setCompletedSets(newCompletedSets); // Update local state
        playSound(); // Sound on completion

        if (currentSet < totalSets) {
            if (restDuration > 0) {
                setPhase('resting');
                setRestTimer(restDuration);
            } else {
                // If no rest, immediately start next set
                setCurrentSet(prev => prev + 1);
                setPhase('active');
                if (repsInfo.isTimeBased) setActiveTimer(activeDuration);
            }
        } else {
            setPhase('feedback');
            setIsFeedbackDialogOpen(true);
        }
    };

    const handleSkipRest = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
         intervalRef.current = null;
        setRestTimer(0);
         playSound(); // Sound on skip
        if (currentSet < totalSets) {
            setCurrentSet(prev => prev + 1);
            setPhase('active');
            if (repsInfo.isTimeBased) setActiveTimer(activeDuration);
        } else {
            // Should not be possible to skip rest if it's the last set, but handle anyway
            setPhase('feedback');
            setIsFeedbackDialogOpen(true);
        }
    };

    const handleFeedbackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!exercise?.id) return;

        setSubmittingFeedback(true);
        await new Promise(resolve => setTimeout(resolve, 500)); // Shorter delay

        try {
            const feedbackData: Omit<Feedback, 'id' | 'id_kine' | 'id_programme' | 'id_patient'> & { completedSets: number } = {
                id_exercise: exercise.id,
                date: new Date(),
                painLevel: painLevel,
                difficultyLevel: difficultyLevel,
                comment: comment,
                completedSets: completedSets // Include the number of completed sets
            };
            onSubmitFeedback(feedbackData); // Pass data with completedSets
            toast({ title: "Feedback enregistré", description: "Merci !" });
            setIsFeedbackDialogOpen(false);
            // Parent component (PatientHomePage) now handles calling onNext()
        } catch (err) {
            console.error("Feedback submission error:", err);
            toast({ variant: "destructive", title: "Erreur", description: "Impossible d'enregistrer le feedback." });
        } finally {
            setSubmittingFeedback(false);
        }
    };

    const placeholderUrl = `https://picsum.photos/seed/${encodeURIComponent(exercise.title)}/800/600`;
    const imageUrl = exercise.illustrationUrl || placeholderUrl;
    // Overall program progress (based on index)
    const overallProgressValue = ((currentExerciseIndex + 1) / totalExercises) * 100;
    // Exercise-specific progress (based on completed sets)
    const exerciseProgressValue = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;
    const currentMotivationalPhrase = getRandomPhrase();
    const shortInstruction = exercise.description.split('\n')[0].replace(/^-/, '').trim(); // Get first line as short instruction

    return (
        // Use dark theme explicitly for this view or inherit from ThemeProvider
        <div className="flex flex-col h-screen bg-slate-900 text-gray-100 overflow-hidden">

            {/* Header with Overall Progress and Minimal Controls */}
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-slate-700 bg-slate-800/80 backdrop-blur-sm sticky top-0 z-20">
                {/* Stop Button */}
                 <Button variant="ghost" size="icon" onClick={onStopSession} className="text-red-400 hover:bg-red-400/20 rounded-full w-10 h-10">
                     <XSquare className="h-5 w-5"/>
                     <span className="sr-only">Arrêter la séance</span>
                 </Button>
                 {/* Program Progress Bar */}
                 <div className="flex-1 text-center px-2">
                    <p className="text-xs md:text-sm text-gray-400 truncate mb-1">Progression Totale ({currentExerciseIndex + 1}/{totalExercises})</p>
                    <Progress value={overallProgressValue} className="h-2.5 md:h-3 rounded-full bg-slate-700" indicatorClassName="bg-accent transition-all duration-500 ease-linear" />
                </div>
                {/* Sound Toggle */}
                 <Button variant="ghost" size="icon" onClick={() => setIsMuted(prev => !prev)} className="ml-2 rounded-full w-10 h-10 hover:bg-slate-700">
                     {isMuted ? <VolumeX className="h-5 w-5 text-gray-400"/> : <Volume2 className="h-5 w-5 text-accent"/>}
                     <span className="sr-only">{isMuted ? 'Activer le son' : 'Couper le son'}</span>
                 </Button>
                 {/* Info Button */}
                 <Button variant="ghost" size="icon" onClick={() => setIsInfoDialogOpen(true)} className="ml-1 rounded-full w-10 h-10 hover:bg-slate-700">
                     <Info className="h-5 w-5 text-gray-400"/>
                     <span className="sr-only">Instructions</span>
                 </Button>
            </div>


            {/* Main Content Area - Image Background with Overlay */}
            <div className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden">
                {/* Background Image */}
                <Image
                    src={imageUrl}
                    alt={`Illustration pour ${exercise.title}`}
                    fill
                    sizes="100vw"
                    style={{ objectFit: 'cover' }}
                    priority
                    className="opacity-20 blur-sm" // Dim and blur background
                    data-ai-hint={`${exercise.targetMuscles?.join(' ') || ''} exercise workout physiotherapy`}
                     onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== placeholderUrl) target.src = placeholderUrl;
                      }}
                />

                {/* Content Overlay - Centered */}
                <div className="relative z-10 w-full max-w-3xl text-center space-y-4 md:space-y-6 flex flex-col items-center justify-center flex-grow">

                     {/* Phase-specific Large Display */}
                     <div className="mb-4 md:mb-8 flex-shrink-0">
                         {phase === 'initial' && (
                             <div className="text-center bg-slate-800/50 backdrop-blur-sm p-4 md:p-6 rounded-lg shadow-lg max-h-[60vh]">
                                <h1 className="text-2xl md:text-4xl font-bold text-white leading-tight mb-3 md:mb-4">{exercise.title}</h1>
                                <p className="text-base md:text-lg text-gray-300 mb-3 md:mb-5">{exercise.repetitions}</p>
                                <ScrollArea className="max-h-[30vh] text-left px-3 md:px-4 mb-3 md:mb-5">
                                    <ul className="list-disc list-inside text-sm md:text-base text-gray-200 space-y-1 marker:text-accent">
                                        {formatDescription(exercise.description)}
                                    </ul>
                                </ScrollArea>
                                <p className="text-lg md:text-xl font-semibold text-accent mt-2">Prêt(e) ?</p>
                            </div>
                         )}
                         {(phase === 'active' || phase === 'resting') && (
                             <div className="text-7xl md:text-9xl font-bold text-white tabular-nums">
                                  {phase === 'active' && (
                                     repsInfo.isTimeBased ? (
                                         <div className="flex flex-col items-center justify-center">
                                             <Timer className="h-10 w-10 md:h-14 md:w-14 opacity-80 mb-2"/>
                                             <span>{Math.floor(activeTimer / 60)}:{String(activeTimer % 60).padStart(2, '0')}</span>
                                         </div>
                                     ) : (
                                        <div className="flex flex-col items-center justify-center">
                                           <Dumbbell className="h-10 w-10 md:h-14 md:w-14 opacity-80 mb-2"/>
                                            <span className="block">{repsInfo.reps}<span className="text-2xl md:text-3xl opacity-80 ml-1">réps</span></span>
                                        </div>
                                     )
                                  )}
                                  {phase === 'resting' && (
                                      <div className="flex flex-col items-center justify-center">
                                          <Timer className="h-10 w-10 md:h-14 md:w-14 opacity-80 mb-2"/>
                                          <span>{Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}</span>
                                      </div>
                                  )}
                             </div>
                         )}
                     </div>

                    {/* Exercise Title & Sets Info (Smaller when active/resting) */}
                    {phase !== 'initial' && (
                         <div className="text-center flex-shrink-0">
                             <h2 className="text-2xl md:text-3xl font-semibold text-gray-200 leading-tight">{exercise.title}</h2>
                             <p className="text-base md:text-lg text-gray-400">Série {Math.min(currentSet, totalSets)} / {totalSets}</p>
                         </div>
                     )}

                     {/* Motivational Phrase (only during active phase) */}
                     {phase === 'active' && <p className="text-xl font-semibold text-accent animate-pulse mt-2 flex-shrink-0">{currentMotivationalPhrase}</p>}
                     {phase === 'resting' && <p className="text-xl font-semibold text-blue-400 mt-2 flex-shrink-0">Repos</p>}

                    {/* Spacer */}
                    <div className="flex-grow"></div>

                    {/* Exercise Progress Bar (Sets) */}
                    <div className="w-full max-w-md mb-4 md:mb-6 flex-shrink-0">
                         <p className="text-xs md:text-sm text-gray-400 truncate mb-1 text-center">Progression de l'exercice</p>
                        <Progress value={exerciseProgressValue} className="h-3 md:h-4 rounded-full bg-slate-700" indicatorClassName="bg-primary transition-all duration-500 ease-linear" />
                    </div>

                </div> {/* End Content Overlay */}

            </div> {/* End Main Content Area */}

            {/* Footer Controls */}
            <div className="flex justify-between items-center p-3 md:p-4 border-t border-slate-700 bg-slate-800/80 backdrop-blur-sm sticky bottom-0 z-20">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onPrevious}
                    disabled={currentExerciseIndex === 0 || phase !== 'initial'}
                    className="text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 rounded-full w-12 h-12"
                    aria-label="Exercice précédent"
                >
                    <ChevronLeft className="h-7 w-7" />
                </Button>

                {/* Central Action Button */}
                <div className="flex-1 flex justify-center">
                     {phase === 'initial' && (
                          <Button onClick={handleStartExercise} size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-full px-8 py-3 text-lg shadow-lg w-40">
                              <Play className="mr-2 h-5 w-5" /> Démarrer
                          </Button>
                     )}
                     {phase === 'active' && !repsInfo.isTimeBased && (
                         <Button onClick={handleCompleteSetOrHold} size="lg" className="bg-green-500 hover:bg-green-600 text-white rounded-full px-8 py-3 text-lg shadow-lg w-40">
                             <Check className="mr-2 h-5 w-5" /> Fini
                         </Button>
                     )}
                     {phase === 'resting' && (
                         <Button onClick={handleSkipRest} variant="secondary" size="lg" className="bg-blue-500 hover:bg-blue-600 text-white rounded-full px-8 py-3 text-lg shadow-md w-40">
                             Passer <RefreshCcw className="ml-2 h-5 w-5"/>
                         </Button>
                     )}
                      {phase === 'feedback' && (
                          <Button onClick={() => setIsFeedbackDialogOpen(true)} size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8 py-3 text-lg shadow-lg w-40">
                              Feedback
                          </Button>
                      )}
                </div>


                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onNext}
                    disabled={currentExerciseIndex === totalExercises - 1 || phase !== 'initial'}
                    className="text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 rounded-full w-12 h-12"
                    aria-label="Exercice suivant"
                >
                    <ChevronRight className="h-7 w-7" />
                </Button>
            </div>


            {/* Instruction Dialog */}
             <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                <DialogContent className="sm:max-w-md bg-slate-800 text-gray-100 border-slate-700">
                    <DialogHeader>
                        <DialogTitle>{exercise.title}</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {exercise.repetitions}
                            {exercise.restTime && ` | Repos: ${exercise.restTime}`}
                        </DialogDescription>
                    </DialogHeader>
                     <ScrollArea className="max-h-[60vh] overflow-y-auto mt-4 pr-4 text-sm text-gray-300 space-y-2">
                         <h3 className="font-medium text-gray-100 mb-1">Instructions :</h3>
                         <ul className="list-disc list-inside space-y-1 marker:text-accent">
                             {formatDescription(exercise.description)}
                         </ul>
                         {exercise.requiredEquipment && exercise.requiredEquipment.length > 0 && exercise.requiredEquipment[0].toLowerCase() !== 'bodyweight' && (
                             <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2 text-gray-400">
                                 <Dumbbell size={14} />
                                 <span>Matériel : {exercise.requiredEquipment.join(', ')}</span>
                             </div>
                         )}
                     </ScrollArea>
                    <DialogFooter>
                       <DialogClose asChild>
                            <Button type="button" variant="secondary" className="bg-slate-600 hover:bg-slate-500 text-white">
                                Fermer
                            </Button>
                       </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Feedback Dialog */}
             <Dialog open={isFeedbackDialogOpen} onOpenChange={(open) => { if (!open) setIsFeedbackDialogOpen(false); }}>
                 <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
                     <DialogHeader>
                         <DialogTitle>Feedback pour {exercise.title}</DialogTitle>
                         <DialogDescription>Comment s'est passé cet exercice ?</DialogDescription>
                     </DialogHeader>
                     <form onSubmit={handleFeedbackSubmit} className="space-y-4 pt-4">
                         {/* Pain Slider */}
                         <div className="space-y-2">
                             <Label htmlFor="painLevelFeedback" className="text-base font-medium">Douleur ressentie (0=aucune, 10=max)</Label>
                             <div className="flex items-center gap-3">
                                 <span className="text-xs w-6 text-center">0</span>
                                 <Slider id="painLevelFeedback" min={0} max={10} step={1} value={[painLevel]} onValueChange={(v) => setPainLevel(v[0])} className="flex-1 [&>span:first-child]:h-2 [&>span:first-child]:bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" thumbClassName="h-5 w-5 border-2 border-primary bg-background" trackClassName="h-2"/>
                                 <span className="text-xs w-6 text-center">10</span>
                             </div>
                             <p className="text-center text-xl font-semibold text-primary">{painLevel}</p>
                         </div>
                         {/* Difficulty Slider */}
                         <div className="space-y-2">
                              <Label htmlFor="difficultyLevelFeedback" className="text-base font-medium">Difficulté perçue (0=facile, 10=difficile)</Label>
                              <div className="flex items-center gap-3">
                                 <span className="text-xs w-6 text-center">0</span>
                                 <Slider id="difficultyLevelFeedback" min={0} max={10} step={1} value={[difficultyLevel]} onValueChange={(v) => setDifficultyLevel(v[0])} className="flex-1 [&>span:first-child]:h-2 [&>span:first-child]:bg-gradient-to-r from-blue-400 via-teal-400 to-cyan-500" thumbClassName="h-5 w-5 border-2 border-primary bg-background" trackClassName="h-2"/>
                                 <span className="text-xs w-6 text-center">10</span>
                              </div>
                               <p className="text-center text-xl font-semibold text-primary">{difficultyLevel}</p>
                         </div>
                         {/* Comment */}
                         <div className="space-y-1.5">
                             <Label htmlFor="commentFeedback" className="text-base font-medium">Commentaire (Optionnel)</Label>
                             <Textarea id="commentFeedback" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment vous êtes-vous senti ?" rows={2} className="bg-background focus:ring-accent" />
                         </div>
                         <DialogFooter>
                             <Button type="submit" disabled={submittingFeedback} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                                 {submittingFeedback && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                 Valider et continuer
                             </Button>
                         </DialogFooter>
                     </form>
                 </DialogContent>
             </Dialog>

        </div>
    );
};

export default ExerciseSessionView;
