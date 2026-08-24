'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import type { ProgrammeListItem } from '@/hooks/useProgrammesList';
import {
  formatLastSession,
  getAdherence,
  getDayStates,
  getDaysSinceLastSession,
  getStatusInfo,
} from '@/utils/programmeStats';
import { ProgrammeDayStrip } from './ProgrammeDayStrip';
import { ProgrammeDetailDialog } from './ProgrammeDetailDialog';
import { ProgrammeDeleteDialog } from './ProgrammeDeleteDialog';

const getInitials = (firstName: string, lastName: string): string =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

interface ProgrammeCardProps {
  programme: ProgrammeListItem;
  /** Rafraichit la liste apres suppression. */
  onDeleted: () => void;
}

/**
 * Même grammaire que les cards d'exercice et de template : un bloc visuel en
 * haut, le titre et les métadonnées en dessous. Pour un programme, l'essence
 * n'est pas une image mais l'observance dans le temps — c'est donc elle qui
 * occupe le bloc.
 */
export function ProgrammeCard({ programme, onDeleted }: ProgrammeCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const status = getStatusInfo(programme);
  const adherence = getAdherence(programme);
  const states = getDayStates(programme);
  const lastSession = formatLastSession(getDaysSinceLastSession(programme));

  return (
    <>
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_260px]">
        <div
          className="card-hover relative overflow-hidden rounded-xl px-4 py-3 text-white"
          style={{
            background: 'linear-gradient(135deg, #1f5c6a 0%, #2d5f6e 50%, #3899aa 100%)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
              {getInitials(programme.patient.firstName, programme.patient.lastName)}
            </span>
            <Link
              href={`/dashboard/kine/patients/${programme.patient.id}`}
              className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
            >
              {programme.patient.firstName} {programme.patient.lastName}
            </Link>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-white/80 hover:bg-white/20 hover:text-white"
              aria-label={`Détail du programme ${programme.titre}`}
              onClick={() => setDetailOpen(true)}
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <span className="text-3xl font-bold leading-none">
                {adherence.percentage === null ? '—' : `${adherence.percentage}%`}
              </span>
              <span className="ml-1 text-[11px] opacity-70">d&apos;adhérence</span>
            </div>
            <Badge
              variant={status.variant}
              className={status.status === 'active' ? 'bg-white/20 text-white border-0' : ''}
            >
              {status.label}
            </Badge>
          </div>

          <div className="mt-2 space-y-1">
            <ProgrammeDayStrip states={states} />
            <p className="text-[11px] opacity-70">{status.daysText}</p>
          </div>
        </div>

        <p className="mt-2 text-sm sm:text-base font-medium break-words">{programme.titre}</p>
        <p className="text-xs text-muted-foreground">
          {programme._count.exercices} exercice{programme._count.exercices > 1 ? 's' : ''} ·{' '}
          {lastSession}
        </p>
      </div>

      <ProgrammeDetailDialog
        programme={programme}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={() => {
          setDetailOpen(false);
          setDeleteOpen(true);
        }}
      />

      <ProgrammeDeleteDialog
        programme={deleteOpen ? programme : null}
        onOpenChange={setDeleteOpen}
        onDeleted={onDeleted}
      />
    </>
  );
}
