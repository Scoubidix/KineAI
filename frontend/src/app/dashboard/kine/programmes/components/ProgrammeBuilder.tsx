'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import {
  DEFAULT_DUREE,
  computeDateFin,
  toExercisesPayload,
  todayIso,
  type BuilderDraft,
  type BuilderMode,
  type ProgrammeDraft,
} from '@/hooks/useBuilderDraft';
import { BuilderShell } from './BuilderShell';
import { BuilderRecap } from './BuilderRecap';
import { ProgrammeInfosCard } from './ProgrammeInfosCard';
import type { PatientOption } from './PatientPicker';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface ProgrammeBuilderProps {
  mode: BuilderMode;
  programmeId?: number;
}

/** Estimation d'une séance, affichée seulement si un temps de travail est saisi. */
function estimateMinutes(draft: ProgrammeDraft): number | null {
  if (!draft.exercices.some((ex) => ex.tempsTravail > 0)) return null;
  const seconds = draft.exercices.reduce(
    (total, ex) => total + ex.series * ex.tempsTravail + Math.max(0, ex.series - 1) * ex.tempsRepos,
    0,
  );
  return Math.round(seconds / 60);
}

export function ProgrammeBuilder({ mode, programmeId }: ProgrammeBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [patients, setPatients] = useState<PatientOption[]>([]);

  // Liste des patients pour le sélecteur (création uniquement), enrichie de
  // l'information « a déjà un programme en cours » : un patient ne suit qu'un
  // programme à la fois, les autres sont donc bloqués à la sélection.
  useEffect(() => {
    if (mode !== 'create') return;
    const loadPatients = async () => {
      try {
        const profileRes = await fetchWithAuth(`${apiUrl}/kine/profile`);
        if (!profileRes.ok) return;
        const kine = await profileRes.json();

        const [patientsRes, programmesRes] = await Promise.all([
          fetchWithAuth(`${apiUrl}/patients/kine/${kine.id}`),
          fetchWithAuth(`${apiUrl}/programmes/kine/all`),
        ]);
        if (!patientsRes.ok) return;

        const list: PatientOption[] = await patientsRes.json();
        const taken = new Set<number>(
          programmesRes.ok
            ? ((await programmesRes.json()) as Array<{ patient: { id: number } }>).map(
                (p) => p.patient.id,
              )
            : [],
        );

        setPatients(list.map((p) => ({ ...p, hasActiveProgramme: taken.has(p.id) })));
      } catch (err) {
        console.error('Erreur chargement patients:', err);
      }
    };
    void loadPatients();
  }, [mode]);

  const loadInitialDraft = async (): Promise<BuilderDraft> => {
    if (mode === 'create') {
      const patientIdParam = searchParams.get('patientId');
      return {
        kind: 'programme',
        mode: 'create',
        patientId: patientIdParam ? Number(patientIdParam) : null,
        patientName: null,
        nom: '',
        description: '',
        dateDebut: todayIso(),
        duree: DEFAULT_DUREE,
        exercices: [],
      };
    }

    // Édition : on retrouve le patient via la liste des programmes du kiné, puis
    // on charge le programme complet (avec ses exercices) via ce patient. Il n'y
    // a pas d'endpoint qui renvoie un programme seul par son identifiant.
    const allRes = await fetchWithAuth(`${apiUrl}/programmes/kine/all`);
    if (!allRes.ok) throw new Error('Programme introuvable');
    const all = await allRes.json();
    const summary = all.find((p: { id: number }) => p.id === programmeId);
    if (!summary) throw new Error('Programme introuvable');

    const detailRes = await fetchWithAuth(`${apiUrl}/programmes/${summary.patient.id}?withMedia=1`);
    if (!detailRes.ok) throw new Error('Programme introuvable');
    const detail = await detailRes.json();
    const programme = detail.find((p: { id: number }) => p.id === programmeId);
    if (!programme) throw new Error('Programme introuvable');

    return {
      kind: 'programme',
      mode: 'edit',
      targetId: programmeId,
      patientId: summary.patient.id,
      patientName: `${summary.patient.firstName} ${summary.patient.lastName}`,
      nom: programme.titre ?? '',
      description: programme.description ?? '',
      dateDebut: (programme.dateDebut ?? new Date().toISOString()).slice(0, 10),
      duree: programme.duree ?? DEFAULT_DUREE,
      exercices: (programme.exercices ?? []).map(
        (ex: {
          exerciceModele: {
            id: number;
            nom: string;
            videoUrl?: string | null;
            posterUrl?: string | null;
            gifUrl?: string | null;
          };
          series: number;
          repetitions: number;
          pause: number;
          tempsTravail?: number;
          consigne?: string;
        }) => ({
          exerciceId: ex.exerciceModele.id,
          nom: ex.exerciceModele.nom,
          videoUrl: ex.exerciceModele.videoUrl ?? null,
          posterUrl: ex.exerciceModele.posterUrl ?? null,
          gifUrl: ex.exerciceModele.gifUrl ?? null,
          series: ex.series,
          repetitions: ex.repetitions,
          tempsRepos: ex.pause,
          tempsTravail: ex.tempsTravail ?? 0,
          instructions: ex.consigne ?? '',
        }),
      ),
    };
  };

  const save = async (draft: ProgrammeDraft): Promise<boolean> => {
    const body = {
      titre: draft.nom,
      description: draft.description,
      duree: draft.duree,
      // Ni dateDebut ni dateFin : le serveur les derive de la duree.
      exercises: toExercisesPayload(draft.exercices),
      ...(mode === 'create' ? { patientId: draft.patientId } : {}),
    };

    const res = await fetchWithAuth(
      mode === 'create' ? `${apiUrl}/programmes` : `${apiUrl}/programmes/${programmeId}`,
      {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (res.status === 403) {
      toast({
        variant: 'destructive',
        title: 'Limite atteinte',
        description:
          'Tu as atteint la limite de programmes de ton plan. Passe à un plan supérieur pour en créer davantage.',
      });
      // Refus métier, pas une erreur : on renvoie false pour que le brouillon
      // soit conservé et que le kiné puisse réessayer après changement de plan.
      return false;
    }
    if (!res.ok) throw new Error(`Erreur ${res.status}`);

    toast({
      title: mode === 'create' ? '✅ Programme créé' : '✅ Programme mis à jour',
      duration: 3000,
    });

    // Retour sur la fiche patient, d'où le kiné peut envoyer le lien.
    router.push(`/dashboard/kine/patients/${draft.patientId}`);
    return true;
  };

  return (
    <BuilderShell
      kind="programme"
      mode={mode}
      targetId={programmeId}
      heading={mode === 'create' ? 'Nouveau programme' : 'Modifier le programme'}
      backHref="/dashboard/kine/programmes?tab=programmes"
      loadInitialDraft={loadInitialDraft}
      renderInfos={(draft, patch) => (
        <ProgrammeInfosCard
          mode={mode}
          draft={draft as ProgrammeDraft}
          patients={patients}
          onPatch={patch}
        />
      )}
      renderAside={({ draft, saving, runSave }) => {
        const programme = draft as ProgrammeDraft;
        const estimation = estimateMinutes(programme);
        const canSave =
          !!programme.patientId &&
          programme.nom.trim().length > 0 &&
          programme.exercices.length > 0;

        const rows = [
          { label: 'Patient', value: programme.patientName ?? '—' },
          { label: 'Exercices', value: String(programme.exercices.length) },
          ...(estimation !== null ? [{ label: 'Séance', value: `~${estimation} min` }] : []),
          {
            label: 'Période',
            value: `${format(new Date(programme.dateDebut), 'dd/MM/yyyy', { locale: fr })} → ${format(
              new Date(computeDateFin(programme.dateDebut, programme.duree)),
              'dd/MM/yyyy',
              { locale: fr },
            )}`,
          },
        ];

        return (
          <BuilderRecap
            rows={rows}
            mobileSummary={`${programme.exercices.length} exercice${
              programme.exercices.length > 1 ? 's' : ''
            }${estimation !== null ? ` · ~${estimation} min` : ''}`}
            actions={[
              {
                label: mode === 'create' ? 'Créer le programme' : 'Mettre à jour le programme',
                shortLabel: mode === 'create' ? 'Créer' : 'Mettre à jour',
                icon: <Save className="h-4 w-4 mr-2" />,
                primary: true,
                disabled: !canSave || saving,
                onClick: () => runSave(() => save(programme)),
              },
            ]}
          />
        );
      }}
    />
  );
}
