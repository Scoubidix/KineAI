// app/dashboard/kine/layout.tsx
'use client';

import { Suspense } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import AppLayout from '@/components/AppLayout';

export default function KineLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard role="kine">
      {/* AppLayout (sidebar + header) monté ici → persistant entre les navigations,
          plus de remount ni de flash avatar/plan. Suspense requis car AppLayout
          utilise useSearchParams. */}
      <Suspense fallback={null}>
        <AppLayout>{children}</AppLayout>
      </Suspense>
    </AuthGuard>
  );
}
