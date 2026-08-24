'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BuilderDraft, TemplateDraft } from '@/hooks/useBuilderDraft';

interface TemplateInfosCardProps {
  draft: TemplateDraft;
  onPatch: (values: Partial<BuilderDraft>) => void;
}

/** Un template n'a ni patient ni dates : seulement un nom et une description. */
export function TemplateInfosCard({ draft, onPatch }: TemplateInfosCardProps) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <Label>Nom du template *</Label>
          <Input
            value={draft.nom}
            onChange={(e) => onPatch({ nom: e.target.value })}
            placeholder="Ex : Entorse cheville, Rééducation épaule…"
          />
        </div>

        <div className="space-y-2">
          <Label>Description (optionnel)</Label>
          <textarea
            value={draft.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="Décris l'objectif de ce template…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}
