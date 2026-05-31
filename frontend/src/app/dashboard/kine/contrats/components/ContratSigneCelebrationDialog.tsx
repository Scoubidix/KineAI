'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { CheckCircle2, Download, Landmark, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

export interface RecentlyCompletedContract {
  id: number;
  type: 'REMPLACEMENT_LIBERAL' | 'ASSISTANAT_LIBERAL';
  destinataireFirstName: string;
  destinataireLastName: string;
  destinataireEmail: string;
  completedAt: string;
  ordreSentAt: string | null;
}

interface Props {
  open: boolean;
  contracts: RecentlyCompletedContract[];
  onClose: () => void;
  onSendToOrdre: (contractId: number) => void;
}

const TYPE_LABELS: Record<RecentlyCompletedContract['type'], string> = {
  REMPLACEMENT_LIBERAL: 'remplacement libéral',
  ASSISTANAT_LIBERAL: 'assistanat libéral',
};

export default function ContratSigneCelebrationDialog({ open, contracts, onClose, onSendToOrdre }: Props) {
  const { toast } = useToast();
  const [index, setIndex] = useState(0);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (contracts.length === 0) return null;
  const safeIndex = Math.min(index, contracts.length - 1);
  const current = contracts[safeIndex];
  const destFullName = `${current.destinataireFirstName} ${current.destinataireLastName}`.trim();
  const contractLabel = TYPE_LABELS[current.type] || 'collaboration';
  const completedAtFr = current.completedAt
    ? new Date(current.completedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const handleDownload = async () => {
    setDownloadingId(current.id);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${current.id}/final-pdf`);
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'PDF indisponible', description: data?.error || 'Erreur', variant: 'destructive' });
        return;
      }
      window.open(data.url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {contracts.length > 1 ? `${contracts.length} contrats signés` : 'Contrat signé !'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="rounded-lg border-2 border-green-300 bg-green-50 dark:bg-green-950/20 p-4">
            <p className="text-sm leading-relaxed">
              <strong>{destFullName}</strong> a signé son contrat de <strong>{contractLabel}</strong>.
            </p>
            {completedAtFr && (
              <p className="text-xs text-muted-foreground mt-2">Signé le {completedAtFr}</p>
            )}
            {current.ordreSentAt && (
              <p className="text-xs text-green-700 dark:text-green-300 mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Déjà envoyé à l'Ordre
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={downloadingId === current.id}
              className="flex-1"
            >
              {downloadingId === current.id
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> ...</>
                : <><Download className="h-4 w-4 mr-1" /> Télécharger</>}
            </Button>
            <Button
              onClick={() => onSendToOrdre(current.id)}
              className="btn-teal flex-1"
            >
              <Landmark className="h-4 w-4 mr-1" /> Envoyer à l'Ordre
            </Button>
          </div>

          {contracts.length > 1 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIndex(Math.max(0, safeIndex - 1))}
                disabled={safeIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                {safeIndex + 1} / {contracts.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIndex(Math.min(contracts.length - 1, safeIndex + 1))}
                disabled={safeIndex === contracts.length - 1}
              >
                Suivant <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Plus tard
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
