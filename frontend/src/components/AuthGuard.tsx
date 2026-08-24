'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

// `children` est optionnel : AuthGuard sert soit d'enveloppe, soit de simple
// garde auto-fermee (<AuthGuard role="kine" />), comme sur la plupart des pages.
export function AuthGuard({ role, children }: { role?: 'kine' | 'patient'; children?: React.ReactNode }) {
  const status = useAuthGuard(role);

  if (status === 'loading') return null;

  return <>{children}</>;
}
