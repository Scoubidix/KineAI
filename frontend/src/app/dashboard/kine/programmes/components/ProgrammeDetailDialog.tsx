'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import type { ProgrammeListItem } from '@/hooks/useProgrammesList';
import {
  formatLastSession,
  getAdherence,
  getAverages,
  getDayStates,
  getDaysSinceLastSession,
  getStatusInfo,
} from '@/utils/programmeStats';
import { ProgrammeDayStrip } from './ProgrammeDayStrip';
import { MediaCarousel, type CarouselSlide } from './MediaCarousel';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface ProgrammeDetailDialogProps {
  programme: ProgrammeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}

export function ProgrammeDetailDialog({
  programme,
  open,
  onOpenChange,
  onDelete,
}: ProgrammeDetailDialogProps) {
  const status = getStatusInfo(programme);
  const adherence = getAdherence(programme);
  const averages = getAverages(programme);
  const states = getDayStates(programme);
  const lastSession = formatLastSession(getDaysSinceLastSession(programme));

  const [slides, setSlides] = useState<CarouselSlide[] | null>(null);
  const [index, setIndex] = useState(0);

  // Les exercices ne sont pas dans la liste des programmes (seul leur nombre
  // l'est) : on les charge à l'ouverture, pour un seul programme à la fois.
  useEffect(() => {
    if (!open || slides) return;
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${apiUrl}/programmes/${programme.patient.id}?withMedia=1`);
        if (!res.ok) throw new Error('Chargement impossible');
        const programmes = await res.json();
        const found = programmes.find((p: { id: number }) => p.id === programme.id);
        setSlides(
          (found?.exercices ?? []).map(
            (ex: { id: number; exerciceModele: { nom: string; gifUrl?: string | null } }) => ({
              id: ex.id,
              nom: ex.exerciceModele.nom,
              gifUrl: ex.exerciceModele.gifUrl ?? null,
            }),
          ),
        );
      } catch (error) {
        console.error('Erreur chargement des exercices du programme:', error);
        setSlides([]);
      }
    };
    void load();
  }, [open, slides, programme.id, programme.patient.id]);

  const validations = [...(programme.sessionValidations ?? [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((v) => v.isValidated);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-start gap-2 pr-6">
            <DialogTitle className="text-[#3899aa] flex-1">{programme.titre}</DialogTitle>
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0">
              <Link
                href={`/dashboard/kine/programmes/${programme.id}/edition`}
                aria-label={`Modifier ${programme.titre}`}
              >
                <Pencil className="w-4 h-4" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
              aria-label={`Supprimer ${programme.titre}`}
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            Détail du programme {programme.titre}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-xs text-muted-foreground">{status.daysText}</span>
          </div>

          <p className="text-sm">
            <Link
              href={`/dashboard/kine/patients/${programme.patient.id}`}
              className="font-medium text-[#3899aa] hover:underline"
            >
              {programme.patient.firstName} {programme.patient.lastName}
            </Link>
          </p>

          {programme.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line break-words">
              {programme.description}
            </p>
          )}

          {/* Les exercices du programme, même principe que les templates. */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {programme._count.exercices} exercice{programme._count.exercices > 1 ? 's' : ''}
            </p>
            {slides === null ? (
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : slides.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <MediaCarousel slides={slides} index={index} onIndexChange={setIndex} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun exercice.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold text-[#3899aa]">
                {adherence.percentage === null ? '—' : `${adherence.percentage}%`}
              </p>
              <p className="text-[11px] text-muted-foreground">adhérence</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold">{averages.pain ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">douleur moy.</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-lg font-bold">{averages.difficulty ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">difficulté moy.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Du {format(new Date(programme.dateDebut), 'dd/MM/yyyy', { locale: fr })} au{' '}
                {format(new Date(programme.dateFin), 'dd/MM/yyyy', { locale: fr })}
              </span>
              <span>
                {adherence.validated} / {adherence.elapsed} j
              </span>
            </div>
            <ProgrammeDayStrip states={states} onLight />
            <p className="text-xs text-muted-foreground">{lastSession}</p>
          </div>

          {validations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Séances validées
              </p>
              {/* Bornées par construction : SessionValidation est unique par
                  (patient, programme, jour), donc au plus une ligne par jour de
                  programme. La hauteur fixe suffit, pas de pagination. */}
              <ul className="divide-y rounded-lg border max-h-56 overflow-y-auto">
                {validations.map((v) => (
                  <li key={v.date} className="flex items-center justify-between p-2 text-sm">
                    <span>{format(new Date(v.date), 'dd/MM/yyyy', { locale: fr })}</span>
                    <span className="text-xs text-muted-foreground">
                      Douleur {v.painLevel ?? '—'}/10 · Difficulté {v.difficultyLevel ?? '—'}/10
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
