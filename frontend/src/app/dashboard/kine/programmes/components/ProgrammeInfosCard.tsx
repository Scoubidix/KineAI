'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DUREE_MAX, computeDateFin, type BuilderDraft, type ProgrammeDraft } from '@/hooks/useBuilderDraft';
import { PatientPicker, type PatientOption } from './PatientPicker';

interface ProgrammeInfosCardProps {
  mode: 'create' | 'edit';
  draft: ProgrammeDraft;
  patients: PatientOption[];
  onPatch: (values: Partial<BuilderDraft>) => void;
}

export function ProgrammeInfosCard({
  mode,
  draft,
  patients,
  onPatch,
}: ProgrammeInfosCardProps) {
  const isEdit = mode === 'edit';

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <Label>Patient *</Label>
          {isEdit ? (
            // Le patient d'un programme existant ne change pas : ce serait un
            // autre programme.
            <Input value={draft.patientName ?? ''} disabled />
          ) : (
            <PatientPicker
              patients={patients}
              selectedId={draft.patientId}
              selectedName={draft.patientName}
              onSelect={(patient) =>
                onPatch({
                  patientId: patient.id,
                  patientName: `${patient.firstName} ${patient.lastName}`,
                })
              }
              onClear={() => onPatch({ patientId: null, patientName: null })}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Titre du programme *</Label>
          <Input
            value={draft.nom}
            onChange={(e) => onPatch({ nom: e.target.value })}
            placeholder="Ex : Reprise épaule, phase 1"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <textarea
            value={draft.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="Objectif du programme, consignes générales..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Durée (jours)</Label>
          {/* Figée en édition : la durée détermine la date de fin, qui pilote
              l'expiration du lien déjà envoyé au patient. Pour changer la
              période, on crée un nouveau programme. */}
          <Input
            type="number"
            min="1"
            max={DUREE_MAX}
            value={draft.duree}
            disabled={isEdit}
            onChange={(e) =>
              onPatch({ duree: Math.min(DUREE_MAX, Math.max(1, Number(e.target.value))) })
            }
          />
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? `Du ${format(new Date(draft.dateDebut), 'dd/MM/yyyy', { locale: fr })} au ${format(
                  new Date(computeDateFin(draft.dateDebut, draft.duree)),
                  'dd/MM/yyyy',
                  { locale: fr },
                )} — la durée n'est plus modifiable une fois le programme créé.`
              : `${DUREE_MAX} jours maximum. Le programme démarre aujourd'hui.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
