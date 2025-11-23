import { useState } from 'react';
import { useSubscription } from './useSubscription';
import { toast } from '@/hooks/use-toast';

export const usePaywall = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState('');
  const { subscription, usage, isLoading } = useSubscription();


  // Vérifier si une fonctionnalité est accessible selon le plan
  const canAccessFeature = (feature) => {
    if (isLoading || !subscription) {
      return false;
    }

    const currentPlan = subscription.planType || 'FREE';
    
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
        return canCreate;

      case 'AI_CONVERSATIONNEL':
        return ['DECLIC', 'PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);

      case 'AI_BIBLIOTHEQUE':
        return ['PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);

      case 'AI_CLINIQUE':
        return ['PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);

      case 'AI_ADMINISTRATIF':
        return ['PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);

      case 'TEMPLATES_ADMIN':
        return ['PIONNIER', 'EXPERT'].includes(currentPlan);

      default:
        return false;
    }
  };

  // Afficher le paywall avec contexte
  const showPaywall = (feature, context = '') => {
    setModalContext(context);
    setIsModalOpen(true);
    
    // Toast informatif
    const messages = {
      'CREATE_PROGRAMME': 'Limite de programmes atteinte pour votre plan',
      'AI_CONVERSATIONNEL': 'Assistant IA conversationnel nécessite un abonnement',
      'AI_BIBLIOTHEQUE': 'Assistant Bibliothèque disponible à partir du plan Pratique',
      'AI_CLINIQUE': 'Assistant Clinique disponible à partir du plan Pratique',
      'AI_ADMINISTRATIF': 'Assistant Administratif disponible à partir du plan Pratique',
      'TEMPLATES_ADMIN': 'Templates administratifs disponibles avec les plans Pionnier et Expert'
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
      case 'AI_ADMINISTRATIF':
        return 'PRATIQUE';

      case 'TEMPLATES_ADMIN':
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
        return 'L\'assistant Administratif vous aide à générer des bilans kinésithérapiques structurés à partir de vos notes cliniques.';

      case 'TEMPLATES_ADMIN':
        return 'Les templates administratifs vous permettent de gérer facilement vos communications avec les patients (relances, rappels, etc.).';

      default:
        return 'Cette fonctionnalité nécessite un plan supérieur.';
    }
  };


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