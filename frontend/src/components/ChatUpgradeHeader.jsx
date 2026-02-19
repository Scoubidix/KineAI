import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { usePaywall } from '../hooks/usePaywall';
import { useSubscription } from '../hooks/useSubscription';
import { PaywallModal } from './PaywallModal';

export const ChatUpgradeHeader = ({ assistantType, canAccessFeature, isLoading, subscription }) => {
  // Si les props ne sont pas fournies, utiliser le hook (fallback)
  const paywall = canAccessFeature && isLoading !== undefined && subscription !== undefined ?
    { canAccessFeature, isLoading, subscription } :
    usePaywall();

  // Mapping des types d'assistant vers les features
  const featureMap = {
    'CONVERSATIONNEL': 'AI_CONVERSATIONNEL',
    'BIBLIOTHEQUE': 'AI_BIBLIOTHEQUE',
    'CLINIQUE': 'AI_CLINIQUE',
    'ADMINISTRATIF': 'AI_ADMINISTRATIF',
    'TEMPLATES_ADMIN': 'TEMPLATES_ADMIN'
  };

  const feature = featureMap[assistantType];
  if (!feature) {
    console.error(`Assistant type ${assistantType} not recognized`);
    return null;
  }

  // Attendre la fin du chargement avant de prendre une décision
  if (paywall.isLoading) {
    return null;
  }

  // Si l'accès est autorisé, ne pas afficher
  if (paywall.canAccessFeature(feature)) {
    return null;
  }

  // Accès refusé : ne rien rendre (le blocage est géré par ChatDisabledOverlay)
  return null;
};

// Wrapper pour désactiver les zones d'interaction du chat
export const ChatDisabledOverlay = ({ children, assistantType, canAccessFeature, isLoading }) => {
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const { subscription } = useSubscription();

  // Si les props ne sont pas fournies, utiliser le hook (fallback)
  const paywall = canAccessFeature && isLoading !== undefined ?
    { canAccessFeature, isLoading } :
    usePaywall();

  const featureMap = {
    'CONVERSATIONNEL': 'AI_CONVERSATIONNEL',
    'BIBLIOTHEQUE': 'AI_BIBLIOTHEQUE',
    'CLINIQUE': 'AI_CLINIQUE',
    'ADMINISTRATIF': 'AI_ADMINISTRATIF',
    'TEMPLATES_ADMIN': 'TEMPLATES_ADMIN'
  };

  const feature = featureMap[assistantType];
  if (!feature) {
    return children;
  }

  // Attendre la fin du chargement avant de prendre une décision
  if (paywall.isLoading) {
    return children;
  }

  // Si l'accès est autorisé, retourner le contenu normal
  if (paywall.canAccessFeature(feature)) {
    return children;
  }

  // Sinon, retourner le contenu avec overlay désactivé
  return (
    <div className="relative">
      {/* Contenu visible mais désactivé */}
      <div className="opacity-60 pointer-events-none">
        {children}
      </div>

      {/* Overlay transparent sur les zones d'interaction */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50/30 to-gray-100/30 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
        <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border">
          <Lock className="h-8 w-8 text-[#3899aa] mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-3">
            Accès restreint
          </p>
          <button
            onClick={() => setIsPaywallOpen(true)}
            className="btn-teal px-4 py-2 rounded-md text-sm font-medium"
          >
            Changer de plan
          </button>
        </div>
      </div>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        subscription={subscription}
      />
    </div>
  );
};
