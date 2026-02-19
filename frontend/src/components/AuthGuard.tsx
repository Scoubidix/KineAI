'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

export function AuthGuard({ role, children }: { role?: 'kine' | 'patient'; children: React.ReactNode }) {
  const status = useAuthGuard(role);

  if (status === 'loading') return null;

  return <>{children}</>;
}
