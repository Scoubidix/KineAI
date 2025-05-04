
'use server';
/**
 * @fileOverview Flow for generating personalized exercise programs for patients.
 *
 * - generateExerciseProgram - A function that generates an exercise program based on patient needs.
 * - GenerateExerciseProgramInput - The input type for the generateExerciseProgram function.
 * - GenerateExerciseProgramOutput - The return type for the generateExerciseProgram function.
 */

import { ai } from '@/ai/ai-instance'; // Updated import path
import { z } from 'genkit';
import { getAvailableExercises } from '@/services/exercise-library';
import type { ExerciseLibraryItem } from '@/types/exercise-library';
import type { ExerciseInProgram } from '@/types/program'; // Import ExerciseInProgram

// Matches the form input and data needed for the AI
const GenerateExerciseProgramInputSchema = z.object({
  patientId: z.string().describe('The ID of the patient.'),
  objective: z.string().describe('The clinical objectives of the program (e.g., quadriceps strengthening post-ACL surgery).'),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('The difficulty level of the program.'),
  availableEquipment: z.string().describe('The available equipment for the exercises (e.g., Dumbbells, resistance bands, bodyweight only).'),
  duration: z.string().describe('The desired duration of the program phase (e.g., 4 weeks, 6 sessions).'),
});
export type GenerateProgramInput = z.infer<typeof GenerateExerciseProgramInputSchema>; // Keep export for form usage

// Defines the expected structure of the AI's output (the program content)
const GeneratedProgramContentSchema = z.array(
    z.object({
      title: z.string().describe('The title of the selected exercise (must exactly match one from the "Available Exercises" list).'),
      description: z.string().describe('A detailed description of how to perform the exercise, potentially adapted for the patient, formatted using markdown bullet points (e.g., "- Step 1...\n- Step 2...").'),
      frequency: z.string().describe('The recommended frequency of the exercise (e.g., 3 times per week, every other day).'),
      repetitions: z.string().describe('The recommended number of repetitions and sets (e.g., 3 sets of 10 repetitions, hold for 30 seconds).'),
      restTime: z.string().describe('The recommended rest time between sets (e.g., 60 seconds, 1 minute, 90s).'), // Added restTime
      // illustrationUrl and requiredEquipment are added back later from the library
    })
).describe('An array representing the personalized exercise program for the patient.');


// Defines the final output structure returned by the exported function
// Now includes enriched ExerciseInProgram
const GenerateExerciseProgramOutputSchema = z.object({
   program: z.array(
      z.object({
         id: z.string().describe('A unique identifier for this exercise within the program.'), // Added ID
         title: z.string(),
         description: z.string(),
         frequency: z.string(),
         repetitions: z.string(),
         restTime: z.string().optional(), // Added optional restTime
         illustrationUrl: z.string().optional(),
         requiredEquipment: z.array(z.string()).optional(), // Added optional requiredEquipment
      })
   ),
});
export type GenerateExerciseProgramOutput = z.infer<typeof GenerateExerciseProgramOutputSchema>;


export async function generateExerciseProgram(input: GenerateProgramInput): Promise<GenerateExerciseProgramOutput> {
  // This is the function called by the frontend
  return generateExerciseProgramFlow(input);
}

// Internal prompt definition
const generateExerciseProgramPrompt = ai.definePrompt({
  name: 'generateExerciseProgramPrompt',
  input: {
    schema: z.object({
      patientId: z.string(),
      objective: z.string(),
      difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced']),
      availableEquipment: z.string(),
      duration: z.string(),
      availableExercises: z.array( // Use the detailed ExerciseLibraryItem schema
        z.object({
          id: z.string().optional(), // Keep ID if available
          title: z.string(),
          description: z.string(),
          illustrationUrl: z.string().optional(),
          targetMuscles: z.array(z.string()).optional(),
          requiredEquipment: z.array(z.string()).optional(),
        })
      ).describe('List of available exercises from the exercise library.'),
    }),
  },
  output: {
    // The prompt's direct output schema matches the program content structure
    schema: z.object({ program: GeneratedProgramContentSchema }),
  },
  prompt: `You are an expert physiotherapist creating a personalized rehabilitation program. Select appropriate exercises ONLY from the provided "Available Exercises" list.

  Patient Context:
  - Clinical Objective: {{{objective}}}
  - Difficulty Level: {{{difficultyLevel}}}
  - Available Equipment: {{{availableEquipment}}}
  - Program Duration: {{{duration}}}

  Available Exercises:
  {{#each availableExercises}}
  - Title: {{{this.title}}}
    Description: {{{this.description}}}
    {{#if this.requiredEquipment}}Equipment: {{join this.requiredEquipment ", "}}{{/if}}
    {{#if this.targetMuscles}}Target Muscles: {{join this.targetMuscles ", "}}{{/if}}
  {{/each}}

  Instructions:
  1. Analyze the patient context and the available exercises.
  2. Select a suitable set of exercises from the list that match the objective, difficulty, and equipment. Ensure the title EXACTLY matches an exercise from the "Available Exercises" list.
  3. For each selected exercise, define:
     - A specific frequency (e.g., "3 times per week", "daily").
     - Repetitions/sets (e.g., "3 sets of 12 repetitions", "hold for 45 seconds, 5 times").
     - A rest time between sets (e.g., "60 seconds", "1 minute 30 seconds", "45s").
  4. Ensure the program is appropriate for the specified duration and difficulty level.
  5. Format the exercise description using markdown bullet points for clarity (e.g., "- Step 1...\n- Step 2..."). Adapt the standard description slightly if needed, but keep the core instructions.
  6. Return ONLY the generated program as a JSON object with a key "program" containing an array of exercises. Each exercise object in the array must have the fields: "title", "description", "frequency", "repetitions", and "restTime". Do not include exercises not in the provided list.

  Example Output Format:
  {
    "program": [
      {
        "title": "Squats",
        "description": "- Stand with feet shoulder-width apart...\n- Push through your heels to return.",
        "frequency": "3 times per week",
        "repetitions": "3 sets of 10 repetitions",
        "restTime": "60 seconds"
      },
      {
        "title": "Plank",
        "description": "- Rest on your forearms...\n- Engage your core and hold.",
        "frequency": "Every other day",
        "repetitions": "Hold for 30 seconds, 4 times",
        "restTime": "45s"
      }
    ]
  }
  `,
});

// Internal Genkit flow definition
const generateExerciseProgramFlow = ai.defineFlow<
  typeof GenerateExerciseProgramInputSchema,
  typeof GenerateExerciseProgramOutputSchema // Output includes the wrapper { program: [...] }
>({
  name: 'generateExerciseProgramFlow',
  inputSchema: GenerateExerciseProgramInputSchema,
  outputSchema: GenerateExerciseProgramOutputSchema,
}, async (input) => {
  // 1. Fetch available exercises from the library (Firestore or examples)
  const availableExercises: ExerciseLibraryItem[] = await getAvailableExercises();

   // Filter exercises based on available equipment (simple check)
   // This is a basic filter; the AI prompt also considers equipment.
   const patientEquipment = input.availableEquipment.toLowerCase().split(/,|\band\b/).map(e => e.trim()).filter(Boolean);
   const filteredExercises = availableExercises.filter(ex => {
       if (!ex.requiredEquipment || ex.requiredEquipment.length === 0 || ex.requiredEquipment.includes('Bodyweight') || ex.requiredEquipment.includes('bodyweight')) {
            return true; // Bodyweight exercises are always available
       }
       // Check if *any* required equipment is mentioned by the patient
       return ex.requiredEquipment.some(req => patientEquipment.includes(req.toLowerCase()));
   });


    if (filteredExercises.length === 0) {
        console.warn("No exercises match the available equipment after filtering. Sending all exercises to AI.");
        // Potentially throw an error or proceed with all exercises if filtering is too strict
        // throw new Error("No exercises available for the specified equipment.");
     }


  // 2. Call the AI prompt with input and the list of available (and potentially filtered) exercises
  const { output } = await generateExerciseProgramPrompt({
    ...input,
    availableExercises: filteredExercises.length > 0 ? filteredExercises : availableExercises, // Send filtered or all if filter yields none
  });

  // 3. Validate and process the AI output
   if (!output || !output.program) {
     throw new Error('AI did not return the expected program structure.');
   }

    // 4. Enrich the output with illustrationUrl, requiredEquipment, and a unique ID from the original library data
     const enrichedProgram: ExerciseInProgram[] = output.program
       .map((generatedExercise, index) => {
          // Find the corresponding library item based on the exact title match
          const libraryItem = availableExercises.find(item => item.title === generatedExercise.title);

          if (!libraryItem) {
             console.warn(`AI generated exercise "${generatedExercise.title}" not found in library. Skipping.`);
             return null; // Skip exercises not found in the library
          }

          return {
              ...generatedExercise,
              // Generate a unique ID for this instance in the program
              id: `${input.patientId}-${Date.now()}-${index}`, // Simple unique ID generation
              illustrationUrl: libraryItem?.illustrationUrl,
              requiredEquipment: libraryItem?.requiredEquipment || [], // Add equipment back
          };
       })
       .filter((exercise): exercise is ExerciseInProgram => exercise !== null); // Filter out null entries


  // 4. Return the final structured output, matching GenerateExerciseProgramOutputSchema
   return { program: enrichedProgram };
});

