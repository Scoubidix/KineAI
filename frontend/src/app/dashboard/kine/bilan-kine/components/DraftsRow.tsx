'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { listMyBilans } from '@/utils/bilanApi';
import { BILAN_TYPE_LABELS, BILAN_TYPE_COLORS, type BilanListItem } from '@/types/bilan';

interface DraftsRowProps {
  refreshKey: number;
  onOpenAll: () => void;
}

export const formatRelative = (iso: string): string => {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'à l’instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/** Avancement du traitement de dictée, affiché sur la carte du brouillon */
export const jobLabel = (b: BilanListItem): string | null => {
  const j = b.job;
  if (!j) return null;
  const pct = j.progress === null ? '' : `${Math.round(j.progress * 100)} % · `;
  switch (j.status) {
    case 'RECORDING': return 'Enregistrement interrompu';
    case 'TRANSCRIBING': return `${pct}Transcription`;
    case 'CORRECTING': return `${pct}Correction`;
    case 'COMPOSING': return `${pct}Rédaction`;
    case 'FAILED': return 'À reprendre';
    case 'DONE': return 'Bilan rédigé';
    default: return null;
  }
};

const hasActiveJob = (items: BilanListItem[]) => items.some((b) => b.job && b.job.status !== 'DONE' && b.job.status !== 'FAILED' && b.job.status !== 'RECORDING');

// « Reprendre » : les 3 derniers bilans non enregistrés
export default function DraftsRow({ refreshKey, onOpenAll }: DraftsRowProps) {
  const router = useRouter();
  const [items, setItems] = useState<BilanListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    listMyBilans({ statuses: ['BROUILLON', 'GENERE'], limit: 3 }).then((l) => { if (!cancelled) setItems(l); }).catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Un bilan se rédige côté serveur : on rafraîchit l'avancement tant qu'un traitement est en cours
  // (effet piloté par un booléen : sinon chaque rafraîchissement réarmerait l'intervalle)
  const active = hasActiveJob(items);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setInterval(() => { listMyBilans({ statuses: ['BROUILLON', 'GENERE'], limit: 3 }).then((l) => { if (!cancelled) setItems(l); }).catch(() => {}); }, 10_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active]);

  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reprendre</p>
        <Button variant="ghost" size="sm" onClick={onOpenAll} className="h-7 text-xs">Voir tous</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((b) => {
          const c = BILAN_TYPE_COLORS[b.type];
          const label = jobLabel(b);
          // Ambre = le kiné doit agir (reprise ou enregistrement coupé) ; teal = traitement en cours
          const labelClass = label === null || b.job?.status === 'DONE' ? 'text-muted-foreground'
            : b.job?.status === 'FAILED' || b.job?.status === 'RECORDING' ? 'text-amber-700' : 'text-[#3899aa]';
          return (
            <button key={b.id} type="button" onClick={() => router.push(`/dashboard/kine/bilan-kine/${b.id}`)} className="card-hover rounded-xl border border-border/60 p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{b.patient ? `${b.patient.firstName} ${b.patient.lastName.toUpperCase()}` : 'Sans patient'}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>{BILAN_TYPE_LABELS[b.type]}</span>
              </div>
              <div className={`text-xs mt-1 ${labelClass}`}>{label ?? (b.status === 'GENERE' ? 'Généré' : 'Brouillon')} · {formatRelative(b.updatedAt)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
