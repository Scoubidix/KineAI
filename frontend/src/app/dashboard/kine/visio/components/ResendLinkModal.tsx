'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Phone, AlertCircle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resendLink, VisioApiError, VisioChannel, VisioSeance } from '@/lib/visioApi';
import QuickContactModal from '@/components/QuickContactModal';
import { updatePatientContact } from '@/lib/patientApi';

interface ResendLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seance: VisioSeance | null;
  onResent: () => void;
}

export default function ResendLinkModal({ open, onOpenChange, seance, onResent }: ResendLinkModalProps) {
  const { toast } = useToast();
  const [channel, setChannel] = useState<VisioChannel | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mini-modal "compléter le contact manquant" (déclenchée sur NO_EMAIL / NOT_MOBILE)
  const [contactModalOpen, setContactModalOpen] = useState(false);

  useEffect(() => {
    if (open && seance) setChannel(seance.deliveryChannel);
    setError(null);
    setSending(false);
    setContactModalOpen(false);
  }, [open, seance]);

  if (!seance) return null;

  const patientName = seance.patient
    ? `${seance.patient.firstName} ${seance.patient.lastName}`
    : 'le patient';

  const handleSend = async () => {
    if (!channel) return;
    setSending(true);
    setError(null);
    try {
      await resendLink(seance.id, channel);
      toast({
        title: 'Lien renvoyé',
        description: `Le lien a été renvoyé à ${patientName} par ${channel === 'EMAIL' ? 'email' : 'WhatsApp'}.`,
      });
      onResent();
      onOpenChange(false);
    } catch (e) {
      // Contact manquant → on ouvre la mini-modal de saisie (option 1) au lieu d'un cul-de-sac
      if (e instanceof VisioApiError && (e.code === 'NO_EMAIL' || e.code === 'NOT_MOBILE')) {
        setContactModalOpen(true);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renvoyer le lien</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choisis par quel canal renvoyer le lien de séance à {patientName}.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setChannel('EMAIL'); setError(null); }}
              className={`rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.02] ${
                channel === 'EMAIL' ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'
              }`}
            >
              <Mail className="mb-2 h-5 w-5 text-[#3899aa]" />
              <div className="font-semibold">Email</div>
            </button>
            <button
              type="button"
              onClick={() => { setChannel('WHATSAPP'); setError(null); }}
              className={`rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.02] ${
                channel === 'WHATSAPP' ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'
              }`}
            >
              <Phone className="mb-2 h-5 w-5 text-[#3899aa]" />
              <div className="font-semibold">WhatsApp</div>
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Annuler
            </Button>
            <Button className="btn-teal gap-2" onClick={handleSend} disabled={sending || !channel}>
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</>
              ) : (
                <><Send className="h-4 w-4" /> Renvoyer le lien</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Mini-modal : compléter le contact manquant puis relancer le renvoi */}
      <QuickContactModal
        open={contactModalOpen}
        onOpenChange={setContactModalOpen}
        field={channel === 'WHATSAPP' ? 'phone' : 'email'}
        requireMobileFR={channel === 'WHATSAPP'}
        onSave={async (value) => {
          if (!seance.patient) return;
          const patch = channel === 'WHATSAPP' ? { phone: value } : { email: value };
          await updatePatientContact(seance.patient.id, patch);
          await handleSend(); // reprise auto du renvoi
        }}
      />
    </Dialog>
  );
}
