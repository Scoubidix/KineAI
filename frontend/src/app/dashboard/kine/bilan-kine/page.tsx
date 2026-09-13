'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BilanStartBlock from './components/BilanStartBlock';
import DraftsRow, { DRAFTS_HREF } from './components/DraftsRow';
import PatientBilansModal from './components/PatientBilansModal';
import TemplatesModal from './components/TemplatesModal';

export default function BilanHubPage() {
  const router = useRouter();
  const [bilansRealisesOpen, setBilansRealisesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Même facture que les actions rapides de l'accueil kiné : pastille emoji, titre, sous-titre
  const cardBody = (emoji: string, badgeClass: string, title: string, subtitle: string) => (
    <>
      <div aria-hidden="true" className={`w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-xl ${badgeClass}`}>{emoji}</div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[11px] text-muted-foreground">{subtitle}</div>
    </>
  );
  const cardClass = 'card-hover rounded-xl p-4 text-center transition-all';

  const card = (emoji: string, badgeClass: string, title: string, subtitle: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={cardClass}>{cardBody(emoji, badgeClass, title, subtitle)}</button>
  );
  // Une liste se parcourt sur sa propre page : un vrai lien, pas un bouton qui ouvre une modale
  const linkCard = (emoji: string, badgeClass: string, title: string, subtitle: string, href: string) => (
    <Link href={href} className={`${cardClass} block`}>{cardBody(emoji, badgeClass, title, subtitle)}</Link>
  );

  return (
    <>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Titre masqué : la sidebar situe déjà la page, mais l'entête reste annoncé aux lecteurs d'écran */}
        <h1 className="sr-only">Bilans</h1>

        <BilanStartBlock onStarted={(bilan, mode) => router.push(mode === 'write' ? `/dashboard/kine/bilan-kine/${bilan.id}` : `/dashboard/kine/bilan-kine/${bilan.id}?mode=${mode}`)} />

        <DraftsRow />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Actions rapides</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {card('🔍', 'bg-[#eff6ff]', 'Bilans réalisés', 'Par patient', () => setBilansRealisesOpen(true))}
            {card('📐', 'bg-[#f5f3ff]', 'Mes templates', 'Modèles par pathologie', () => setTemplatesOpen(true))}
            {linkCard('📂', 'bg-[#fffbeb]', 'Mes brouillons', 'Reprendre un bilan', DRAFTS_HREF)}
          </div>
        </div>
      </div>

      <PatientBilansModal open={bilansRealisesOpen} onOpenChange={setBilansRealisesOpen} />
      <TemplatesModal open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </>
  );
}
