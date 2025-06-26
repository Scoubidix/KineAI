'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

export function useAuthGuard(requiredRole?: 'kine' | 'patient') {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const auth = getAuth(app);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        // Récupérer les données utilisateur depuis PostgreSQL
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
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
        
      } catch (error) {
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router, requiredRole, pathname]);
}