'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;
const TITRE_MAX = 120;
const DESCRIPTION_MAX = 2000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: { id: number; titre: string } | null; // card concernée (optionnelle)
}

export default function ProposerIdeeDialog({ open, onOpenChange, item = null }: Props) {
  const { toast } = useToast();
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const titreOk = titre.trim().length >= 3 && titre.trim().length <= TITRE_MAX;
  const descriptionOk = description.trim().length >= 10 && description.trim().length <= DESCRIPTION_MAX;
  const canSend = titreOk && descriptionOk && !sending;

  const reset = () => {
    setTitre('');
    setDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetchWithAuth(`${API}/api/roadmap/idees`, {
        method: 'POST',
        body: JSON.stringify({ titre: titre.trim(), description: description.trim(), ...(item ? { itemId: item.id } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        toast({ title: 'Doucement !', description: 'Tu as déjà envoyé beaucoup d\'idées, réessaie dans une heure.', variant: 'destructive' });
        return;
      }
      if (!res.ok || !data.success) {
        toast({ title: 'Envoi impossible', description: data.error || 'Réessaie dans un instant.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Merci !', description: 'Ton idée est bien arrivée, on la lit avec attention.' });
      reset();
      onOpenChange(false);
    } catch {
      toast({ title: 'Envoi impossible', description: 'Vérifie ta connexion et réessaie.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Proposer une idée</DialogTitle>
            <DialogDescription>
              Une fonctionnalité qui te manque, une amélioration, un irritant : dis-nous tout.
            </DialogDescription>
            {item && (
              <p className="mt-2 rounded-md bg-[#3899aa]/10 px-3 py-2 text-sm text-[#3899aa]">
                À propos de : <span className="font-medium">{item.titre}</span>
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="idee-titre">Titre</Label>
              <Input
                id="idee-titre"
                value={titre}
                maxLength={TITRE_MAX}
                placeholder="Ex. : export PDF du bilan"
                onChange={(e) => setTitre(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-gray-500 text-right">{titre.length}/{TITRE_MAX}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idee-description">Description</Label>
              <Textarea
                id="idee-description"
                value={description}
                maxLength={DESCRIPTION_MAX}
                rows={5}
                placeholder="Décris le besoin, le contexte, ce que ça changerait pour toi."
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-gray-500 text-right">{description.length}/{DESCRIPTION_MAX}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSend} className="bg-[#3899aa] hover:bg-[#2f8393] text-white">
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
