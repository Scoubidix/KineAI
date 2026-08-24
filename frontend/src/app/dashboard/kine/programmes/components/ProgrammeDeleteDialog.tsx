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
import type { ProgrammeListItem } from '@/hooks/useProgrammesList';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface ProgrammeDeleteDialogProps {
  programme: ProgrammeListItem | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function ProgrammeDeleteDialog({
  programme,
  onOpenChange,
  onDeleted,
}: ProgrammeDeleteDialogProps) {
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!programme) return;
    try {
      const res = await fetchWithAuth(`${apiUrl}/programmes/${programme.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      onOpenChange(false);
      onDeleted();
      toast({ title: 'Programme supprimé', duration: 3000 });
    } catch (error) {
      console.error('Erreur suppression programme:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'La suppression a échoué.',
      });
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={!!programme} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Supprimer &laquo;&nbsp;{programme?.titre}&nbsp;&raquo; ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {programme?.patient.firstName} {programme?.patient.lastName} perdra l&apos;accès à ce
            programme : son lien cessera de fonctionner immédiatement. Cette action est
            irréversible.
          </AlertDialogDescription>
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
