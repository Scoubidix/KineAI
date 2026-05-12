'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, History, FileText, Eye } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import {
  BilanType,
  BILAN_TYPE_LABELS,
  BILAN_TYPE_COLORS,
  StructuredData,
} from '@/types/bilan';
import BilanDetailView from './BilanDetailView';

interface BilanSummary {
  id: number;
  motif: string | null;
  type: BilanType;
  createdAt: string;
}

export interface SelectedBilan {
  id: number;
  type: BilanType;
  createdAt: string;
  motif: string | null;
  structuredData: StructuredData | null;
  bilanHtml: string | null;
}

interface CompareWithPreviousModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  initialSelectedIds?: number[];
  onSelect: (bilans: SelectedBilan[]) => void;
}

export default function CompareWithPreviousModal({
  open,
  onOpenChange,
  patientId,
  initialSelectedIds = [],
  onSelect,
}: CompareWithPreviousModalProps) {
  const [bilans, setBilans] = useState<BilanSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(initialSelectedIds));
  const [previewing, setPreviewing] = useState<SelectedBilan | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(initialSelectedIds));
    setPreviewing(null);

    const fetchBilans = async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setBilans(json.bilans);
      } finally {
        setLoading(false);
      }
    };

    fetchBilans();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId]);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePreview = async (b: BilanSummary) => {
    setPreviewLoadingId(b.id);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans/${b.id}`,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      setPreviewing({
        id: b.id,
        type: b.type,
        createdAt: b.createdAt,
        motif: b.motif,
        structuredData: json.bilan.structuredData ?? null,
        bilanHtml: json.bilan.bilanHtml ?? null,
      });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      // Sélection vide → on retire toutes les comparaisons (UX : cocher/décocher
      // puis valider est le seul chemin pour purger la sélection).
      if (selectedIds.size === 0) {
        onSelect([]);
        onOpenChange(false);
        return;
      }
      const selected = bilans.filter((b) => selectedIds.has(b.id));
      // Charge en parallèle les structuredData de chaque bilan sélectionné
      const fullBilans = await Promise.all(
        selected.map(async (b) => {
          try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans/${b.id}`);
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success) return null;
            return {
              id: b.id,
              type: b.type,
              createdAt: b.createdAt,
              motif: b.motif,
              structuredData: json.bilan.structuredData ?? null,
              bilanHtml: json.bilan.bilanHtml ?? null,
            } as SelectedBilan;
          } catch {
            return null;
          }
        })
      );
      const filtered = fullBilans.filter((b): b is SelectedBilan => b !== null);
      onSelect(filtered);
      onOpenChange(false);
    } finally {
      setValidating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`w-[95vw] max-h-[90vh] flex flex-col ${
          previewing ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        {previewing ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
                <FileText className="w-5 h-5" />
                Aperçu du bilan
              </DialogTitle>
            </DialogHeader>

            <BilanDetailView
              bilan={previewing}
              onBack={() => setPreviewing(null)}
            />

            <div className="flex justify-end pt-2 border-t border-border/40">
              <Button
                variant="outline"
                onClick={() => setPreviewing(null)}
                className="rounded-full h-9 text-sm"
              >
                Retour à la sélection
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
                <History className="w-5 h-5" />
                Comparer avec des bilans antérieurs
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground -mt-2">
              Cochez un ou plusieurs bilans à inclure dans la comparaison. Les valeurs du bilan le plus récent sélectionné pré-rempliront vos mesures.
            </p>

            <div className="max-h-80 overflow-y-auto space-y-1.5 mt-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[#3899aa]" />
                </div>
              ) : bilans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aucun bilan antérieur pour ce patient
                </p>
              ) : (
                bilans.map((b) => {
                  const colors = BILAN_TYPE_COLORS[b.type];
                  const date = new Date(b.createdAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  });
                  const checked = selectedIds.has(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        checked
                          ? 'border-[#3899aa]/60 bg-[#3899aa]/5'
                          : 'border-border/50 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5'
                      }`}
                    >
                      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSelected(b.id)}
                          className="shrink-0"
                        />
                        <FileText className="w-4 h-4 text-[#3899aa] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
                            >
                              {BILAN_TYPE_LABELS[b.type]}
                            </span>
                            <span className="text-xs text-muted-foreground">{date}</span>
                          </div>
                          {b.motif && (
                            <p className="text-sm font-medium truncate mt-0.5">{b.motif}</p>
                          )}
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => handlePreview(b)}
                        disabled={previewLoadingId === b.id}
                        aria-label="Voir le détail du bilan"
                        title="Voir le détail"
                        className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-[#3899aa] hover:bg-[#3899aa]/10 transition-colors disabled:opacity-50"
                      >
                        {previewLoadingId === b.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-2 gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size === 0
                  ? 'Aucun bilan sélectionné'
                  : `${selectedIds.size} bilan${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full h-9 text-sm">
                  Annuler
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={validating}
                  className="btn-teal rounded-full h-9 text-sm"
                >
                  {validating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Valider la sélection
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
