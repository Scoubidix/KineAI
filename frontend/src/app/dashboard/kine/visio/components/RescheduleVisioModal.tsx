'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { rescheduleSeance, VisioSeance } from '@/lib/visioApi';
import VisioDateTimePicker from './VisioDateTimePicker';

// Convertit un ISO en valeur pour <input type="datetime-local"> (heure locale)
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface RescheduleVisioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seance: VisioSeance | null;
  onRescheduled: () => void;
}

export default function RescheduleVisioModal({
  open,
  onOpenChange,
  seance,
  onRescheduled,
}: RescheduleVisioModalProps) {
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seance) setValue(toLocalInput(seance.scheduledAt));
    setError(null);
  }, [seance, open]);

  if (!seance) return null;

  const channelLabel = seance.deliveryChannel === 'WHATSAPP' ? 'WhatsApp' : 'email';

  const handleSave = async () => {
    if (!value) return;
    const iso = new Date(value).toISOString();
    if (new Date(iso).getTime() < Date.now()) {
      setError('Choisis une date et une heure futures.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await rescheduleSeance(seance.id, iso);
      toast({
        title: 'Horaire modifié',
        description: `Un nouveau lien a été renvoyé au patient par ${channelLabel}.`,
      });
      onRescheduled();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l&apos;horaire</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {seance.patient && (
            <p className="text-sm text-muted-foreground">
              {seance.patient.firstName} {seance.patient.lastName}
            </p>
          )}

          <VisioDateTimePicker
            key={seance.id}
            initialValue={toLocalInput(seance.scheduledAt)}
            onChange={setValue}
          />

          <p className="flex items-start gap-2 rounded-md bg-blue-50 p-2.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            {seance.deliveryChannel === 'WHATSAPP' ? (
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            En validant, un nouveau lien sera automatiquement renvoyé au patient par {channelLabel}.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button className="btn-teal" onClick={handleSave} disabled={saving || !value}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement…
              </>
            ) : (
              'Enregistrer et renvoyer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
