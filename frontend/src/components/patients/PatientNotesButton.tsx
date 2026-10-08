'use client';

import React, { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import NoteDialog from '@/components/patients/NoteDialog';
import type { PatientSummary } from '@/types/bilan';
import { deletePatientNote, listPatientNotes, type PatientNote } from '@/lib/patientNoteApi';

interface PatientNotesButtonProps {
  patient: PatientSummary;
  /** Classes du bouton, partagées avec les autres boutons de l'en-tête du dossier patient */
  className?: string;
}

// Bouton « Notes » du dossier patient (pastille = nombre de notes) ouvrant la liste complète,
// plus récente en haut. Même schéma que « Bilans » et « Anciens programmes ».
export default function PatientNotesButton({ patient, className }: PatientNotesButtonProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<PatientNote[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PatientNote | undefined>(undefined);
  const [toDelete, setToDelete] = useState<PatientNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPatientNotes(patient.id)
      .then((list) => { if (!cancelled) setNotes(list); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [patient.id]);

  const openCreate = () => { setEditing(undefined); setDialogOpen(true); };
  const openEdit = (note: PatientNote) => { setEditing(note); setDialogOpen(true); };

  // Modification : remplacée sur place (l'ordre suit la date de création) ; création : en tête
  const handleSaved = (saved: PatientNote) => {
    setNotes((prev) => {
      const list = prev ?? [];
      return list.some((n) => n.id === saved.id) ? list.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...list];
    });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    try {
      await deletePatientNote(patient.id, target.id);
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== target.id));
    } catch {
      toast({ variant: 'destructive', title: "La note n'a pas pu être supprimée", description: 'Réessaye dans un instant.' });
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setListOpen(true)} className={className}>
        <span className="flex items-center gap-1">
          Notes
          {notes && notes.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-[#3899aa]/10 text-[#3899aa]">
              {notes.length}
            </Badge>
          )}
        </span>
      </Button>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle>Notes de {patient.firstName} {patient.lastName}</DialogTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5 shrink-0">
              <Plus className="w-4 h-4" />
              Nouvelle note
            </Button>
          </DialogHeader>

          {loadError ? (
            <p className="text-sm text-muted-foreground italic">Impossible de charger les notes. Recharge la page.</p>
          ) : notes === null ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucune note pour ce patient.</p>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto -mx-1 px-1">
              {notes.map((note) => {
                const created = new Date(note.createdAt);
                return (
                  <li key={note.id} className="py-3 first:pt-0 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <time
                        dateTime={note.createdAt}
                        title={format(created, 'PPPp', { locale: fr })}
                        className="text-xs text-muted-foreground"
                      >
                        {formatDistanceToNow(created, { addSuffix: true, locale: fr })}
                      </time>
                      <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{note.content}</p>
                    </div>
                    {/* modal={false} : ouvrir une Dialog depuis un menu Radix modal laisse sinon
                        `pointer-events: none` sur le body (page figée après fermeture) */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Actions sur la note">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(note)}>
                          <Pencil className="w-4 h-4 mr-2" /> Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setToDelete(note)} className="text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <NoteDialog open={dialogOpen} onOpenChange={setDialogOpen} patient={patient} note={editing} onSaved={handleSaved} />

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => { if (!open) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette note ?</AlertDialogTitle>
            <AlertDialogDescription>Elle disparaîtra du dossier de {patient.firstName} {patient.lastName}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
