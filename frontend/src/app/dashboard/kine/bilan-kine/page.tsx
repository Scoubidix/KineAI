'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Sparkles, Search, Layers, ArrowRight, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import NouveauBilanModal from './components/NouveauBilanModal';
import PatientBilansModal from './components/PatientBilansModal';

export default function BilanHubPage() {
  const { toast } = useToast();
  const [nouveauOpen, setNouveauOpen] = useState(false);
  const [bilansRealisesOpen, setBilansRealisesOpen] = useState(false);

  const handleTemplates = () => {
    toast({
      title: 'Prochainement',
      description: 'Les templates de bilan seront disponibles dans une prochaine mise à jour.',
    });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="card-hover rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="text-[#3899aa] h-7 w-7 shrink-0" />
              <div>
                <h2 className="text-xl font-semibold text-[#3899aa]">Bilans</h2>
                <p className="text-foreground text-sm">Rédigez, suivez et exportez vos bilans kinésithérapiques</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#3899aa]/10 rounded-full px-3 py-1 self-start sm:self-auto">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-foreground font-medium">Système actif</span>
            </div>
          </div>
        </div>

        {/* CTA principal — Nouveau bilan */}
        <Card
          className="card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60 hover:shadow-[0_0_20px_rgba(56,153,170,0.15)] mb-6"
          onClick={() => setNouveauOpen(true)}
        >
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-5">
              <div className="p-4 rounded-2xl bg-[#3899aa]/10">
                <Sparkles className="h-8 w-8 text-[#3899aa]" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-[#3899aa]">Nouveau bilan</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Choisissez un patient, le type de bilan (initial, intermédiaire, final), puis remplissez vos notes et mesures
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-[#3899aa] hidden sm:block" />
            </div>
          </CardContent>
        </Card>

        {/* 2 cards secondaires */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className="card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60 hover:shadow-[0_0_20px_rgba(56,153,170,0.15)]"
            onClick={() => setBilansRealisesOpen(true)}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Search className="h-4.5 w-4.5 text-[#3899aa]" />
                  <h3 className="font-semibold text-base text-[#3899aa]">Bilans réalisés</h3>
                </div>
                <ArrowRight className="h-4 w-4 text-[#3899aa]/40" />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Retrouvez les bilans déjà réalisés en cherchant un patient
              </p>
            </CardContent>
          </Card>

          <Card
            className="card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60 opacity-70"
            onClick={handleTemplates}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Layers className="h-4.5 w-4.5 text-[#3899aa]" />
                  <h3 className="font-semibold text-base text-[#3899aa]">Templates bilans</h3>
                </div>
                <span className="text-xs bg-[#3899aa]/10 text-[#3899aa] rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Prochainement
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Modèles de bilan par pathologie pour gagner du temps
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <NouveauBilanModal open={nouveauOpen} onOpenChange={setNouveauOpen} />
      <PatientBilansModal open={bilansRealisesOpen} onOpenChange={setBilansRealisesOpen} />
    </AppLayout>
  );
}
