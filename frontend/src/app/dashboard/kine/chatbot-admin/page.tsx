'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Users, Clock, Send, CheckCircle, ArrowRight, Mail, MessageSquare, Lightbulb, Lock, Loader2 } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { usePaywall } from '@/hooks/usePaywall';
import { PaywallModal } from '@/components/PaywallModal';
import { useToast } from '@/hooks/use-toast';
import TemplatesManagementModal from './components/TemplatesManagementModal';
import ContactsManagementModal from './components/ContactsManagementModal';
import HistoryModal from './components/HistoryModal';
import NouveauCourrierModal from './components/NouveauCourrierModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function KineChatbotAdminPage() {
  const { isLoading: paywallLoading, canAccessFeature, subscription } = usePaywall();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const recipientSearch = searchParams.get('recipientSearch') || '';

  // Modal states
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [showPaywallHint, setShowPaywallHint] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [courrierOpen, setCourrierOpen] = useState(false);

  // Recent activity
  const [recentHistory, setRecentHistory] = useState<Array<{
    id: number;
    templateTitle: string;
    recipientName: string;
    method: 'EMAIL' | 'WHATSAPP';
    sentAt: string;
    template: { title: string; category: string } | null;
  }>>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const getAuthToken = async () => {
    const auth = getAuth(app);
    return await auth.currentUser?.getIdToken();
  };

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`${API_BASE}/api/templates/history?limit=3&offset=0`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) setRecentHistory(data.history);
        } catch (e) {
          // silent
        } finally {
          setHistoryLoaded(true);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const hasAccess = canAccessFeature('TEMPLATES_ADMIN');

  const [waitingForPaywall, setWaitingForPaywall] = useState(false);

  const handleNouveauCourrier = () => {
    if (paywallLoading) {
      setWaitingForPaywall(true);
      return;
    }
    if (!hasAccess) {
      setShowPaywallHint(true);
      return;
    }
    setCourrierOpen(true);
  };

  // Ouvrir auto le modal courrier si redirigé depuis notifications (avec vérif abonnement)
  useEffect(() => {
    if (recipientSearch && !paywallLoading) {
      if (hasAccess) {
        setCourrierOpen(true);
      } else {
        setShowPaywallHint(true);
      }
    }
  }, [recipientSearch, paywallLoading, hasAccess]);

  // Si l'user a cliqué pendant le loading, ouvrir dès que c'est prêt
  useEffect(() => {
    if (!paywallLoading && waitingForPaywall) {
      setWaitingForPaywall(false);
      if (hasAccess) {
        setCourrierOpen(true);
      } else {
        setShowPaywallHint(true);
      }
    }
  }, [paywallLoading, waitingForPaywall, hasAccess]);

  const formatRelativeDate = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins}min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  const secondaryCards = [
    {
      title: 'Mes templates',
      description: 'Modèles de courriers publics et personnels',
      icon: FileText,
      onClick: () => setTemplatesOpen(true),
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Mes contacts',
      description: 'Médecins, mutuelles, secrétariats...',
      icon: Users,
      onClick: () => setContactsOpen(true),
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Historique',
      description: 'Tous vos envois passés',
      icon: Clock,
      onClick: () => setHistoryOpen(true),
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    }
  ];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="card-hover rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="text-[#3899aa] h-7 w-7 shrink-0" />
              <div>
                <h2 className="text-xl font-semibold text-[#3899aa]">IA Administrative</h2>
                <p className="text-foreground text-sm">Gérez vos templates, contacts et envoyez vos courriers</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#3899aa]/10 rounded-full px-3 py-1 self-start sm:self-auto">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-foreground font-medium">Système actif</span>
            </div>
          </div>
        </div>

        {/* CTA principal — Nouveau courrier */}
        <Card
          className="card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60 hover:shadow-[0_0_20px_rgba(56,153,170,0.15)] mb-6"
          onClick={handleNouveauCourrier}
        >
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-5">
              <div className="p-4 rounded-2xl bg-[#3899aa]/10">
                <Send className="h-8 w-8 text-[#3899aa]" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-[#3899aa]">Nouveau courrier</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Sélectionnez un destinataire, choisissez un template, personnalisez et envoyez par email ou WhatsApp
                </p>
              </div>
              {waitingForPaywall
                ? <Loader2 className="h-5 w-5 text-[#3899aa] animate-spin hidden sm:block" />
                : <ArrowRight className="h-5 w-5 text-[#3899aa] hidden sm:block" />
              }
            </div>

            {/* Paywall hint — apparaît au clic si pas d'accès */}
            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${showPaywallHint ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#3899aa]/5 border border-[#3899aa]/20">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#3899aa]" />
                  <p className="text-sm text-foreground">
                    Cette fonctionnalité nécessite un abonnement supérieur.
                  </p>
                </div>
                <Button
                  className="btn-teal rounded-full text-sm h-8 px-4 shrink-0 ml-3"
                  onClick={(e) => { e.stopPropagation(); setIsPaywallOpen(true); }}
                >
                  Voir les abonnements
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3 cards secondaires */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {secondaryCards.map(card => (
            <Card
              key={card.title}
              className="card-hover cursor-pointer transition-all duration-300 hover:shadow-lg border-[#3899aa]/30 hover:border-[#3899aa]/60 hover:shadow-[0_0_20px_rgba(56,153,170,0.15)]"
              onClick={card.onClick}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <card.icon className="h-4.5 w-4.5 text-[#3899aa]" />
                    <h3 className="font-semibold text-base text-[#3899aa]">{card.title}</h3>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#3899aa]/40 transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground mt-2">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Activité récente OU tips */}
        {historyLoaded && (
          <div className="mt-8">
            {recentHistory.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Dernière activité</h3>
                  <button onClick={() => setHistoryOpen(true)} className="text-xs text-[#3899aa] hover:underline">
                    Tout voir
                  </button>
                </div>
                <div className="space-y-2">
                  {recentHistory.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                      <div className={`p-1.5 rounded-lg ${entry.method === 'EMAIL' ? 'bg-blue-500/10' : 'bg-green-500/10'}`}>
                        {entry.method === 'EMAIL'
                          ? <Mail className="h-3.5 w-3.5 text-blue-500" />
                          : <MessageSquare className="h-3.5 w-3.5 text-green-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.templateTitle}</p>
                        <p className="text-xs text-muted-foreground">{entry.recipientName}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeDate(entry.sentAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-[#3899aa]/20 bg-[#3899aa]/5 p-5">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-[#3899aa] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Pour bien démarrer</p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1.5">
                      <li>Consultez les <button onClick={() => setTemplatesOpen(true)} className="text-[#3899aa] hover:underline font-medium">templates disponibles</button> pour vos relances et communications</li>
                      <li>Ajoutez vos <button onClick={() => setContactsOpen(true)} className="text-[#3899aa] hover:underline font-medium">contacts externes</button> (médecins, mutuelles...) pour les retrouver facilement</li>
                      <li>Créez vos propres templates personnalisés pour gagner du temps</li>
                      <li>Utilisez l&apos;IA pour générer un brouillon de message en décrivant votre besoin</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <TemplatesManagementModal
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        apiBase={API_BASE}
        getAuthToken={getAuthToken}
      />
      <ContactsManagementModal
        open={contactsOpen}
        onOpenChange={setContactsOpen}
        apiBase={API_BASE}
        getAuthToken={getAuthToken}
      />
      <HistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        apiBase={API_BASE}
        getAuthToken={getAuthToken}
      />
      <NouveauCourrierModal
        open={courrierOpen}
        onOpenChange={setCourrierOpen}
        apiBase={API_BASE}
        getAuthToken={getAuthToken}
        defaultSearch={recipientSearch}
      />
      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        subscription={subscription}
      />
    </AppLayout>
  );
}
