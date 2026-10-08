'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import PatientCombobox from '@/components/patients/PatientCombobox';
import type { PatientSummary } from '@/types/bilan';
import { createPatientNote, updatePatientNote, NOTE_MAX_LENGTH, type PatientNote } from '@/lib/patientNoteApi';

// Le compteur n'apparaît qu'à l'approche de la limite
const COUNTER_FROM = 1800;

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Patient fixé (dossier patient). Absent : le kiné choisit le patient (dashboard). */
  patient?: PatientSummary;
  /** Note à modifier. Absente : création. */
  note?: PatientNote;
  onSaved?: (note: PatientNote, patient: PatientSummary) => void;
}

// Modale commune : note rapide depuis le dashboard (choix du patient) ou depuis le dossier patient.
export default function NoteDialog({ open, onOpenChange, patient, note, onSaved }: NoteDialogProps) {
  const [selected, setSelected] = useState<PatientSummary | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Garde synchrone contre le double envoi. Après un succès elle reste levée jusqu'à la prochaine
  // ouverture : la modale reste cliquable pendant son animation de fermeture.
  const savingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Réinitialisation à l'ouverture seulement : dépendre de `patient`/`note` effacerait la saisie
  // à chaque rendu du parent si celui-ci passe un objet construit inline.
  useEffect(() => {
    if (!open) return;
    setSelected(patient ?? null);
    setContent(note?.content ?? '');
    setError(null);
    setSaving(false);
    savingRef.current = false;
  }, [open]);

  const target = patient ?? selected;
  const trimmed = content.trim();
  const canSave = !!target && trimmed.length > 0 && !saving;

  // Patient choisi : le focus passe directement à la zone de texte
  const handlePatientChange = (p: PatientSummary | null) => {
    setSelected(p);
    if (p) requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSave = async () => {
    if (!canSave || !target || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = note
        ? await updatePatientNote(target.id, note.id, trimmed)
        : await createPatientNote(target.id, trimmed);
      onSaved?.(saved, target);
      onOpenChange(false);
    } catch {
      // Le texte reste dans la modale : rien n'est perdu
      setError("La note n'a pas pu être enregistrée. Réessaye.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Pas de description visible : aria-describedby={undefined} évite l'avertissement Radix */}
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{note ? 'Modifier la note' : 'Nouvelle note'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!patient && <PatientCombobox value={selected} onChange={handlePatientChange} />}
          <div className="space-y-1.5">
            <Label htmlFor="patient-note-content">Note</Label>
            <Textarea
              id="patient-note-content"
              ref={textareaRef}
              autoFocus={!!patient}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={NOTE_MAX_LENGTH}
              rows={5}
              placeholder="Ce que tu as fait, une mesure, un rappel…"
              className="min-h-[120px] max-h-[50vh] [field-sizing:content]"
            />
            {content.length >= COUNTER_FROM && (
              <p className="text-right text-xs text-muted-foreground">{content.length} / {NOTE_MAX_LENGTH}</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
