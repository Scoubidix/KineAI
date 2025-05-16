'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

export function AuthGuard({ role }: { role?: 'kine' | 'patient' }) {
  useAuthGuard(role);
  return null;
}
