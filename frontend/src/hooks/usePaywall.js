import { useState } from 'react';
import { useSubscription } from './useSubscription';
import { toast } from '@/hooks/use-toast';

export const usePaywall = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState('');
  const { subscription, usage, isLoading } = useSubscription();

  console.log('🎯 usePaywall called - subscription:', subscription);
  console.log('📊 usePaywall - usage:', usage);

  // Vérifier si une fonctionnalité est accessible selon le plan
  const canAccessFeature = (feature) => {
    console.log(`🔍 canAccessFeature called for: ${feature}`);
    
    if (isLoading || !subscription) {
      console.log('❌ No subscription or loading');
      return false;
    }

    const currentPlan = subscription.planType || 'FREE';
    console.log(`📋 Current plan: ${currentPlan}`);
    
    switch (feature) {
      case 'CREATE_PROGRAMME':
        // Vérifier limite de programmes selon le plan
        const limits = {
          'FREE': 0,      // Aucun programme avec IA
          'DECLIC': 1,
          'PRATIQUE': 3,
          'PIONNIER': Infinity,
          'EXPERT': Infinity
        };
        const canCreate = usage.activeProgrammes < limits[currentPlan];
        console.log(`🏥 CREATE_PROGRAMME - activeProgrammes: ${usage.activeProgrammes}, limit: ${limits[currentPlan]}, can create: ${canCreate}`);
        return canCreate;

      case 'AI_CONVERSATIONNEL':
        const hasConversationnel = ['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);
        console.log(`💬 AI_CONVERSATIONNEL - plan: ${currentPlan}, has access: ${hasConversationnel}`);
        return hasConversationnel;

      case 'AI_BIBLIOTHEQUE':
        const hasBiblio = ['PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);
        console.log(`📚 AI_BIBLIOTHEQUE - plan: ${currentPlan}, has access: ${hasBiblio}`);
        return hasBiblio;

      case 'AI_CLINIQUE':
        const hasClinique = ['PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);
        console.log(`🏥 AI_CLINIQUE - plan: ${currentPlan}, has access: ${hasClinique}`);
        return hasClinique;

      case 'AI_ADMINISTRATIF':
        const hasAdministratif = ['PIONNIER', 'EXPERT'].includes(currentPlan);
        console.log(`📋 AI_ADMINISTRATIF - plan: ${currentPlan}, has access: ${hasAdministratif}`);
        return hasAdministratif;

      default:
        console.log(`❓ Unknown feature: ${feature}`);
        return false;
    }
  };

  // Afficher le paywall avec contexte
  const showPaywall = (feature, context = '') => {
    console.log(`🚨 showPaywall called for feature: ${feature}, context: ${context}`);
    
    setModalContext(context);
    setIsModalOpen(true);
    
    console.log('✅ Modal should open now - isModalOpen set to true');
    
    // Toast informatif
    const messages = {
      'CREATE_PROGRAMME': 'Limite de programmes atteinte pour votre plan',
      'AI_CONVERSATIONNEL': 'Assistant IA conversationnel nécessite un abonnement',
      'AI_BIBLIOTHEQUE': 'Assistant Bibliothèque disponible à partir du plan Pratique',
      'AI_CLINIQUE': 'Assistant Clinique disponible à partir du plan Pratique',
      'AI_ADMINISTRATIF': 'Assistant Administratif disponible avec les plans Pionnier ou Expert'
    };
    
    const message = messages[feature] || 'Fonctionnalité non disponible dans votre plan';
    console.log(`📱 Showing toast: ${message}`);
    
    toast({
      title: "Fonctionnalité premium",
      description: message
    });
  };

  // Fermer le modal
  const closeModal = () => {
    console.log('❌ closeModal called');
    setIsModalOpen(false);
    setModalContext('');
  };

  // Obtenir le plan recommandé pour une fonctionnalité
  const getRecommendedPlan = (feature) => {
    const currentPlan = subscription?.planType;
    console.log(`💡 getRecommendedPlan for ${feature}, current plan: ${currentPlan}`);
    
    switch (feature) {
      case 'CREATE_PROGRAMME':
        if (currentPlan === 'DECLIC') return 'PRATIQUE';
        if (currentPlan === 'PRATIQUE') return 'PIONNIER';
        return 'DECLIC'; // Pour FREE
        
      case 'AI_CONVERSATIONNEL':
        return 'DECLIC';
        
      case 'AI_BIBLIOTHEQUE':
      case 'AI_CLINIQUE':
        return 'PRATIQUE';
        
      case 'AI_ADMINISTRATIF':
        return 'PIONNIER';
        
      default:
        return 'DECLIC';
    }
  };

  // Obtenir le message contextuel
  const getPaywallMessage = (feature) => {
    const currentPlan = subscription?.planType;
    
    switch (feature) {
      case 'CREATE_PROGRAMME':
        if (currentPlan === 'DECLIC') {
          return `Vous avez atteint la limite de 1 programme du plan Déclic. Passez au plan Pratique pour créer jusqu'à 3 programmes avec IA.`;
        }
        if (currentPlan === 'PRATIQUE') {
          return `Vous avez atteint la limite de 3 programmes du plan Pratique. Passez au plan Pionnier pour des programmes illimités.`;
        }
        return 'Un abonnement est requis pour créer des programmes avec IA.';
        
      case 'AI_CONVERSATIONNEL':
        return 'L\'assistant IA conversationnel permet d\'échanger avec vos patients via le chat automatisé.';
        
      case 'AI_BIBLIOTHEQUE':
        return 'L\'assistant Bibliothèque vous aide à accéder rapidement aux dernières recherches et références scientifiques.';
        
      case 'AI_CLINIQUE':
        return 'L\'assistant Clinique vous accompagne dans l\'analyse de cas complexes et la prise de décision thérapeutique.';
        
      case 'AI_ADMINISTRATIF':
        return 'L\'assistant Administratif vous aide avec la gestion administrative, les rapports et l\'organisation de votre cabinet.';
        
      default:
        return 'Cette fonctionnalité nécessite un plan supérieur.';
    }
  };

  console.log(`📊 usePaywall state - isModalOpen: ${isModalOpen}, modalContext: ${modalContext}`);

  return {
    canAccessFeature,
    showPaywall,
    closeModal,
    isModalOpen,
    modalContext,
    getRecommendedPlan,
    getPaywallMessage,
    subscription,
    usage,
    isLoading
  };
};