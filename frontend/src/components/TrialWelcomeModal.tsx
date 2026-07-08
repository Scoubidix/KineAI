"use client";

import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { Crown, CheckCircle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Modal de bienvenue plein-écran, affiché une seule fois quand l'essai Expert
 * vient d'être activé. Idempotent via un flag localStorage par UID.
 * Se ferme UNIQUEMENT via le bouton CTA — le fond sombre n'est pas cliquable.
 */
export default function TrialWelcomeModal() {
  const { subscription } = useSubscription();
  const [open, setOpen] = useState(false);
  const evaluatedRef = useRef(false);

  useEffect(() => {
    if (evaluatedRef.current) return;

    // Chemin opt-in explicite : signal one-shot posé par la bannière avant le reload.
    // On force l'affichage indépendamment du refetch et du flag one-shot par UID
    // (l'utilisateur vient de démarrer volontairement son essai → on célèbre).
    if (typeof window !== "undefined" && sessionStorage.getItem("trial_just_started")) {
      evaluatedRef.current = true;
      sessionStorage.removeItem("trial_just_started");
      const uid = getAuth().currentUser?.uid;
      if (uid) localStorage.setItem(`trial_welcome_shown:${uid}`, "1");
      setOpen(true);
      document.body.style.overflow = "hidden";
      return;
    }

    // Chemin inscription : essai actif détecté, affiché une seule fois par UID.
    if (!subscription?.isTrialing) return;

    const uid = getAuth().currentUser?.uid;
    if (!uid) return;

    evaluatedRef.current = true;

    const key = `trial_welcome_shown:${uid}`;
    if (localStorage.getItem(key)) return;

    // Marquer immédiatement pour éviter tout re-affichage (remontage, navigation)
    localStorage.setItem(key, "1");
    setOpen(true);
    document.body.style.overflow = "hidden";
  }, [subscription]);

  // Nettoyage scroll si le composant se démonte alors que la modal est ouverte
  useEffect(() => {
    return () => {
      if (open) {
        document.body.style.overflow = "";
      }
    };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    document.body.style.overflow = "";
  };

  if (!open) return null;

  const features = [
    "Programmes patients illimités",
    "Génération de bilans IA",
    "Module administratif (courriers & templates)",
    "Assistant IA — usage maximal",
  ];

  return (
    /* Overlay — pas cliquable pour fermer */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-200"
      // Clic sur le fond = ignoré intentionnellement
    >
      {/* Carte modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in-0 duration-300"
      >
        {/* En-tête gradient */}
        <div className="bg-gradient-to-br from-[#3899aa] to-[#1f5c6a] px-6 py-8 text-center text-white">
          <span className="inline-flex items-center justify-center bg-white/20 rounded-full p-3 mb-4">
            <Crown className="h-7 w-7 text-white" />
          </span>
          <h2 className="text-xl font-bold leading-snug mb-1">
            Ton essai Expert est lancé 🎉
          </h2>
          <p className="text-sm text-white/85">
            14 jours d'accès complet à tout — sans carte bancaire.
          </p>
        </div>

        {/* Corps — liste des fonctionnalités débloquées */}
        <div className="px-6 py-5">
          <ul className="space-y-3">
            {features.map((feat) => (
              <li key={feat} className="flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
                <CheckCircle className="h-5 w-5 shrink-0 text-[#3899aa]" />
                {feat}
              </li>
            ))}
          </ul>
        </div>

        {/* Pied — bouton CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={handleClose}
            className="btn-teal w-full h-11 rounded-lg font-semibold text-sm"
          >
            C'est parti 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
