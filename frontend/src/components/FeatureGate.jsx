import React from 'react';
import { usePaywall } from '../hooks/usePaywall';
import { PaywallButton } from './PaywallButton';
import { Loader2 } from 'lucide-react';

export const FeatureGate = ({ 
  feature, 
  children, 
  fallback = null, 
  showButton = true,
  buttonText = "Passer au plan supérieur",
  context = ""
}) => {
  const { canAccessFeature, showPaywall, isLoading } = usePaywall();

  // Affichage pendant le chargement
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // Si l'accès est autorisé, afficher le contenu
  if (canAccessFeature(feature)) {
    return children;
  }

  // Si l'accès est refusé, afficher le fallback ou le bouton paywall
  if (fallback) {
    return fallback;
  }

  if (showButton) {
    return (
      <PaywallButton 
        feature={feature}
        text={buttonText}
        context={context}
        onClick={() => showPaywall(feature, context)}
      />
    );
  }

  // Retourner null si aucun fallback n'est spécifié
  return null;
};

// Wrapper spécialisé pour les boutons d'action
export const FeatureButton = ({ 
  feature, 
  onClick, 
  children, 
  disabled = false,
  context = "",
  className = "",
  variant = "default",
  ...props 
}) => {
  const { canAccessFeature, showPaywall } = usePaywall();

  const handleClick = (e) => {
    if (!canAccessFeature(feature)) {
      e.preventDefault();
      showPaywall(feature, context);
      return;
    }
    
    if (onClick) {
      onClick(e);
    }
  };

  const buttonClassName = `
    ${className}
    ${!canAccessFeature(feature) ? 'relative overflow-hidden' : ''}
  `;

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={buttonClassName}
      {...props}
    >
      {children}
      {!canAccessFeature(feature) && (
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 opacity-20" />
      )}
    </button>
  );
};

// Wrapper pour les sections complètes
export const FeatureSection = ({ 
  feature, 
  children, 
  title = "Fonctionnalité Premium",
  description = "Cette fonctionnalité nécessite un plan supérieur",
  context = ""
}) => {
  const { canAccessFeature, showPaywall } = usePaywall();

  if (canAccessFeature(feature)) {
    return children;
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-300 z-10 flex items-center justify-center">
        <div className="text-center p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 mb-4 max-w-md">{description}</p>
          <PaywallButton 
            feature={feature}
            text="Débloquer cette fonctionnalité"
            context={context}
            onClick={() => showPaywall(feature, context)}
          />
        </div>
      </div>
      <div className="blur-sm opacity-50 pointer-events-none">
        {children}
      </div>
    </div>
  );
};

// Wrapper spécialisé pour les programmes
export const ProgrammeFeatureGate = ({ 
  children, 
  fallback = null,
  context = "création de programme"
}) => {
  return (
    <FeatureGate
      feature="CREATE_PROGRAMME"
      fallback={fallback}
      context={context}
      buttonText="Créer plus de programmes"
    >
      {children}
    </FeatureGate>
  );
};

// Wrapper spécialisé pour les assistants IA
export const AIAssistantGate = ({ 
  assistantType,
  children, 
  fallback = null,
  context = ""
}) => {
  const featureMap = {
    'CONVERSATIONNEL': 'AI_CONVERSATIONNEL',
    'BIBLIOTHEQUE': 'AI_BIBLIOTHEQUE', 
    'CLINIQUE': 'AI_CLINIQUE',
    'ADMINISTRATIF': 'AI_ADMINISTRATIF'
  };

  const feature = featureMap[assistantType];
  if (!feature) {
    console.error(`Assistant type ${assistantType} not recognized`);
    return null;
  }

  return (
    <FeatureGate
      feature={feature}
      fallback={fallback}
      context={context || `assistant ${assistantType.toLowerCase()}`}
      buttonText={`Accéder à l'assistant ${assistantType.toLowerCase()}`}
    >
      {children}
    </FeatureGate>
  );
};