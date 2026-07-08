"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth } from "@/utils/fetchWithAuth";

/**
 * Bannière opt-in : proposée aux kinés FREE jamais passés par un essai ni un
 * checkout Stripe (subscription.trialEligible). Démarre l'essai au clic.
 * En cas de succès, recharge la page pour que TrialWelcomeModal se déclenche.
 */
export default function TrialOptInBanner() {
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const startTrial = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/kine/trial/start`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("start failed");

      // Signal one-shot : garantit que TrialWelcomeModal s'affiche après le reload,
      // de façon déterministe (indépendant du refetch d'abonnement et du flag
      // one-shot par UID, qui pourrait déjà être posé).
      sessionStorage.setItem("trial_just_started", "1");
      window.location.reload();
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de démarrer l'essai. Réessaie dans un instant.",
      });
      setLoading(false);
    }
  };

  if (!subscription?.trialEligible) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
      <div className="flex items-center gap-2 text-sm text-amber-900">
        <Crown className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">Essaie gratuitement toutes les fonctionnalités</span>{" "}
          pendant 14 jours, sans carte bancaire.
        </span>
      </div>
      <button
        onClick={startTrial}
        disabled={loading}
        className="btn-teal shrink-0 h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Activation…" : "Démarrer mon essai"}
      </button>
    </div>
  );
}
