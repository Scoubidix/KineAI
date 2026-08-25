// Types alignés sur les modèles Prisma ExerciceModele / ExerciceTemplate / ExerciceTemplateItem.
// Ne pas confondre avec src/types/exercise-library.ts (vestige Firestore, inutilisé).

export interface ExerciceModele {
  id: number;
  nom: string;
  description: string;
  tags?: string; // liste séparée par des virgules, ex. "Rachis, Mobilité articulaire"
  // URLs signées temporaires générées par le backend
  videoUrl?: string | null;
  posterUrl?: string | null;
  gifUrl?: string | null; // legacy : présent tant que l'exercice n'a pas été refilmé
  // Chemins GCS stockés en base — servent à l'état (badge « À refilmer »),
  // jamais à l'affichage.
  videoPath?: string | null;
  posterPath?: string | null;
  gifPath?: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciceTemplateItem {
  id: number;
  ordre: number;
  series: number;
  repetitions: number;
  tempsRepos: number;
  tempsTravail?: number;
  instructions?: string;
  exerciceModele: {
    id: number;
    nom: string;
    description: string;
    tags?: string;
    videoUrl?: string | null;
    posterUrl?: string | null;
    gifUrl?: string | null;
    isPublic: boolean;
  };
}

export interface ExerciceTemplate {
  id: number;
  nom: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  items: ExerciceTemplateItem[];
}

// Forme d'un exercice en cours d'édition dans le formulaire de template
export interface TemplateExerciseInput {
  exerciceId: number;
  nom: string;
  series: number;
  repetitions: number;
  tempsRepos: number;
  tempsTravail: number;
  instructions: string;
}
