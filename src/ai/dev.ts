/**
 * @fileoverview Development server entry point for Genkit flows.
 * Import all flows that you want to be available in the Genkit developer UI.
 */

import './ai-instance'; // Ensure AI is configured
import './flows/generate-exercise-program';
import './flows/patient-chatbot';

// Add imports for any other flows you create
// import './flows/your-other-flow';

console.log('Genkit development server running. Flows registered: generateExerciseProgram, patientChatbot');
