'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, UserPlus, Eye, Wand2, AlertCircle } from 'lucide-react';
import type { UserProfileData } from '@/types/user';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { generateExerciseProgram } from '@/ai/flows/generate-exercise-program';
import type { GenerateProgramInput, ExerciseInProgram, Program } from '@/types/program';

// Simulate patient data
const simulatedPatients: UserProfileData[] = [
    { id: 'sim-patient-1', name: 'Alice Martin', email: 'alice.m@email.com', role: 'patient', linkedKine: 'sim-kine-id', photoURL: 'https://picsum.photos/seed/alice/100' },
    { id: 'sim-patient-2', name: 'Bob Dubois', email: 'bob.d@email.com', role: 'patient', linkedKine: 'sim-kine-id', photoURL: 'https://picsum.photos/seed/bob/100' },
    { id: 'sim-patient-3', name: 'Charlie Petit', email: 'charlie.p@email.com', role: 'patient', linkedKine: 'sim-kine-id', photoURL: 'https://picsum.photos/seed/charlie/100' },
];
const simulatedPatientsMap: { [key: string]: UserProfileData } = simulatedPatients.reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
}, {} as { [key: string]: UserProfileData });


const getInitials = (name?: string): string => {
  if (!name) return '??';
  const names = name.split(' ');
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

type ProgramCreationInput = Omit<GenerateProgramInput, 'patientId'>;

export default function KinePatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<UserProfileData[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // State for program generation form
  const [formData, setFormData] = useState<ProgramCreationInput>({
    objective: '',
    difficultyLevel: 'beginner',
    availableEquipment: '',
    duration: '',
  });
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Simulate fetching patients
  useEffect(() => {
    setPatientsLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      try {
        setPatients(simulatedPatients);
        setPatientsLoading(false);
      } catch (err) {
        console.error("Erreur simulation patients:", err);
        setError("Impossible de charger la liste des patients simulée.");
        setPatientsLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, []);

   const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
     const { name, value } = e.target;
     setFormData(prev => ({ ...prev, [name]: value }));
   };

    const handleSelectChange = (name: keyof ProgramCreationInput, value: string) => {
       if (name === 'difficultyLevel' && !['beginner', 'intermediate', 'advanced'].includes(value)) {
           console.error("Invalid difficulty level selected:", value);
           return;
       }
       setFormData(prev => ({ ...prev, [name]: value as 'beginner' | 'intermediate' | 'advanced' }));
    };

     const handlePatientSelectChange = (value: string) => {
         setSelectedPatientId(value);
     };

  const handleGenerateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerationError(null);

    if (!selectedPatientId) {
        setGenerationError("Veuillez sélectionner un patient.");
        toast({ variant: "destructive", title: "Erreur", description: "La sélection du patient est requise."});
        return;
    }
    if (!formData.objective || !formData.availableEquipment || !formData.duration) {
         setGenerationError("Veuillez remplir tous les champs obligatoires du formulaire de programme.");
         toast({ variant: "destructive", title: "Erreur", description: "Objectif, équipement et durée sont requis."});
         return;
     }

    setGenerating(true);

    const inputData: GenerateProgramInput = {
        patientId: selectedPatientId,
        objective: formData.objective,
        difficultyLevel: formData.difficultyLevel,
        availableEquipment: formData.availableEquipment,
        duration: formData.duration,
    };

    try {
      const result = await generateExerciseProgram(inputData);

       if (!result || !result.program || result.program.length === 0) {
            throw new Error("L'IA n'a pas pu générer de programme. Veuillez ajuster les entrées ou réessayer.");
        }

       const programData: Omit<Program, 'id' | 'createdAt' | 'updatedAt'> & {createdAt: Date} = {
         id_kine: 'sim-kine-id',
         id_patient: selectedPatientId,
         objective: formData.objective,
         difficultyLevel: formData.difficultyLevel,
         availableEquipment: formData.availableEquipment,
         duration: formData.duration,
         content: result.program as ExerciseInProgram[],
         createdAt: new Date(),
       };

       console.log("Simulating program save:", programData);
       const selectedPatientName = simulatedPatientsMap[selectedPatientId]?.name || 'le patient';

      toast({
        title: "Programme généré (Simulé) !",
        description: `Un programme de ${result.program.length} exercices a été créé pour ${selectedPatientName}. Vérifiez la console pour les données.`,
      });

      // Optionally clear form or navigate
      setFormData({ objective: '', difficultyLevel: 'beginner', availableEquipment: '', duration: '' });
      setSelectedPatientId('');
      router.push(`/dashboard/kine/patients/${selectedPatientId}`); // Go to patient detail page after generation

    } catch (err: any) {
      console.error("Erreur génération programme (simulé):", err);
      const errorMessage = err.message || "Une erreur inattendue s'est produite.";
      setGenerationError(`Échec: ${errorMessage}`);
      toast({
        variant: "destructive",
        title: "Échec de la Génération (Simulée)",
        description: errorMessage,
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-3xl font-bold text-primary">Mes Patients</h1>
            <Button disabled className="opacity-50 cursor-not-allowed"> {/* TODO: Implement Add Patient */}
                <UserPlus className="mr-2 h-4 w-4" /> Ajouter un Patient (Bientôt)
            </Button>
        </div>

        {/* Patient List */}
        {patientsLoading && (
          <div className="flex items-center justify-center p-10">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="ml-3 text-muted-foreground">Chargement des patients...</p>
          </div>
        )}

         {error && (
           <p className="text-destructive">{error}</p>
         )}

         {!patientsLoading && !error && (
           <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Liste des Patients</CardTitle>
                <CardDescription>
                    {patients.length > 0
                     ? `Vous gérez actuellement ${patients.length} patient${patients.length > 1 ? 's' : ''}. Sélectionnez un patient pour voir les détails ou générer un programme.`
                     : "Vous n'avez pas encore ajouté de patients."}
                 </CardDescription>
              </CardHeader>
             <CardContent>
                {patients.length > 0 ? (
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Nom</TableHead>
                       <TableHead>Email</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {patients.map((patient) => (
                       <TableRow key={patient.id}>
                         <TableCell>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                     {/* Conditional rendering based on photoURL presence */}
                                     {patient.photoURL ? (
                                        <img src={patient.photoURL} alt={`${patient.name} avatar`} className="aspect-square h-full w-full object-cover rounded-full" data-ai-hint="user profile picture" />
                                     ) : (
                                         <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
                                             {getInitials(patient.name)}
                                         </AvatarFallback>
                                     )}
                                </Avatar>
                                <span className="font-medium">{patient.name}</span>
                            </div>
                         </TableCell>
                         <TableCell className="text-muted-foreground">{patient.email}</TableCell>
                         <TableCell className="text-right space-x-2">
                            {/* Link to the specific patient detail page */}
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/dashboard/kine/patients/${patient.id}`}>
                                    <Eye className="mr-1 h-3 w-3" /> Voir Détails
                                </Link>
                            </Button>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
                ) : (
                    <p className="text-center text-muted-foreground py-6">Aucun patient trouvé. Cliquez sur "Ajouter un Patient" pour commencer.</p>
                )}
             </CardContent>
           </Card>
         )}

         {/* Program Generation Form */}
         {!patientsLoading && patients.length > 0 && (
             <Card className="shadow-lg border-border mt-8">
               <CardHeader className="bg-card">
                 <CardTitle className="text-xl md:text-2xl font-semibold flex items-center gap-3 text-primary">
                     <Wand2 className="text-accent h-6 w-6"/> Générer un Programme IA
                 </CardTitle>
                 <CardDescription>
                     Sélectionnez un patient ci-dessous et définissez les paramètres pour créer un programme personnalisé via IA.
                 </CardDescription>
               </CardHeader>
               <form onSubmit={handleGenerateProgram}>
                  <CardContent className="space-y-6 pt-6">
                      {/* Patient Selection */}
                      <div className="space-y-1.5">
                         <Label htmlFor="selectedPatientId" className="font-medium">Sélectionner un Patient*</Label>
                          <Select onValueChange={handlePatientSelectChange} value={selectedPatientId} required disabled={patientsLoading}>
                              <SelectTrigger id="selectedPatientId" disabled={patientsLoading} aria-label="Sélectionner un patient" className="bg-background focus:ring-accent">
                                  <SelectValue placeholder={patientsLoading ? "Chargement..." : "Choisir un patient pour le programme..."} />
                              </SelectTrigger>
                              <SelectContent>
                                  {patients.map(p => (
                                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.email})</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          {patientsLoading && <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" />}
                      </div>

                     {/* Objective Input */}
                     <div className="space-y-1.5">
                       <Label htmlFor="objective" className="font-medium">Objectif Clinique*</Label>
                       <Input
                         id="objective"
                         name="objective"
                         value={formData.objective}
                         onChange={handleInputChange}
                         placeholder="Ex : Renforcement quadriceps post-LCA"
                         required
                         aria-required="true"
                         className="bg-background focus:ring-accent"
                       />
                        <p className="text-xs text-muted-foreground">Quel est le but principal de ce programme ?</p>
                     </div>

                     {/* Difficulty Level Select */}
                     <div className="space-y-1.5">
                         <Label htmlFor="difficultyLevel" className="font-medium">Niveau de Difficulté*</Label>
                         <Select name="difficultyLevel" value={formData.difficultyLevel} onValueChange={(value) => handleSelectChange('difficultyLevel', value)} required>
                             <SelectTrigger id="difficultyLevel" aria-label="Niveau de difficulté" className="bg-background focus:ring-accent">
                                 <SelectValue placeholder="Choisir la difficulté" />
                             </SelectTrigger>
                             <SelectContent>
                                 <SelectItem value="beginner">Débutant</SelectItem>
                                 <SelectItem value="intermediate">Intermédiaire</SelectItem>
                                 <SelectItem value="advanced">Avancé</SelectItem>
                             </SelectContent>
                         </Select>
                     </div>

                     {/* Available Equipment Textarea */}
                      <div className="space-y-1.5">
                         <Label htmlFor="availableEquipment" className="font-medium">Matériel Disponible*</Label>
                         <Textarea
                            id="availableEquipment"
                            name="availableEquipment"
                            value={formData.availableEquipment}
                            onChange={handleInputChange}
                            placeholder="Ex : Haltères, bandes élastiques, ballon de stabilité, poids du corps uniquement"
                            required
                            aria-required="true"
                            rows={3}
                            className="bg-background focus:ring-accent"
                         />
                         <p className="text-xs text-muted-foreground">Listez le matériel auquel le patient a accès (séparé par des virgules).</p>
                      </div>

                      {/* Duration Input */}
                      <div className="space-y-1.5">
                         <Label htmlFor="duration" className="font-medium">Durée du Programme Souhaitée*</Label>
                         <Input
                             id="duration"
                             name="duration"
                             value={formData.duration}
                             onChange={handleInputChange}
                             placeholder="Ex : 4 semaines, 6 séances, jusqu'à prochaine évaluation"
                             required
                             aria-required="true"
                             className="bg-background focus:ring-accent"
                          />
                          <p className="text-xs text-muted-foreground">Combien de temps cette phase du programme doit-elle durer ?</p>
                      </div>

                       {/* Error Message */}
                       {generationError && (
                           <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive p-3 rounded-md">
                               <AlertCircle size={18}/>
                               <p className="text-sm">{generationError}</p>
                           </div>
                       )}

                  </CardContent>
                  <CardFooter className="border-t border-border pt-4">
                     <Button type="submit" className="w-full md:w-auto ml-auto bg-accent hover:bg-accent/90 text-accent-foreground" disabled={generating || patientsLoading || !selectedPatientId}>
                       {generating ? (
                         <>
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Génération en cours...
                         </>
                       ) : (
                          <>
                           <Wand2 className="mr-2 h-4 w-4" /> Générer le Programme
                          </>
                       )}
                     </Button>
                  </CardFooter>
               </form>
             </Card>
         )}

      </div>
    </AppLayout>
  );
}
