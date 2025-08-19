import React from 'react';
import { Crown, Zap, ArrowUp, MessageSquare, BookOpen, Stethoscope, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { usePaywall } from '../hooks/usePaywall';

export const PaywallButton = ({ 
  feature,
  text = "Passer au plan supérieur",
  variant = "default",
  size = "default",
  icon = true,
  context = "",
  className = "",
  onClick,
  ...props 
}) => {
  const { showPaywall, getRecommendedPlan } = usePaywall();
  
  const recommendedPlan = getRecommendedPlan(feature);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      showPaywall(feature, context);
    }
  };

  // Icône selon la fonctionnalité
  const getIcon = () => {
    if (!icon) return null;
    
    switch (feature) {
      case 'CREATE_PROGRAMME':
        return <MessageSquare className="h-4 w-4" />;
      case 'AI_CONVERSATIONNEL':
        return <MessageSquare className="h-4 w-4" />;
      case 'AI_BIBLIOTHEQUE':
        return <BookOpen className="h-4 w-4" />;
      case 'AI_CLINIQUE':
        return <Stethoscope className="h-4 w-4" />;
      case 'AI_ADMINISTRATIF':
        return <Crown className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  // Style selon le plan recommandé
  const getButtonStyle = () => {
    switch (recommendedPlan) {
      case 'DECLIC':
        return 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white border-0';
      case 'PRATIQUE':
        return 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0';
      case 'PIONNIER':
        return 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white border-0';
      case 'EXPERT':
        return 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white border-0';
      default:
        return 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white border-0';
    }
  };

  // Texte selon le plan recommandé et la fonctionnalité
  const getPlanText = () => {
    switch (recommendedPlan) {
      case 'DECLIC':
        return 'Plan Déclic';
      case 'PRATIQUE':
        return 'Plan Pratique';
      case 'PIONNIER':
        return 'Plan Pionnier';
      case 'EXPERT':
        return 'Plan Expert';
      default:
        return 'Plan supérieur';
    }
  };

  // Texte contextualisé selon la fonctionnalité
  const getFeatureText = () => {
    switch (feature) {
      case 'CREATE_PROGRAMME':
        return 'Créer plus de programmes';
      case 'AI_CONVERSATIONNEL':
        return 'Assistant Conversationnel';
      case 'AI_BIBLIOTHEQUE':
        return 'Assistant Bibliothèque';
      case 'AI_CLINIQUE':
        return 'Assistant Clinique';
      case 'AI_ADMINISTRATIF':
        return 'Assistant Administratif';
      default:
        return text;
    }
  };

  const buttonText = text.includes('plan') || text.includes('Plan') ? text : `${getFeatureText()} - ${getPlanText()}`;

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      className={`${getButtonStyle()} ${className} shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02]`}
      {...props}
    >
      {getIcon()}
      <span className="ml-2">{buttonText}</span>
    </Button>
  );
};

// Variante compacte pour les menus
export const PaywallButtonCompact = ({ 
  feature,
  text = "Premium",
  ...props 
}) => {
  return (
    <PaywallButton
      feature={feature}
      text={text}
      size="sm"
      variant="outline"
      className="h-6 px-2 text-xs"
      {...props}
    />
  );
};

// Variante pour les cards
export const PaywallButtonCard = ({ 
  feature,
  title,
  description,
  buttonText = "Débloquer",
  context = "",
  ...props 
}) => {
  const { showPaywall, getRecommendedPlan } = usePaywall();
  
  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-gradient-to-br from-gray-50 to-white">
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      <PaywallButton 
        feature={feature}
        text={buttonText}
        size="sm"
        context={context}
        className="w-full"
        {...props}
      />
    </div>
  );
};

// Variante spécialisée pour les programmes
export const CreateProgrammeButton = ({ 
  className = "",
  disabled = false,
  ...props 
}) => {
  return (
    <PaywallButton
      feature="CREATE_PROGRAMME"
      text="Créer un programme avec IA"
      className={`${className}`}
      disabled={disabled}
      context="création de programme"
      {...props}
    />
  );
};

// Variantes spécialisées pour les assistants IA
export const AIAssistantButton = ({ 
  assistantType,
  className = "",
  ...props 
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
    <PaywallButton
      feature={feature}
      className={className}
      context={`assistant ${assistantType.toLowerCase()}`}
      {...props}
    />
  );
};