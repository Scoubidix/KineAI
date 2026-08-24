'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react';
import type { ExerciceTemplate } from '@/types/exercice';

interface TemplateDetailDialogProps {
  template: ExerciceTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absents pour un template public, ou pendant le mode sélection. */
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Description, réglages détaillés de chaque exercice, et actions du template. */
export function TemplateDetailDialog({
  template,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: TemplateDetailDialogProps) {
  const items = [...(template.items ?? [])].sort((a, b) => a.ordre - b.ordre);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#3899aa] pr-6">{template.nom}</DialogTitle>
          <DialogDescription className="sr-only">
            Détail du template {template.nom}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {template.isPublic ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full text-xs text-blue-700 dark:text-blue-300">
                <Globe className="w-3 h-3" /> Public
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-700 dark:text-gray-300">
                <Lock className="w-3 h-3" /> Privé
              </span>
            )}
            <Badge variant="outline" className="text-xs">
              {items.length} exercice{items.length > 1 ? 's' : ''}
            </Badge>
          </div>

          {template.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line break-words">
              {template.description}
            </p>
          )}

          <ol className="divide-y rounded-lg border">
            {items.map((item, i) => (
              <li key={item.id} className="flex items-start gap-3 p-3">
                <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{item.exerciceModele.nom}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.series} × {item.repetitions}
                    {item.tempsTravail ? ` · ${item.tempsTravail}s de travail` : ''}
                    {` · ${item.tempsRepos}s de repos`}
                  </p>
                  {item.instructions && (
                    <p className="text-xs text-muted-foreground italic mt-1 break-words">
                      {item.instructions}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {(onEdit || onDelete) && (
          <DialogFooter className="gap-2 sm:justify-start">
            {onEdit && (
              <Button variant="outline" onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Modifier
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
