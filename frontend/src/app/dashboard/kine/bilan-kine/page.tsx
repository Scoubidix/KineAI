'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Search, Layers, FolderOpen, ArrowRight } from 'lucide-react';
import BilanStartBlock from './components/BilanStartBlock';
import DraftsRow from './components/DraftsRow';
import DraftsModal from './components/DraftsModal';
import PatientBilansModal from './components/PatientBilansModal';
import TemplatesModal from './components/TemplatesModal';

export default function BilanHubPage() {
  const router = useRouter();
  const [bilansRealisesOpen, setBilansRealisesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const card = (icon: React.ReactNode, title: string, subtitle: string, onClick: () => void) => (
    <Card className="card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">{icon}<h3 className="font-semibold text-base text-[#3899aa]">{title}</h3></div>
          <ArrowRight className="h-4 w-4 text-[#3899aa]/40" />
        </div>
        <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="text-[#3899aa] h-7 w-7 shrink-0" />
          <div>
            <h2 className="text-xl font-semibold text-[#3899aa]">Bilans</h2>
            <p className="text-foreground text-sm">Rédige, suis et exporte tes bilans kinésithérapiques</p>
          </div>
        </div>

        <BilanStartBlock onStarted={(bilan, mode) => router.push(mode === 'dictation' ? `/dashboard/kine/bilan-kine/${bilan.id}?mode=dictation` : `/dashboard/kine/bilan-kine/${bilan.id}`)} />

        <DraftsRow refreshKey={refreshKey} onOpenAll={() => setDraftsOpen(true)} />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Actions rapides</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {card(<Search className="h-4 w-4 text-[#3899aa]" />, 'Bilans réalisés', 'Retrouve les bilans déjà réalisés par patient', () => setBilansRealisesOpen(true))}
            {card(<Layers className="h-4 w-4 text-[#3899aa]" />, 'Mes templates', 'Modèles de bilan par pathologie', () => setTemplatesOpen(true))}
            {card(<FolderOpen className="h-4 w-4 text-[#3899aa]" />, 'Mes brouillons', 'Reprends un bilan en cours', () => setDraftsOpen(true))}
          </div>
        </div>
      </div>

      <PatientBilansModal open={bilansRealisesOpen} onOpenChange={setBilansRealisesOpen} />
      <TemplatesModal open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <DraftsModal open={draftsOpen} onOpenChange={setDraftsOpen} onChanged={() => setRefreshKey((k) => k + 1)} />
    </>
  );
}
