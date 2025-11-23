import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Crown, Lock, MessageSquare, BookOpen, Stethoscope, FileText } from 'lucide-react';
import { usePaywall } from '../hooks/usePaywall';
import { PaywallModal } from './PaywallModal';

export const ChatUpgradeHeader = ({ assistantType, canAccessFeature, isLoading, subscription }) => {
  // Si les props ne sont pas fournies, utiliser le hook (fallback)
  const paywall = canAccessFeature && isLoading !== undefined && subscription !== undefined ? 
    { canAccessFeature, isLoading, subscription } : 
    usePaywall();
    
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Mapping des types d'assistant vers les features
  const featureMap = {
    'CONVERSATIONNEL': 'AI_CONVERSATIONNEL',
    'BIBLIOTHEQUE': 'AI_BIBLIOTHEQUE',
    'CLINIQUE': 'AI_CLINIQUE',
    'ADMINISTRATIF': 'AI_ADMINISTRATIF',
    'TEMPLATES_ADMIN': 'TEMPLATES_ADMIN'
  };

  // Configuration des icônes par assistant
  const getAssistantConfig = (type) => {
    const configs = {
      'CONVERSATIONNEL': { 
        icon: MessageSquare, 
        name: 'Conversationnel',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200'
      },
      'BIBLIOTHEQUE': { 
        icon: BookOpen, 
        name: 'Bibliothèque',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200'
      },
      'CLINIQUE': { 
        icon: Stethoscope, 
        name: 'Clinique',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200'
      },
      'ADMINISTRATIF': {
        icon: FileText,
        name: 'Administratif',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200'
      },
      'TEMPLATES_ADMIN': {
        icon: FileText,
        name: 'Administratif',
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200'
      }
    };
    return configs[type] || configs['CONVERSATIONNEL'];
  };

  const feature = featureMap[assistantType];
  if (!feature) {
    console.error(`Assistant type ${assistantType} not recognized`);
    return null;
  }

  // ✅ Attendre la fin du chargement avant de prendre une décision
  if (paywall.isLoading) {
    return null;
  }

  // Si l'accès est autorisé, ne pas afficher le header
  if (paywall.canAccessFeature(feature)) {
    return null;
  }

  const config = getAssistantConfig(assistantType);
  const IconComponent = config.icon;

  return (
    <>
      <Card className={`mb-4 ${config.bgColor} ${config.borderColor} border-2`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${config.bgColor} border ${config.borderColor} rounded-lg`}>
                <Lock className={`h-5 w-5 ${config.color}`} />
              </div>
              <div>
                <h3 className={`font-semibold ${config.color} flex items-center gap-2`}>
                  <IconComponent className="h-5 w-5" />
                  Assistant {config.name} - Premium
                </h3>
                <p className="text-sm text-muted-foreground">
                  Cette fonctionnalité nécessite un plan d'abonnement supérieur
                </p>
              </div>
            </div>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white border-0 shadow-lg"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade
            </Button>
          </div>
        </CardContent>
      </Card>

      <PaywallModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        subscription={paywall.subscription}
      />
    </>
  );
};

// Wrapper pour désactiver les zones d'interaction du chat
export const ChatDisabledOverlay = ({ children, assistantType, canAccessFeature, isLoading }) => {
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

  // ✅ Attendre la fin du chargement avant de prendre une décision
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
          <Lock className="h-8 w-8 text-amber-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-2">
            Accès restreint
          </p>
          <p className="text-xs text-gray-500">
            Cette fonctionnalité nécessite un plan supérieur
          </p>
        </div>
      </div>
    </div>
  );
};