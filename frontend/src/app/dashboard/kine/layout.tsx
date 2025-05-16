// app/dashboard/kine/layout.tsx
'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function KineLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthGuard role="kine" />
      {children}
    </>
  );
}
