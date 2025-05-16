'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase/config';

export function useAuthGuard(requiredRole?: 'kine' | 'patient') {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.warn('[AuthGuard] Pas connecté → redirect /login');
        router.replace('/login');
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.warn('[AuthGuard] Utilisateur introuvable dans Firestore → redirect /unauthorized');
        router.replace('/unauthorized');
        return;
      }

      const role = userSnap.data().role;

      if (requiredRole && role !== requiredRole) {
        console.warn(`[AuthGuard] Rôle "${role}" interdit pour "${pathname}" → redirect /unauthorized`);
        router.replace('/unauthorized');
        return;
      }

      // ✅ OK : connecté et rôle correct
    });

    return () => unsubscribe();
  }, [router, requiredRole, pathname]);
}
