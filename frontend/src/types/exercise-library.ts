// src/types/exercise-library.ts

/**
 * Represents a single exercise available in the library.
 * Used as input for the AI program generation.
 * Stored in the 'exercises' collection in Firestore.
 */
export interface ExerciseLibraryItem {
  id?: string; // Firestore document ID
  title: string;
  description: string;
  illustrationUrl?: string; // Optional URL for a visual
  // Add any other relevant fields, e.g., target muscles, required equipment
  targetMuscles?: string[];
  requiredEquipment?: string[];
}
