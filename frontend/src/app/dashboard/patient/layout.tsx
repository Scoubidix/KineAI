// app/dashboard/patient/layout.tsx
'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthGuard role="patient" />
      {children}
    </>
  );
}
