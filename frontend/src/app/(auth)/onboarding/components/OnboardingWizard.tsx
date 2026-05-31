'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { normalizeFirstName, normalizeLastName } from '@/utils/nameNormalization';
import { useToast } from '@/hooks/use-toast';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

type Step = 'LAST_NAME' | 'FIRST_NAME' | 'CTA';

export default function OnboardingWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('LAST_NAME');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Preview live UX uniquement — l'envoi au backend se fait en valeurs brutes,
  // le backend reste la source de vérité pour la normalisation.
  const previewLastName = normalizeLastName(lastName);
  const previewFirstName = normalizeFirstName(firstName);

  const goForward = (next: Step) => {
    setDirection('forward');
    setStep(next);
  };

  const goBackward = (prev: Step) => {
    setDirection('backward');
    setStep(prev);
  };

  const handleSubmitNames = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setSubmitting(true);
    try {
      const user = getAuth(app).currentUser;
      if (!user) throw new Error('Utilisateur non connecté');
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Envoi des valeurs brutes — le backend normalise (single source of truth)
        body: JSON.stringify({ firstName, lastName }),
      });
      if (res.status === 401) {
        // Token expiré ou invalide : on renvoie vers le login plutôt que de toaster
        router.replace('/login');
        return;
      }
      if (!res.ok) throw new Error('Échec de la sauvegarde');
      goForward('CTA');
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: "Impossible d'enregistrer pour le moment. Réessayez.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex justify-center pt-20 p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <Image src="/logo.png" alt="Mon Assistant Kiné" width={100} height={100} className="rounded-xl" priority />
        </div>

        {/* Conteneur d'étape avec transition slide horizontale */}
        <div
          key={step}
          className={`space-y-6 ${
            direction === 'forward' ? 'animate-slide-from-right' : 'animate-slide-from-left'
          }`}
        >
          {step === 'LAST_NAME' && (
            <>
              <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
                Bonjour ! Pour finaliser votre inscription, quel est votre nom ?
              </h1>
              <div className="space-y-1">
                <label htmlFor="lastName" className="text-sm font-medium text-gray-700">Nom</label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Dupont"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoFocus
                  className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                {previewLastName && (
                  <p className="text-xs text-gray-500">
                    Sera enregistré : <span className="font-medium text-gray-700">{previewLastName}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => goForward('FIRST_NAME')}
                disabled={!previewLastName}
                className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Suivant
              </button>
            </>
          )}

          {step === 'FIRST_NAME' && (
            <>
              <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
                Et votre prénom ?
              </h1>
              <div className="space-y-1">
                <label htmlFor="firstName" className="text-sm font-medium text-gray-700">Prénom</label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Jean"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                  className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                {previewFirstName && (
                  <p className="text-xs text-gray-500">
                    Sera enregistré : <span className="font-medium text-gray-700">{previewFirstName}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => goBackward('LAST_NAME')}
                  disabled={submitting}
                  className="flex-1 h-11 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  ← Retour
                </button>
                <button
                  onClick={handleSubmitNames}
                  disabled={!previewFirstName || submitting}
                  className="btn-teal flex-1 h-11 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Suivant'}
                </button>
              </div>
            </>
          )}

          {step === 'CTA' && (
            <>
              <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
                Parfait, {previewFirstName} ! Votre compte est prêt.
              </h1>
              <p className="text-sm text-gray-600 text-center">
                Souhaitez-vous compléter votre profil professionnel maintenant
                (utile pour générer vos contrats, courriers et factures) ou plus tard ?
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/dashboard/kine/home?openProfile=true')}
                  className="btn-teal w-full h-11 rounded-lg text-sm font-medium"
                >
                  Compléter mes infos pro
                </button>
                <button
                  onClick={() => router.push('/dashboard/kine/home')}
                  className="w-full h-11 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Plus tard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
