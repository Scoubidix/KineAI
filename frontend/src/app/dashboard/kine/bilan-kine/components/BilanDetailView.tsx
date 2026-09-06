'use client';

import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { BilanType, BILAN_TYPE_LABELS, BILAN_TYPE_COLORS } from '@/types/bilan';
import { fetchBilanRender } from '@/utils/bilanExport';

interface BilanDetailViewProps {
  bilan: { id: number; type: BilanType; motif: string | null; createdAt: string };
  onBack: () => void;
  showBackButton?: boolean;
}

export default function BilanDetailView({ bilan, onBack, showBackButton = true }: BilanDetailViewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colors = BILAN_TYPE_COLORS[bilan.type];
  const date = new Date(bilan.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetchBilanRender(bilan.id)
      .then((r) => { if (!cancelled) setHtml(r.html); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [bilan.id]);

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      <div className="flex items-center gap-2">
        {showBackButton && (
          <button type="button" onClick={onBack} aria-label="Retour" className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-[#3899aa]/10 transition-colors text-[#3899aa]">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <FileText className="w-4 h-4 text-[#3899aa] shrink-0" />
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>{BILAN_TYPE_LABELS[bilan.type]}</span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
      </div>
      {bilan.motif && <p className="text-sm font-medium px-1 truncate">{bilan.motif}</p>}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {error ? (
          <p className="text-sm text-destructive text-center py-8">{error}</p>
        ) : html === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>
        ) : (
          <div className="bilan-preview text-sm leading-relaxed p-4 rounded-lg border bg-white dark:bg-card" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
        )}
      </div>
    </div>
  );
}
