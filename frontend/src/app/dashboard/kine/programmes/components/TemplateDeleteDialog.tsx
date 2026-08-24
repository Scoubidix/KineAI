'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import type { ExerciceTemplate } from '@/types/exercice';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface TemplateDeleteDialogProps {
  template: ExerciceTemplate | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function TemplateDeleteDialog({
  template,
  onOpenChange,
  onDeleted,
}: TemplateDeleteDialogProps) {
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!template) return;
    try {
      const res = await fetchWithAuth(`${apiUrl}/exercice-templates/${template.id}`, {
        method: 'DELETE',
      });
      if (res.status === 204) {
        onOpenChange(false);
        onDeleted();
      } else {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch (error) {
      console.error('Erreur suppression template:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'La suppression a échoué.',
      });
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={!!template} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Supprimer &laquo;&nbsp;{template?.nom}&nbsp;&raquo; ?
          </AlertDialogTitle>
          <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
