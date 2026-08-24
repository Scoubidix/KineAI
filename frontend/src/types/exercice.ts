// Types alignés sur les modèles Prisma ExerciceModele / ExerciceTemplate / ExerciceTemplateItem.
// Ne pas confondre avec src/types/exercise-library.ts (vestige Firestore, inutilisé).

export interface ExerciceModele {
  id: number;
  nom: string;
  description: string;
  tags?: string; // liste séparée par des virgules, ex. "Rachis, Mobilité articulaire"
  gifUrl?: string | null; // URL signée temporaire générée par le backend
  gifPath?: string | null; // chemin GCS stocké en base
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
    gifUrl?: string;
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
