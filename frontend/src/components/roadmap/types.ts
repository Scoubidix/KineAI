export type RoadmapHorizon = 'COURT_TERME' | 'MOYEN_LONG_TERME';
export type RoadmapStatut = 'A_L_ETUDE' | 'PREVU' | 'EN_COURS';

export interface RoadmapItem {
  id: number;
  titre: string;
  description: string;
  horizon: RoadmapHorizon;
  statut: RoadmapStatut;
  isObjectifPrincipal: boolean;
  createdAt: string;
}

export interface RoadmapResponse {
  success: boolean;
  objectifPrincipal: RoadmapItem | null;
  courtTerme: RoadmapItem[];
  moyenLongTerme: RoadmapItem[];
}

/**
 * Méta d'affichage par statut (pill à point coloré, façon Linear / Jira).
 * `dot` = classes du point, `pill` = classes du conteneur sur fond clair.
 * Le libellé reste toujours visible : la couleur seule ne porte jamais l'information.
 */
export interface RoadmapStatutMeta {
  label: string;
  pill: string;
  dot: string;
}

export const STATUT_META: Record<RoadmapStatut, RoadmapStatutMeta> = {
  A_L_ETUDE: {
    label: 'À l\'étude',
    pill: 'border-gray-200 bg-gray-100 text-gray-700',
    dot: 'bg-gray-400',
  },
  PREVU: {
    label: 'Prévu',
    pill: 'border-violet-200 bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
  },
  EN_COURS: {
    label: 'En cours',
    pill: 'border-[#3899aa]/20 bg-[#3899aa]/10 text-[#2a7a88]',
    dot: 'bg-[#3899aa] animate-pulse',
  },
};

export const ALL_STATUTS: RoadmapStatut[] = ['A_L_ETUDE', 'PREVU', 'EN_COURS'];
