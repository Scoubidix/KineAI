'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, FileSearch, FolderOpen, UserPlus, Search, ArrowRight, CheckCircle } from 'lucide-react';
import NouveauContratModal from './components/NouveauContratModal';
import MesContratsModal from './components/MesContratsModal';

export default function AnnoncesEmploiHubPage() {
  const [nouveauxOpen, setNouveauxOpen] = useState(false);
  const [mesContratsOpen, setMesContratsOpen] = useState(false);
  const [proposerOpen, setProposerOpen] = useState(false);
  const [chercherOpen, setChercherOpen] = useState(false);
  const [contractsRefreshKey, setContractsRefreshKey] = useState(0);

  const cards = [
    {
      title: 'Nouveau contrat',
      description: 'Créer votre contrat de remplacement ou d\'assistanat',
      icon: FileSearch,
      onClick: () => setNouveauxOpen(true),
      comingSoon: false,
    },
    {
      title: 'Mes contrats',
      description: 'Retrouvez tous vos anciens contrats',
      icon: FolderOpen,
      onClick: () => setMesContratsOpen(true),
      comingSoon: false,
    },
    {
      title: 'Proposer une annonce',
      description: 'Publiez une annonce pour trouver la personne idéale',
      icon: UserPlus,
      onClick: () => setProposerOpen(true),
      comingSoon: true,
    },
    {
      title: 'Je cherche un Remplacement/Assistanat',
      description: 'Publiez votre profil pour être contacté pour des postes adaptés à vos envies',
      icon: Search,
      onClick: () => setChercherOpen(true),
      comingSoon: true,
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="card-hover rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Briefcase className="text-[#3899aa] h-7 w-7 shrink-0" />
              <div>
                <h2 className="text-xl font-semibold text-[#3899aa]">Mes Contrats</h2>
                <p className="text-foreground text-sm">Gérez vos remplacements et assistanats en toute simplicité</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#3899aa]/10 rounded-full px-3 py-1 self-start sm:self-auto">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-foreground font-medium">Système actif</span>
            </div>
          </div>
        </div>

        {/* Grille 2x2 des cards principales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((card) => (
            <Card
              key={card.title}
              className={
                card.comingSoon
                  ? 'card-hover cursor-not-allowed opacity-60 border-[#3899aa]/20'
                  : 'card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60 hover:shadow-[0_0_20px_rgba(56,153,170,0.15)]'
              }
              onClick={card.comingSoon ? undefined : card.onClick}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <card.icon className="h-4.5 w-4.5 text-[#3899aa]" />
                    <h3 className="font-semibold text-base text-[#3899aa]">{card.title}</h3>
                  </div>
                  {card.comingSoon ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[#3899aa] bg-[#3899aa]/10 rounded-full px-2 py-0.5 whitespace-nowrap">
                      Bientôt disponible
                    </span>
                  ) : (
                    <ArrowRight className="h-4 w-4 text-[#3899aa]/40" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <NouveauContratModal
        open={nouveauxOpen}
        onOpenChange={setNouveauxOpen}
        onCreated={() => setContractsRefreshKey(k => k + 1)}
      />
      <MesContratsModal
        open={mesContratsOpen}
        onOpenChange={setMesContratsOpen}
        refreshKey={contractsRefreshKey}
      />
    </AppLayout>
  );
}
