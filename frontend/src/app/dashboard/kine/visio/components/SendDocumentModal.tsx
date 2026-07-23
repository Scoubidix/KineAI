'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, ShieldAlert, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sendDocument } from '@/lib/visioApi';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

interface SendDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seanceId: number;
}

export default function SendDocumentModal({ open, onOpenChange, seanceId }: SendDocumentModalProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setMessage('');
      setError(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!ALLOWED.includes(f.type)) { setError('Format non autorisé (PDF ou image uniquement).'); setFile(null); return; }
    if (f.size > MAX_BYTES) { setError('Fichier trop volumineux (10 Mo maximum).'); setFile(null); return; }
    setError(null);
    setFile(f);
  };

  const handleSend = async () => {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      await sendDocument(seanceId, file, message);
      toast({ title: 'Document envoyé', description: 'Le patient le recevra par email.' });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer un document au patient</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Réservé aux documents <strong>non confidentiels</strong> (fiche d'exercices, informations
              pratiques).
            </span>
          </div>

          <div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" className="w-full gap-2" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {file ? file.name : 'Choisir un fichier (PDF ou image)'}
            </Button>
          </div>

          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-[#3899aa]/40"
            placeholder="Message (optionnel)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Annuler
            </Button>
            <Button className="btn-teal gap-2" onClick={handleSend} disabled={sending || !file}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
