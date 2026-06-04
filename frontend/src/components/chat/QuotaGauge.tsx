'use client';

// Jauge discrète du quota quotidien de tokens (header de la page chat unifié).
import React from 'react';
import { Zap } from 'lucide-react';
import type { QuotaUsage } from '@/hooks/useConversations';

export function QuotaGauge({ usage }: { usage: QuotaUsage | null }) {
  if (!usage) return null;

  const percent = Math.min(100, Math.round((usage.tokensUsed / usage.limit) * 100));
  const isExhausted = usage.remaining <= 0;
  const isWarning = percent >= 80 && !isExhausted;

  return (
    <div
      className="flex items-center gap-2 ml-auto"
      title={`${usage.tokensUsed.toLocaleString('fr-FR')} / ${usage.limit.toLocaleString('fr-FR')} tokens utilisés aujourd'hui (plan ${usage.planType})`}
    >
      <Zap
        className={`h-3.5 w-3.5 ${
          isExhausted ? 'text-destructive' : isWarning ? 'text-amber-500' : 'text-[#3899aa]'
        }`}
      />
      <div className="w-20 sm:w-28 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isExhausted ? 'bg-destructive' : isWarning ? 'bg-amber-500' : 'bg-[#3899aa]'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
        {percent}%
      </span>
    </div>
  );
}
