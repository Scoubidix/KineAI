'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { ProgrammeBuilder } from '../components/ProgrammeBuilder';

export default function NouveauProgrammePage() {
  return (
    <>
      <ProgrammeBuilder mode="create" />
    </>
  );
}
