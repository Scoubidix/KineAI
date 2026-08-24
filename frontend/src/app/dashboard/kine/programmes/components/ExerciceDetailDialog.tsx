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
import type { ExerciceModele } from '@/types/exercice';
import { parseTags } from '@/utils/exerciceFiltering';

interface ExerciceDetailDialogProps {
  exercice: ExerciceModele;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absents pour un exercice public, ou pendant le mode sélection. */
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Détail d'un exercice : description, démo, et les actions de modification.
 * La card ne porte plus que le média et le nom ; tout le reste vit ici.
 */
export function ExerciceDetailDialog({
  exercice,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: ExerciceDetailDialogProps) {
  const tags = parseTags(exercice.tags);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#3899aa] pr-6">{exercice.nom}</DialogTitle>
          <DialogDescription className="sr-only">
            Détail de l&apos;exercice {exercice.nom}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {exercice.isPublic ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full text-xs text-blue-700 dark:text-blue-300">
                <Globe className="w-3 h-3" /> Public
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-700 dark:text-gray-300">
                <Lock className="w-3 h-3" /> Privé
              </span>
            )}
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>

          {exercice.gifUrl && (
            <img
              src={exercice.gifUrl}
              alt={exercice.nom}
              loading="lazy"
              className="w-full rounded-lg"
            />
          )}

          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line break-words">
            {exercice.description}
          </p>
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
