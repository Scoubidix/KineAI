'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { TemplateBuilder } from '../../components/TemplateBuilder';

export default function NouveauTemplatePage() {
  return (
    <>
      <AuthGuard role="kine" />
      <TemplateBuilder mode="create" />
    </>
  );
}
