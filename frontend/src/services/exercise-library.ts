// src/services/exercise-library.ts
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ExerciseLibraryItem } from '@/types/exercise-library';

/**
 * Retrieves a list of available exercises from the Firestore 'exercises' collection.
 *
 * @returns A promise that resolves to an array of ExerciseLibraryItem objects.
 */
export async function getAvailableExercises(): Promise<ExerciseLibraryItem[]> {
  // In a real app, consider fetching only necessary fields or implementing pagination/caching.
  try {
    const exercisesRef = collection(db, 'exercises');
    // Limit the number of exercises fetched for the prompt context, adjust as needed.
    const q = query(exercisesRef, limit(50));
    const querySnapshot = await getDocs(q);

    const exercises: ExerciseLibraryItem[] = [];
    querySnapshot.forEach((doc) => {
      // Ensure data conforms to ExerciseLibraryItem structure, handle potential missing fields
      const data = doc.data();
      exercises.push({
        id: doc.id,
        title: data.title || 'Untitled Exercise',
        description: data.description || 'No description available.',
        illustrationUrl: data.illustrationUrl,
        targetMuscles: data.targetMuscles || [],
        requiredEquipment: data.requiredEquipment || [],
      });
    });

    // Fallback to example data if Firestore is empty or fails silently
    if (exercises.length === 0) {
        console.warn("No exercises found in Firestore or fetch failed, returning default examples.");
        return getExampleExercises();
    }


    return exercises;
  } catch (error) {
    console.error("Error fetching exercises from Firestore:", error);
    // Return example data as a fallback in case of error
    return getExampleExercises();
  }
}


/**
 * Provides example exercises if Firestore fetch fails or is empty.
 * @returns An array of example ExerciseLibraryItem objects.
 */
export function getExampleExercises(): ExerciseLibraryItem[] { // Added export keyword
    return [
        {
          id: 'example-bicep-curl',
          title: 'Bicep Curls',
          description: 'Stand with feet shoulder-width apart. Hold a dumbbell in each hand, palms facing forward. Keeping your elbows stationary, curl the weights up towards your shoulders, squeezing your biceps at the top. Slowly lower the weights back to the starting position.',
          illustrationUrl: 'https://picsum.photos/seed/bicep_curl/300/200',
          targetMuscles: ['Biceps'],
          requiredEquipment: ['Dumbbells'],
        },
        {
           id: 'example-squat',
          title: 'Squats',
          description: 'Stand with feet shoulder-width apart, toes slightly pointed outwards. Lower your hips as if sitting in a chair, keeping your back straight and chest up. Ensure your knees do not extend past your toes. Push through your heels to return to the starting position.',
          illustrationUrl: 'https://picsum.photos/seed/squat/300/200',
          targetMuscles: ['Quadriceps', 'Glutes', 'Hamstrings'],
          requiredEquipment: ['Bodyweight'],
        },
         {
           id: 'example-plank',
           title: 'Plank',
           description: 'Start in a push-up position, but rest on your forearms instead of your hands. Keep your body in a straight line from head to heels. Engage your core and hold the position.',
           illustrationUrl: 'https://picsum.photos/seed/plank/300/200',
           targetMuscles: ['Core', 'Abdominals', 'Back'],
           requiredEquipment: ['Bodyweight'],
         },
         {
            id: 'example-lunges',
            title: 'Lunges',
            description: 'Step forward with one leg, lowering your hips until both knees are bent at a 90-degree angle. Ensure your front knee is directly above your ankle and your back knee hovers just above the ground. Push off your front foot to return to the starting position. Alternate legs.',
            illustrationUrl: 'https://picsum.photos/seed/lunges/300/200',
            targetMuscles: ['Quadriceps', 'Glutes', 'Hamstrings'],
            requiredEquipment: ['Bodyweight'],
         },
      ];
}

// TODO: Add function to pre-populate Firestore with example exercises if needed.
// async function seedExercises() {
//     const examples = getExampleExercises();
//     const exercisesRef = collection(db, 'exercises');
//     for (const exercise of examples) {
//         // Use exercise title as ID for simplicity in seeding, or let Firestore auto-generate
//         const docRef = doc(exercisesRef, exercise.title.toLowerCase().replace(/\s+/g, '-'));
//         try {
//             await setDoc(docRef, exercise);
//             console.log(`Seeded exercise: ${exercise.title}`);
//         } catch (error) {
//             console.error(`Error seeding exercise ${exercise.title}:`, error);
//         }
//     }
// }
// Call seedExercises() manually or via a script if needed.
