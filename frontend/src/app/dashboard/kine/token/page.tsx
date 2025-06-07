'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export default function TestToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const idToken = await user.getIdToken();
        setToken(idToken);
      } else {
        setToken(null);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Firebase ID Token</h1>
      {token ? (
        <pre className="bg-gray-100 p-2 text-sm break-all">{token}</pre>
      ) : (
        <p className="text-red-500">Aucun utilisateur connecté.</p>
      )}
    </div>
  );
}
