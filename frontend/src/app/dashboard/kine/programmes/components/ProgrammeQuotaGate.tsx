'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { PaywallModal } from '@/components/PaywallModal';

interface ProgrammeQuotaGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: unknown;
}

/**
 * Mini-modale d'accès + modale d'abonnement, affichées quand le quota de
 * programmes du plan est atteint. Le contrôle a lieu AVANT la sélection, pour
 * que le kiné ne construise pas un programme qu'il ne pourra pas enregistrer.
 */
export function ProgrammeQuotaGate({
  open,
  onOpenChange,
  subscription,
}: ProgrammeQuotaGateProps) {
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#3899aa]/10">
              <Lock className="h-6 w-6 text-[#3899aa]" />
            </div>
            <DialogTitle className="text-center">Limite de programmes atteinte</DialogTitle>
            <DialogDescription className="text-center">
              Tu as atteint la limite de programmes de ton plan. Passe à un plan supérieur pour en
              créer davantage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              className="btn-teal gap-2"
              onClick={() => {
                onOpenChange(false);
                setPaywallOpen(true);
              }}
            >
              Voir les plans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaywallModal
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        subscription={subscription}
      />
    </>
  );
}
