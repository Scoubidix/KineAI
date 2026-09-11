'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FolderOpen, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { listMyBilans, deleteBilan } from '@/utils/bilanApi';
import { BILAN_TYPE_LABELS, type BilanListItem } from '@/types/bilan';
import { formatRelative, jobLabel } from './DraftsRow';

interface DraftsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

// « Mes brouillons » : tous les bilans non enregistrés, ouvrir ou supprimer
export default function DraftsModal({ open, onOpenChange, onChanged }: DraftsModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<BilanListItem[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    listMyBilans({ statuses: ['BROUILLON', 'GENERE'], limit: 100 }).then((l) => { if (!cancelled) setItems(l); }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [open]);

  const handleDelete = async (id: number) => {
    try {
      await deleteBilan(id);
      setItems((prev) => (prev ?? []).filter((b) => b.id !== id));
      onChanged();
      toast({ title: 'Brouillon supprimé' });
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]"><FolderOpen className="h-5 w-5" />Mes brouillons</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2">
          {items === null && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>}
          {items && items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucun brouillon en cours</p>}
          {items?.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-lg border border-border/60 p-3">
              <button type="button" onClick={() => { onOpenChange(false); router.push(`/dashboard/kine/bilan-kine/${b.id}`); }} className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">{b.patient ? `${b.patient.firstName} ${b.patient.lastName.toUpperCase()}` : 'Sans patient'} · {BILAN_TYPE_LABELS[b.type]}</div>
                <div className="text-xs text-muted-foreground">{jobLabel(b) ? `${jobLabel(b)} · ` : ''}{b.motif || 'Sans motif'} · {formatRelative(b.updatedAt)}</div>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Supprimer" className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce brouillon ?</AlertDialogTitle>
                    <AlertDialogDescription>Le brouillon et ses notes seront définitivement supprimés.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(b.id)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
