import type { ExerciceModele, ExerciceTemplate } from '@/types/exercice';

/**
 * Brouillon partagé par les deux builders — programme et template.
 *
 * Un template est structurellement un programme sans patient ni dates : la ligne
 * d'exercice est identique. Le brouillon est donc une union discriminée par
 * `kind`, conservée en sessionStorage. Il survit à l'aller-retour builder <->
 * bibliothèque (« + Ajouter des exercices ») et à un rafraîchissement de page,
 * sans rien demander au backend.
 */

export type BuilderKind = 'programme' | 'template';
export type BuilderMode = 'create' | 'edit';

export interface BuilderDraftExercice {
  exerciceId: number;
  nom: string;
  series: number;
  repetitions: number;
  tempsRepos: number;
  tempsTravail: number;
  instructions: string;
  /** URL signée de la démo, pour l'aperçu dans le builder. Peut avoir expiré si
      le brouillon est repris longtemps après : le rendu retombe alors sur le
      bloc vide. */
  gifUrl?: string | null;
  /** Renseigné quand l'exercice provient de l'aplatissement d'un template. */
  fromTemplate?: { id: number; nom: string };
}

interface BaseDraft {
  mode: BuilderMode;
  /** Identifiant de l'objet édité (programme ou template). */
  targetId?: number;
  /** Titre du programme, ou nom du template. */
  nom: string;
  description: string;
  exercices: BuilderDraftExercice[];
}

export interface ProgrammeDraft extends BaseDraft {
  kind: 'programme';
  patientId: number | null;
  patientName: string | null;
  /** Format YYYY-MM-DD. */
  dateDebut: string;
  duree: number;
}

export interface TemplateDraft extends BaseDraft {
  kind: 'template';
}

export type BuilderDraft = ProgrammeDraft | TemplateDraft;

/** Valeurs appliquées à un exercice ajouté seul, sans template. */
export const DEFAULT_EXERCICE_SETTINGS = {
  series: 3,
  repetitions: 10,
  tempsRepos: 30,
  tempsTravail: 0,
  instructions: '',
};

/**
 * Un programme est une prescription entre deux reevaluations, pas un abonnement :
 * au-dela d un mois, il faut le renouveler plutot que l etirer. Le backend applique
 * le meme plafond (PROGRAMME_DUREE_MAX dans middleware/validate.js).
 */
export const DUREE_MAX = 30;
export const DEFAULT_DUREE = 21;

export function draftKey(kind: BuilderKind, mode: BuilderMode, targetId?: number): string {
  return mode === 'edit' ? `${kind}-draft:edit:${targetId}` : `${kind}-draft:create`;
}

export function readDraft(key: string): BuilderDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuilderDraft;
    // Garde-fou : un brouillon corrompu ne doit pas casser la page.
    if (!parsed || !Array.isArray(parsed.exercices)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: BuilderDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch (error) {
    console.error("Impossible d'enregistrer le brouillon :", error);
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date de fin déduite de la date de début et de la durée, au format ISO complet. */
export function computeDateFin(dateDebut: string, duree: number): string {
  const start = new Date(dateDebut);
  if (Number.isNaN(start.getTime())) return new Date().toISOString();
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(1, duree));
  return end.toISOString();
}

/**
 * Transforme une sélection (exercices + templates) en lignes de brouillon.
 *
 * Les templates sont traités en premier et leurs valeurs font foi : si un exercice
 * est à la fois dans un template coché et coché individuellement, il n'apparaît
 * qu'une fois, avec les réglages du template.
 */
export function flattenSelection(
  exercices: ExerciceModele[],
  templates: ExerciceTemplate[],
): BuilderDraftExercice[] {
  const result: BuilderDraftExercice[] = [];
  const seen = new Set<number>();

  for (const template of templates) {
    const items = [...template.items].sort((a, b) => a.ordre - b.ordre);
    for (const item of items) {
      const id = item.exerciceModele.id;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        exerciceId: id,
        nom: item.exerciceModele.nom,
        series: item.series,
        repetitions: item.repetitions,
        tempsRepos: item.tempsRepos,
        tempsTravail: item.tempsTravail || 0,
        // ExerciceProgramme.consigne est non-nullable côté base,
        // alors que ExerciceTemplateItem.instructions est optionnel.
        instructions: item.instructions || '',
        gifUrl: item.exerciceModele.gifUrl ?? null,
        fromTemplate: { id: template.id, nom: template.nom },
      });
    }
  }

  for (const exercice of exercices) {
    if (seen.has(exercice.id)) continue;
    seen.add(exercice.id);
    result.push({
      exerciceId: exercice.id,
      nom: exercice.nom,
      gifUrl: exercice.gifUrl ?? null,
      ...DEFAULT_EXERCICE_SETTINGS,
    });
  }

  return result;
}

/** Corps `exercises` attendu par les deux API (programmes et templates). */
export function toExercisesPayload(exercices: BuilderDraftExercice[]) {
  return exercices.map((ex, index) => ({
    exerciceId: ex.exerciceId,
    ordre: index,
    series: ex.series,
    repetitions: ex.repetitions,
    tempsRepos: ex.tempsRepos,
    tempsTravail: ex.tempsTravail,
    instructions: ex.instructions,
  }));
}
