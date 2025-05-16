/**
 * @fileoverview Initializes and configures the AI instance for the application.
 * We're using Google AI (Gemini) via the @genkit-ai/googleai plugin.
 * Make sure to set the GOOGLE_GENAI_API_KEY environment variable.
 */

import { googleAI } from '@genkit-ai/googleai';
import { genkit } from 'genkit'; // Import genkit constructor

// Configure Genkit using the v1.x constructor
export const ai = genkit({
  plugins: [
    googleAI({
        // Optional: Specify API version if needed
        // apiVersion: 'v1beta'
    }),
  ],
  logLevel: 'debug', // Set to 'info' or 'warn' in production
  enableTracingAndMetrics: true, // Optional: Enables OpenTelemetry tracing
});

// The 'ai' constant is now directly exported above.
// No need for a separate export statement like `export {ai} from 'genkit';`
