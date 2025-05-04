'use server';
/**
 * @fileOverview An AI chatbot for patients that can help them understand their exercises,
 * stay motivated, and answer basic health questions. (Version française)
 *
 * - patientChatbot - A function that handles the patient chatbot process.
 * - PatientChatbotInput - The input type for the patientChatbot function.
 * - PatientChatbotOutput - The return type for the patientChatbot function.
 */

import { ai } from '@/ai/ai-instance'; // Updated import path
import { z } from 'genkit';

const PatientChatbotInputSchema = z.object({
  message: z.string().describe('Le message du patient.'),
});
export type PatientChatbotInput = z.infer<typeof PatientChatbotInputSchema>;

const PatientChatbotOutputSchema = z.object({
  response: z.string().describe('La réponse du chatbot.'),
});
export type PatientChatbotOutput = z.infer<typeof PatientChatbotOutputSchema>;

export async function patientChatbot(input: PatientChatbotInput): Promise<PatientChatbotOutput> {
  return patientChatbotFlow(input);
}

const canAnswerHealthQuestion = ai.defineTool({
  name: 'canAnswerHealthQuestion',
  description: 'Détermine si le chatbot peut répondre à la question de santé ou s\'il doit référer le patient à son kiné.',
  inputSchema: z.object({
    question: z.string().describe('La question de santé posée par le patient.'),
  }),
  outputSchema: z.boolean().describe('Vrai si le chatbot peut répondre, faux sinon.'),
}, async input => {
  // TODO: Implémenter la logique pour déterminer si le chatbot peut répondre.
  // Pourrait vérifier une liste de sujets connus ou utiliser un modèle IA plus avancé.
  // Pour l'instant, retourne vrai pour toutes les questions (à affiner !).
  // Exemple simple : refuser si la question contient des mots comme "douleur intense", "diagnostic", "médicament"
  const questionLower = input.question.toLowerCase();
  const disallowedKeywords = ["douleur intense", "diagnostic", "médicament", "urgence", "blessure grave"];
  if (disallowedKeywords.some(keyword => questionLower.includes(keyword))) {
      return false; // Cannot answer questions suggesting serious issues or asking for diagnosis/medication
  }
  // Allow questions about exercise form, motivation, general wellness tips etc.
  return true;
});

const prompt = ai.definePrompt({
  name: 'patientChatbotPrompt',
  input: {
    schema: z.object({
      message: z.string().describe('Le message du patient.'),
    }),
  },
  output: {
    schema: z.object({
      response: z.string().describe('La réponse du chatbot.'),
    }),
  },
  tools: [canAnswerHealthQuestion],
  prompt: `Tu es un coach santé IA bienveillant et motivant, assistant un patient dans sa rééducation. Ton rôle est d'aider à comprendre les exercices, à rester motivé et à répondre aux questions de santé BASIQUES.

  Le patient va t'envoyer des messages. Réponds de manière appropriée, positive et encourageante.

  Si le patient pose une question de santé :
  1. Utilise l'outil "canAnswerHealthQuestion" pour déterminer si tu peux y répondre.
  2. Si l'outil retourne 'true' : Réponds à la question de manière informative et générale, en te concentrant sur le bien-être, la motivation ou la compréhension des exercices. NE JAMAIS POSER DE DIAGNOSTIC NI SUGGÉRER DE TRAITEMENT SPÉCIFIQUE. Rappelle que tes conseils sont généraux.
  3. Si l'outil retourne 'false' : Réponds poliment que cette question dépasse tes capacités et qu'il est **essentiel** qu'il pose la question directement à son kinésithérapeute pour obtenir un avis médical personnalisé. Ne tente pas de répondre.

  Contexte de l'exercice (si pertinent, sera fourni dans le message) : Le patient peut poser des questions sur un exercice spécifique de son programme.

  Message du patient : {{{message}}}

  Ta réponse :
  `,
});

const patientChatbotFlow = ai.defineFlow<
  typeof PatientChatbotInputSchema,
  typeof PatientChatbotOutputSchema
>({
  name: 'patientChatbotFlow',
  inputSchema: PatientChatbotInputSchema,
  outputSchema: PatientChatbotOutputSchema,
}, async input => {
  // TODO: Future - Fetch conversation history or patient program context if needed.
  // const history = await getConversationHistory(input.patientId);
  // const program = await getCurrentProgram(input.patientId);
  // const enrichedInput = { ...input, history, program };
  const { output } = await prompt(input); // Pass enrichedInput if implemented

  // Basic post-processing (optional)
  let responseText = output?.response || "Désolé, je n'ai pas pu traiter votre demande pour le moment.";
  if (responseText.includes("[instruction pour référer au kiné]")) { // Example placeholder check
      responseText = "Je comprends votre question, mais elle concerne un sujet médical spécifique. Il est préférable d'en discuter directement avec votre kinésithérapeute pour obtenir des conseils adaptés à votre situation.";
  }


  return { response: responseText };
});
