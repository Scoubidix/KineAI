import { differenceInCalendarDays, isBefore, isSameDay } from 'date-fns';
import type { ProgrammeListItem } from '@/hooks/useProgrammesList';

export type ProgrammeStatus = 'expired' | 'future' | 'ending' | 'active';

export interface StatusInfo {
  status: ProgrammeStatus;
  label: string;
  variant: 'default' | 'secondary' | 'destructive';
  daysText: string;
}

export function getStatusInfo(programme: ProgrammeListItem): StatusInfo {
  const now = new Date();
  const dateFin = new Date(programme.dateFin);
  const dateDebut = new Date(programme.dateDebut);
  const daysRemaining = differenceInCalendarDays(dateFin, now);

  if (isBefore(dateFin, now)) {
    return {
      status: 'expired',
      label: 'Expiré',
      variant: 'destructive',
      daysText: `Expiré depuis ${Math.abs(daysRemaining)} j`,
    };
  }

  if (isBefore(now, dateDebut)) {
    return {
      status: 'future',
      label: 'À venir',
      variant: 'secondary',
      daysText: `Débute dans ${differenceInCalendarDays(dateDebut, now)} j`,
    };
  }

  if (daysRemaining <= 3) {
    return {
      status: 'ending',
      label: 'Fin proche',
      variant: 'default',
      daysText: `${daysRemaining} j restants`,
    };
  }

  return {
    status: 'active',
    label: 'Actif',
    variant: 'default',
    daysText: `${daysRemaining} j restants`,
  };
}

export type DayState = 'validated' | 'missed' | 'today' | 'future';

/**
 * État de chaque jour du programme. Aucun plafond : une frise tronquée
 * mentirait sur la durée réelle.
 */
export function getDayStates(programme: ProgrammeListItem): DayState[] {
  const start = new Date(programme.dateDebut);
  const today = new Date();
  const validations = programme.sessionValidations ?? [];

  return Array.from({ length: Math.max(0, programme.duree) }, (_, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() + i);

    const validation = validations.find((v) => isSameDay(new Date(v.date), day));
    if (validation?.isValidated) return 'validated';

    if (isSameDay(day, today)) return 'today';
    return day < today ? 'missed' : 'future';
  });
}

export interface Adherence {
  /** null tant que le programme n'a pas commencé : aucun jour à mesurer. */
  percentage: number | null;
  validated: number;
  elapsed: number;
}

/** Séances validées rapportées aux jours écoulés, jamais aux jours à venir. */
export function getAdherence(programme: ProgrammeListItem): Adherence {
  const states = getDayStates(programme);
  const elapsed = states.filter((s) => s !== 'future').length;
  const validated = states.filter((s) => s === 'validated').length;

  return {
    percentage: elapsed > 0 ? Math.round((validated / elapsed) * 100) : null,
    validated,
    elapsed,
  };
}

/** Nombre de jours depuis la dernière séance validée, ou null s'il n'y en a aucune. */
export function getDaysSinceLastSession(programme: ProgrammeListItem): number | null {
  const validated = (programme.sessionValidations ?? [])
    .filter((v) => v.isValidated)
    .map((v) => new Date(v.date))
    .sort((a, b) => b.getTime() - a.getTime());

  if (validated.length === 0) return null;
  return Math.max(0, differenceInCalendarDays(new Date(), validated[0]));
}

export function formatLastSession(days: number | null): string {
  if (days === null) return 'aucune séance';
  if (days === 0) return "dernière séance aujourd'hui";
  if (days === 1) return 'dernière séance hier';
  return `dernière séance il y a ${days} j`;
}

export interface Averages {
  pain: number | null;
  difficulty: number | null;
}

/** Moyennes de douleur et de difficulté sur les séances validées et renseignées. */
export function getAverages(programme: ProgrammeListItem): Averages {
  const validated = (programme.sessionValidations ?? []).filter((v) => v.isValidated);

  const average = (values: (number | null)[]): number | null => {
    const known = values.filter((v): v is number => v !== null && !Number.isNaN(v));
    if (known.length === 0) return null;
    return Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10;
  };

  return {
    pain: average(validated.map((v) => v.painLevel)),
    difficulty: average(validated.map((v) => v.difficultyLevel)),
  };
}
