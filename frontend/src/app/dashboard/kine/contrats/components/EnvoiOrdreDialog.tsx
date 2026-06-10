'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Landmark, Loader2, Send, AlertCircle, Check } from 'lucide-react';

interface EnvoiOrdreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: number | null;
  onSent?: () => void;
}

type Stage = 'LOADING' | 'PREPARE' | 'SENT' | 'ERROR';

interface PreviewData {
  subject: string;
  html: string;
  defaultRecipientEmail: string;
  destinataire: { firstName: string; lastName: string; email: string };
  alreadySent: boolean;
  previousRecipient: string | null;
  previousSentAt: string | null;
}

export default function EnvoiOrdreDialog({ open, onOpenChange, contractId, onSent }: EnvoiOrdreDialogProps) {
  const [stage, setStage] = useState<Stage>('LOADING');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open || !contractId) return;
    let cancelled = false;
    setStage('LOADING');
    setPreview(null);
    setErrorMessage('');
    setSubmitting(false);
    (async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/ordre-email-preview`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMessage(data?.error || 'Impossible de générer l\'aperçu.');
          setStage('ERROR');
          return;
        }
        setPreview(data);
        setRecipientEmail(data.previousRecipient || data.defaultRecipientEmail || '');
        setCcEmail(data.destinataire?.email || '');
        setStage('PREPARE');
      } catch {
        if (!cancelled) {
          setErrorMessage('Erreur réseau.');
          setStage('ERROR');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, contractId]);

  const handleSend = async () => {
    if (!contractId || !recipientEmail.trim()) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/send-to-ordre`, {
        method: 'POST',
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          ccEmail: ccEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.error || 'Envoi impossible.');
        setStage('ERROR');
        return;
      }
      setStage('SENT');
      onSent?.();
    } catch {
      setErrorMessage('Erreur réseau.');
      setStage('ERROR');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl !w-[95vw] !max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <Landmark className="h-5 w-5" />
            Envoyer le contrat au Conseil départemental de l'Ordre
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {stage === 'LOADING' && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {stage === 'ERROR' && !preview && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
              <div>
                <p className="font-medium">Aperçu indisponible</p>
                <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
              </div>
            </div>
          )}

          {(stage === 'PREPARE' || (stage === 'ERROR' && preview)) && preview && (
            <>
              {preview.alreadySent && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100">
                  Ce contrat a déjà été envoyé à l'Ordre le{' '}
                  {preview.previousSentAt
                    ? new Date(preview.previousSentAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                    : ''}
                  {preview.previousRecipient && <> à <strong>{preview.previousRecipient}</strong></>}. Tu peux le renvoyer si besoin.
                </div>
              )}

              <div className="flex items-center gap-3">
                <Label htmlFor="ordre-email" className="text-xs text-muted-foreground w-8 shrink-0">À</Label>
                <Input
                  id="ordre-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="cdo@ordre-kine-XX.fr"
                  className="bg-white dark:bg-zinc-900 text-foreground"
                />
              </div>

              <div className="flex items-center gap-3">
                <Label htmlFor="cc-email" className="text-xs text-muted-foreground w-8 shrink-0">CC</Label>
                <Input
                  id="cc-email"
                  type="email"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  className="bg-white dark:bg-zinc-900 text-foreground"
                />
              </div>

              <div className="text-sm text-muted-foreground pl-11">
                Pièce jointe : <span className="font-medium text-foreground">contrat-{contractId}.pdf</span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Aperçu du mail</Label>
                <div className="rounded-lg border overflow-hidden bg-white">
                  <div className="px-3 py-2 border-b bg-muted/30 text-xs">
                    <div><span className="text-muted-foreground">Objet :</span> <strong>{preview.subject}</strong></div>
                  </div>
                  <iframe
                    srcDoc={preview.html}
                    title="Aperçu mail Ordre"
                    sandbox=""
                    className="w-full h-[360px] border-0"
                  />
                </div>
              </div>

              {stage === 'ERROR' && (
                <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                  <div className="text-xs text-red-900 dark:text-red-100">{errorMessage}</div>
                </div>
              )}
            </>
          )}

          {stage === 'SENT' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-4 flex items-start gap-2 text-sm">
                <Check className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium">Mail envoyé à l'Ordre</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Destinataire : <strong>{recipientEmail}</strong>
                    {ccEmail && (
                      <> · CC : <strong>{ccEmail}</strong></>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex items-center justify-end gap-2 bg-muted/30">
          {stage === 'SENT' ? (
            <Button onClick={() => onOpenChange(false)} className="btn-teal">Terminer</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button
                onClick={handleSend}
                disabled={submitting || stage !== 'PREPARE' || !recipientEmail.trim()}
                className="btn-teal"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Envoi...</>
                  : <><Send className="h-4 w-4 mr-1" /> Envoyer à l'Ordre</>}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
