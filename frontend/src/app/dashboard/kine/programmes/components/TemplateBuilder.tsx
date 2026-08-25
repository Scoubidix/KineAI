'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import {
  toExercisesPayload,
  type BuilderDraft,
  type BuilderMode,
  type TemplateDraft,
} from '@/hooks/useBuilderDraft';
import type { ExerciceTemplate } from '@/types/exercice';
import { BuilderShell } from './BuilderShell';
import { BuilderRecap } from './BuilderRecap';
import { TemplateInfosCard } from './TemplateInfosCard';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface TemplateBuilderProps {
  mode: BuilderMode;
  templateId?: number;
}

export function TemplateBuilder({ mode, templateId }: TemplateBuilderProps) {
  const router = useRouter();
  const { toast } = useToast();

  const loadInitialDraft = async (): Promise<BuilderDraft> => {
    if (mode === 'create') {
      return {
        kind: 'template',
        mode: 'create',
        nom: '',
        description: '',
        exercices: [],
      };
    }

    const res = await fetchWithAuth(`${apiUrl}/exercice-templates/${templateId}`);
    if (!res.ok) throw new Error('Template introuvable');
    const template: ExerciceTemplate = await res.json();

    return {
      kind: 'template',
      mode: 'edit',
      targetId: templateId,
      nom: template.nom ?? '',
      description: template.description ?? '',
      exercices: [...(template.items ?? [])]
        .sort((a, b) => a.ordre - b.ordre)
        .map((item) => ({
          exerciceId: item.exerciceModele.id,
          nom: item.exerciceModele.nom,
          videoUrl: item.exerciceModele.videoUrl ?? null,
          posterUrl: item.exerciceModele.posterUrl ?? null,
          gifUrl: item.exerciceModele.gifUrl ?? null,
          series: item.series,
          repetitions: item.repetitions,
          tempsRepos: item.tempsRepos,
          tempsTravail: item.tempsTravail ?? 0,
          instructions: item.instructions ?? '',
        })),
    };
  };

  const save = async (draft: TemplateDraft): Promise<boolean> => {
    const res = await fetchWithAuth(
      mode === 'create'
        ? `${apiUrl}/exercice-templates`
        : `${apiUrl}/exercice-templates/${templateId}`,
      {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: draft.nom,
          description: draft.description || null,
          // L'API dérive `ordre` de la position dans le tableau : l'ordre du
          // brouillon fait donc foi, y compris après un glisser-déposer.
          exercises: toExercisesPayload(draft.exercices),
        }),
      },
    );

    if (!res.ok) throw new Error(`Erreur ${res.status}`);

    toast({
      title: mode === 'create' ? '✅ Template créé' : '✅ Template mis à jour',
      duration: 3000,
    });
    router.push('/dashboard/kine/programmes?tab=templates');
    return true;
  };

  return (
    <BuilderShell
      kind="template"
      mode={mode}
      targetId={templateId}
      heading={mode === 'create' ? 'Nouveau template' : 'Modifier le template'}
      backHref="/dashboard/kine/programmes?tab=templates"
      loadInitialDraft={loadInitialDraft}
      renderInfos={(draft, patch) => (
        <TemplateInfosCard draft={draft as TemplateDraft} onPatch={patch} />
      )}
      renderAside={({ draft, saving, runSave }) => {
        const template = draft as TemplateDraft;
        const canSave = template.nom.trim().length > 0 && template.exercices.length > 0;

        return (
          <BuilderRecap
            rows={[
              { label: 'Nom', value: template.nom.trim() || '—' },
              { label: 'Exercices', value: String(template.exercices.length) },
            ]}
            mobileSummary={`${template.exercices.length} exercice${
              template.exercices.length > 1 ? 's' : ''
            }`}
            actions={[
              {
                label: mode === 'create' ? 'Créer le template' : 'Mettre à jour le template',
                shortLabel: mode === 'create' ? 'Créer' : 'Mettre à jour',
                icon: <Save className="h-4 w-4 mr-2" />,
                primary: true,
                disabled: !canSave || saving,
                onClick: () => runSave(() => save(template)),
              },
            ]}
          />
        );
      }}
    />
  );
}
