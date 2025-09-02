import React, { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { Crown, Loader2 } from 'lucide-react';
import { usePaywall } from '../hooks/usePaywall';
import { PaywallModal } from './PaywallModal';

export const PlanIndicator = () => {
  // ✅ TOUS LES HOOKS D'ABORD (avant tout return conditionnel)
  const { canAccessFeature, subscription, isLoading } = usePaywall();
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ✅ Stabiliser les callbacks (hooks avant conditions)
  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // ✅ MAINTENANT les conditions de retour (après tous les hooks)
  // Attendre la fin du chargement avant de prendre une décision
  if (isLoading) {
    return null;
  }

  // Ne pas afficher si pas en FREE
  if (!subscription || subscription.planType !== 'FREE') {
    return null;
  }

  // Détecter si on est sur une page de chat IA
  const isOnChatPage = pathname?.includes('/chatbot');
  
  // Si on est sur une page de chat, déterminer quelle IA (ordre important!)
  let currentIAFeature = null;
  if (isOnChatPage) {
    if (pathname?.includes('/chatbot-biblio')) {
      currentIAFeature = 'AI_BIBLIOTHEQUE';
    } else if (pathname?.includes('/chatbot-clinique')) {
      currentIAFeature = 'AI_CLINIQUE';
    } else if (pathname?.includes('/chatbot-admin')) {
      currentIAFeature = 'AI_ADMINISTRATIF';
    } else if (pathname?.endsWith('/chatbot')) {
      // Utiliser endsWith pour éviter les faux positifs
      currentIAFeature = 'AI_CONVERSATIONNEL';
    }
  }

  // Si on est sur une page de chat ET qu'on n'a pas accès à cette IA
  // Ne pas afficher le PlanIndicator (ChatUpgradeHeader s'affiche à la place)
  if (isOnChatPage && currentIAFeature && !canAccessFeature(currentIAFeature)) {
    return null;
  }

  return (
    <>
      <Button
        onClick={handleOpenModal}
        variant="outline"
        size="sm"
        className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white border-0 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02]"
      >
        <Crown className="h-4 w-4 mr-2" />
        Upgrade
      </Button>

      <PaywallModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal}
        subscription={subscription}
      />
    </>
  );
};