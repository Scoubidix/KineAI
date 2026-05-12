'use client';

import React from 'react';
import DOMPurify from 'dompurify';
import { ArrowLeft, FileText } from 'lucide-react';
import { BilanType, BILAN_TYPE_LABELS, BILAN_TYPE_COLORS } from '@/types/bilan';

interface BilanDetailViewProps {
  bilan: {
    id: number;
    type: BilanType;
    motif: string | null;
    createdAt: string;
    bilanHtml: string | null;
  };
  onBack: () => void;
  // Si true, le header inclut une flèche retour cliquable. Si false, le retour est géré ailleurs.
  showBackButton?: boolean;
}

export default function BilanDetailView({
  bilan,
  onBack,
  showBackButton = true,
}: BilanDetailViewProps) {
  const colors = BILAN_TYPE_COLORS[bilan.type];
  const date = new Date(bilan.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      <div className="flex items-center gap-2">
        {showBackButton && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-[#3899aa]/10 transition-colors text-[#3899aa]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <FileText className="w-4 h-4 text-[#3899aa] shrink-0" />
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
          >
            {BILAN_TYPE_LABELS[bilan.type]}
          </span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
      </div>

      {bilan.motif && (
        <p className="text-sm font-medium px-1 truncate">{bilan.motif}</p>
      )}

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {bilan.bilanHtml ? (
          <div
            className="text-sm leading-relaxed p-4 rounded-lg border bg-gray-50 dark:bg-gray-800/50"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bilan.bilanHtml) }}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic text-center py-8">
            Ce bilan n'a pas encore de compte-rendu généré.
          </p>
        )}
      </div>
    </div>
  );
}
