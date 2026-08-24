'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { TemplateBuilder } from '../../../components/TemplateBuilder';

export default function EditionTemplatePage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const templateId = Number(rawId);

  if (!Number.isFinite(templateId)) {
    return (
      <>
        <AuthGuard role="kine" />
        <p className="text-muted-foreground py-16 text-center">Template introuvable.</p>
      </>
    );
  }

  return (
    <>
      <AuthGuard role="kine" />
      <TemplateBuilder mode="edit" templateId={templateId} />
    </>
  );
}
