'use client';

import React from 'react';
import PionniersChat from '@/components/pionniers/PionniersChat';

export default function GroupePionniersPage() {
  return (
    <div className="flex h-[calc(100dvh-130px)] flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Groupe Pionniers</h1>
        <p className="text-sm text-muted-foreground">
          Le salon des membres du plan Pionnier.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <PionniersChat />
      </div>
    </div>
  );
}
