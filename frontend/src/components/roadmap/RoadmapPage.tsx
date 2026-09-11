'use client';

/**
 * Page Roadmap kiné — standards repris des roadmaps publiques de référence :
 * - Lanes par horizon côte à côte sur desktop, empilées sur mobile (GitHub public roadmap,
 *   Linear roadmap, Productboard) : en-tête de lane avec icône, titre et pastille de compte.
 * - Pills de statut à point coloré, libellé toujours visible (Linear, Jira), + légende sous
 *   l'en-tête de page.
 * - Hero « Objectif n°1 » en bandeau pleine largeur (Notion, Canny « Now »).
 * Marque de fabrique maison : teal #3899aa, tutoiement, arrondis généreux.
 */

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { AlertCircle, Compass, Lightbulb, Map as MapIcon, Rocket } from 'lucide-react';
import RoadmapItemCard, { StatusPill } from './RoadmapItemCard';
import ProposerIdeeDialog from './ProposerIdeeDialog';
import { ALL_STATUTS, RoadmapItem, RoadmapResponse } from './types';

const API = process.env.NEXT_PUBLIC_API_URL;

type LucideIconComponent = React.ComponentType<{ className?: string }>;

function LaneHeader({ icon: Icon, title, count }: { icon: LucideIconComponent; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
      <Icon className="h-4 w-4 shrink-0 text-[#3899aa]" />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h2>
      <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{count}</span>
    </div>
  );
}

function Lane({
  icon,
  title,
  items,
  onProposerIdee,
}: {
  icon: LucideIconComponent;
  title: string;
  items: RoadmapItem[];
  onProposerIdee?: (item: RoadmapItem) => void;
}) {
  return (
    <section className="space-y-3">
      <LaneHeader icon={icon} title={title} count={items.length} />
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
          Rien pour le moment.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <RoadmapItemCard key={item.id} item={item} onProposerIdee={onProposerIdee} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoadmapSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((lane) => (
          <div key={lane} className="space-y-3">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ideeItem, setIdeeItem] = useState<RoadmapItem | null>(null);
  const openIdee = (item: RoadmapItem | null) => { setIdeeItem(item); setDialogOpen(true); };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${API}/api/roadmap`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Erreur');
        setData(json);
      } catch {
        setError('Impossible de charger la roadmap pour le moment.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const isEmpty = data && !data.objectifPrincipal && data.courtTerme.length === 0
    && data.moyenLongTerme.length === 0;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold text-[#3899aa] md:text-2xl">
            Voici ce qu'on prépare pour toi. Une idée ? Dis-nous.
          </h1>
          <Button onClick={() => openIdee(null)} className="self-start shrink-0 bg-[#3899aa] text-white hover:bg-[#2f8393]">
            <Lightbulb aria-hidden="true" className="mr-2 h-4 w-4" />
            Proposer une idée
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ALL_STATUTS.map((statut) => <StatusPill key={statut} statut={statut} />)}
        </div>
      </header>

      {loading && <RoadmapSkeleton />}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && isEmpty && (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#3899aa]/10">
            <MapIcon aria-hidden="true" className="h-7 w-7 text-[#3899aa]" />
          </span>
          <p className="font-medium text-gray-900">La roadmap arrive bientôt.</p>
          <p className="mt-1 text-sm text-gray-600">En attendant, dis-nous ce qui te ferait gagner du temps au quotidien.</p>
          <Button onClick={() => openIdee(null)} className="mt-5 bg-[#3899aa] text-white hover:bg-[#2f8393]">
            <Lightbulb aria-hidden="true" className="mr-2 h-4 w-4" />
            Proposer une idée
          </Button>
        </div>
      )}

      {data && !isEmpty && (
        <>
          {data.objectifPrincipal && <RoadmapItemCard item={data.objectifPrincipal} featured onProposerIdee={openIdee} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Lane icon={Rocket} title="Court terme" items={data.courtTerme} onProposerIdee={openIdee} />
            <Lane icon={Compass} title="Moyen et long terme" items={data.moyenLongTerme} onProposerIdee={openIdee} />
          </div>
        </>
      )}

      <ProposerIdeeDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setIdeeItem(null); }}
        item={ideeItem}
      />
    </div>
  );
}
