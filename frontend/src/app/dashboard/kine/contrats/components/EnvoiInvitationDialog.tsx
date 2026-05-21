'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Mail, Loader2, Send, Check, AlertCircle, RotateCcw } from 'lucide-react';

interface EnvoiInvitationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: number | null;
  destinataireEmail: string;
  onSent?: () => void;
}

type Stage = 'PREPARE' | 'SENT' | 'ERROR';

function formatExpiration(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return null;
  }
}

export default function EnvoiInvitationDialog({
  open, onOpenChange, contractId, destinataireEmail, onSent
}: EnvoiInvitationDialogProps) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('PREPARE');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStage('PREPARE');
      setSubmitting(false);
      setErrorMessage('');
      setExpiresAt(null);
    }
  }, [open]);

  const handleSend = async () => {
    if (!contractId) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/send-invitation`, {
        method: 'POST',
        body: JSON.stringify({ channel: 'EMAIL' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.error || 'Envoi impossible. Veuillez réessayer.');
        setStage('ERROR');
        return;
      }
      setExpiresAt(data.expiresAt || null);
      setStage('SENT');
      toast({ title: 'Email envoyé', description: `Invitation envoyée à ${destinataireEmail}.` });
      onSent?.();
    } catch {
      setErrorMessage('Erreur réseau. Veuillez réessayer.');
      setStage('ERROR');
    } finally {
      setSubmitting(false);
    }
  };

  const expirationLabel = formatExpiration(expiresAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <Mail className="h-5 w-5" />
            Envoyer le contrat pour signature
          </DialogTitle>
          <DialogDescription>
            Un lien sécurisé sera envoyé à <strong>{destinataireEmail}</strong>.
          </DialogDescription>
        </DialogHeader>

        {stage === 'PREPARE' && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-[#3899aa]/30 bg-[#3899aa]/5 p-3 text-sm">
              <p>
                Nous envoyons l'email directement depuis Mon Assistant Kiné. Le destinataire reçoit un lien sécurisé,
                valable 7 jours, pour consulter et signer le contrat. Toutes les réponses arriveront sur votre adresse email.
              </p>
            </div>
            <Button onClick={handleSend} disabled={submitting} className="w-full btn-teal">
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Envoi en cours...</>
                : <><Send className="h-4 w-4 mr-1" /> Envoyer l'invitation</>}
            </Button>
          </div>
        )}

        {stage === 'SENT' && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
              <div>
                <p className="font-medium">Email envoyé à {destinataireEmail}</p>
                {expirationLabel && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Le lien est valable jusqu'au {expirationLabel}.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </div>
          </div>
        )}

        {stage === 'ERROR' && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
              <div>
                <p className="font-medium">Envoi impossible</p>
                <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleSend} disabled={submitting} className="btn-teal flex-1">
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Nouvel essai...</>
                  : <><RotateCcw className="h-4 w-4 mr-1" /> Réessayer</>}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
