'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { TemplateBuilder } from '../../components/TemplateBuilder';

export default function NouveauTemplatePage() {
  return (
    <>
      <TemplateBuilder mode="create" />
    </>
  );
}
