'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, FileSearch, FolderOpen, UserPlus, Search, ArrowRight, CheckCircle } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import NouveauContratModal from './components/NouveauContratModal';
import MesContratsModal from './components/MesContratsModal';
import ContratSigneCelebrationDialog, { RecentlyCompletedContract } from './components/ContratSigneCelebrationDialog';
import EnvoiOrdreDialog from './components/EnvoiOrdreDialog';

export default function AnnoncesEmploiHubPage() {
  const [nouveauxOpen, setNouveauxOpen] = useState(false);
  const [mesContratsOpen, setMesContratsOpen] = useState(false);
  const [proposerOpen, setProposerOpen] = useState(false);
  const [chercherOpen, setChercherOpen] = useState(false);
  const [contractsRefreshKey, setContractsRefreshKey] = useState(0);

  // Modal de félicitation : déclenchée à l'ouverture de la page si des contrats viennent d'être signés.
  const [recentlyCompleted, setRecentlyCompleted] = useState<RecentlyCompletedContract[]>([]);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [ordreDialogContractId, setOrdreDialogContractId] = useState<number | null>(null);

  // Compteur de contrats COMPLETE non encore déclarés à l'Ordre (badge sur la card "Mes contrats").
  const [pendingOrdreCount, setPendingOrdreCount] = useState(0);

  const fetchPendingOrdreCount = React.useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/pending-ordre-count`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingOrdreCount(data.count || 0);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => { fetchPendingOrdreCount(); }, [fetchPendingOrdreCount]);

  const markContractsViewed = () => {
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/mark-viewed`, { method: 'POST' }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/recently-completed`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list: RecentlyCompletedContract[] = Array.isArray(data.contracts) ? data.contracts : [];
        if (list.length > 0) {
          setRecentlyCompleted(list);
          setCelebrationOpen(true);
        }
      } catch { /* silencieux */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCelebrationClose = () => {
    setCelebrationOpen(false);
    markContractsViewed();
  };

  const handleSendToOrdreFromCelebration = (contractId: number) => {
    setOrdreDialogContractId(contractId);
  };

  const handleOrdreDialogChange = (open: boolean) => {
    if (!open) setOrdreDialogContractId(null);
  };

  const cards = [
    {
      title: 'Nouveau contrat',
      description: 'Créer votre contrat de remplacement ou d\'assistanat',
      icon: FileSearch,
      onClick: () => setNouveauxOpen(true),
      comingSoon: false,
      pendingOrdre: 0,
    },
    {
      title: 'Mes contrats',
      description: 'Retrouvez tous vos anciens contrats',
      icon: FolderOpen,
      onClick: () => setMesContratsOpen(true),
      comingSoon: false,
      pendingOrdre: pendingOrdreCount,
    },
    {
      title: 'Proposer une annonce',
      description: 'Publiez une annonce pour trouver la personne idéale',
      icon: UserPlus,
      onClick: () => setProposerOpen(true),
      comingSoon: true,
      pendingOrdre: 0,
    },
    {
      title: 'Je cherche un Remplacement/Assistanat',
      description: 'Publiez votre profil pour être contacté pour des postes adaptés à vos envies',
      icon: Search,
      onClick: () => setChercherOpen(true),
      comingSoon: true,
      pendingOrdre: 0,
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
                  ) : card.pendingOrdre > 0 ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-800 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 rounded-full px-2 py-0.5 whitespace-nowrap">
                      {card.pendingOrdre} à déclarer
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
        onOpenChange={(o) => {
          setMesContratsOpen(o);
          if (!o) fetchPendingOrdreCount();
        }}
        refreshKey={contractsRefreshKey}
      />

      <ContratSigneCelebrationDialog
        open={celebrationOpen}
        contracts={recentlyCompleted}
        onClose={handleCelebrationClose}
        onSendToOrdre={handleSendToOrdreFromCelebration}
      />

      <EnvoiOrdreDialog
        open={ordreDialogContractId !== null}
        onOpenChange={handleOrdreDialogChange}
        contractId={ordreDialogContractId}
        onSent={() => {
          // Met à jour l'état local pour afficher le badge "déjà envoyé à l'Ordre" dans la modal de célébration.
          setRecentlyCompleted(prev => prev.map(c =>
            c.id === ordreDialogContractId ? { ...c, ordreSentAt: new Date().toISOString() } : c
          ));
          fetchPendingOrdreCount();
        }}
      />
    </AppLayout>
  );
}
