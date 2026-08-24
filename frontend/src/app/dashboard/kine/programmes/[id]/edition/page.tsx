'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { ProgrammeBuilder } from '../../components/ProgrammeBuilder';

export default function EditionProgrammePage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const programmeId = Number(rawId);

  if (!Number.isFinite(programmeId)) {
    return (
      <>
        <AuthGuard role="kine" />
        <p className="text-muted-foreground py-16 text-center">Programme introuvable.</p>
      </>
    );
  }

  return (
    <>
      <AuthGuard role="kine" />
      <ProgrammeBuilder mode="edit" programmeId={programmeId} />
    </>
  );
}
