'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { fetchWithRetry, isNetworkError } from '@/utils/fetchWithAuth';

export function useAuthGuard(requiredRole?: 'kine' | 'patient') {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'loading' | 'authenticated'>('loading');

  useEffect(() => {
    const auth = getAuth(app);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        // Récupérer les données utilisateur depuis PostgreSQL
        const response = await fetchWithRetry(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            router.replace('/unauthorized');
            return;
          }
          throw new Error('Erreur lors de la vérification du profil');
        }

        const userData = await response.json();
        const role = 'kine'; // Pour l'instant, tous les utilisateurs sont des kinés

        if (requiredRole && role !== requiredRole) {
          router.replace('/unauthorized');
          return;
        }

        // Redirect onboarding : tant que firstName ou lastName est vide en DB,
        // le kiné doit passer par le wizard. Le test couvre null, undefined et "".
        const onboardingPending = !userData.firstName || !userData.lastName;
        if (onboardingPending && pathname !== '/onboarding') {
          router.replace('/onboarding');
          return;
        }
        // Inverse : si déjà onboardé et qu'on traîne sur /onboarding, retour dashboard.
        if (!onboardingPending && pathname === '/onboarding') {
          router.replace('/dashboard/kine/home');
          return;
        }

        setStatus('authenticated');

      } catch (error) {
        // Réseau coupé : Firebase a bien un utilisateur, rien ne dit qu'il est
        // déconnecté. On laisse la page s'afficher (ses appels montreront l'erreur
        // réseau) ; le backend vérifie de toute façon le token à chaque appel.
        if (isNetworkError(error)) {
          setStatus('authenticated');
          return;
        }
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router, requiredRole, pathname]);

  return status;
}
