'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveCompteRendu, downloadCompteRenduPdf } from '@/lib/visioApi';

interface CompteRenduModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seanceId: number;
  initialValue?: string;
  onSaved?: (text: string) => void;
}

export default function CompteRenduModal({
  open,
  onOpenChange,
  seanceId,
  initialValue = '',
  onSaved,
}: CompteRenduModalProps) {
  const { toast } = useToast();
  const [text, setText] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(initialValue);
      setSavedOnce(false);
      setError(null);
    }
  }, [open, initialValue]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCompteRendu(seanceId, text);
      setSavedOnce(true);
      toast({ title: 'Compte-rendu enregistré' });
      onSaved?.(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePdf = async () => {
    setPdfLoading(true);
    setError(null);
    try {
      // Enregistrer d'abord si le texte a changé, pour que le PDF reflète la saisie
      await saveCompteRendu(seanceId, text);
      onSaved?.(text);
      await downloadCompteRenduPdf(seanceId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compte-rendu de séance</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <textarea
            className="min-h-[240px] w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-[#3899aa]/40"
            placeholder="Observations, évolution, consignes données au patient…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" onClick={handlePdf} disabled={pdfLoading || saving || !text.trim()} className="gap-2">
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Exporter en PDF
          </Button>
          <Button className="btn-teal gap-2" onClick={handleSave} disabled={saving || pdfLoading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedOnce ? <Check className="h-4 w-4" /> : null}
            {savedOnce ? 'Enregistré' : 'Enregistrer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
