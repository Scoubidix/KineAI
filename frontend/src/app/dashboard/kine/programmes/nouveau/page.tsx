'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { ProgrammeBuilder } from '../components/ProgrammeBuilder';

export default function NouveauProgrammePage() {
  return (
    <>
      <AuthGuard role="kine" />
      <ProgrammeBuilder mode="create" />
    </>
  );
}
