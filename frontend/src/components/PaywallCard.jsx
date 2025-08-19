import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { PaywallButton } from './PaywallButton';
import { usePaywall } from '../hooks/usePaywall';
import { useCurrentUsage } from '../hooks/useCurrentUsage';
import { 
  MessageSquare, 
  Crown, 
  BookOpen, 
  Stethoscope,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';

export const PaywallCard = ({ 
  feature,
  className = "",
  showUsage = false,
  compact = false
}) => {
  const { subscription, getPaywallMessage, getRecommendedPlan } = usePaywall();
  const { usage, getUsagePercentage, isNearLimit } = useCurrentUsage();

  // Configuration par fonctionnalité
  const getFeatureConfig = (feature) => {
    switch (feature) {
      case 'CREATE_CHATBOT':
        return {
          icon: MessageSquare,
          title: 'Limite de chatbots atteinte',
          color: 'blue',
          gradient: 'from-blue-50 to-blue-100',
          showProgress: true
        };
      case 'AI_BIBLIOTHEQUE':
        return {
          icon: BookOpen,
          title: 'Assistant Bibliothèque',
          color: 'green',
          gradient: 'from-green-50 to-green-100',
          showProgress: false
        };
      case 'AI_CLINIQUE':
        return {
          icon: Stethoscope,
          title: 'Assistant Clinique',
          color: 'blue',
          gradient: 'from-blue-50 to-blue-100',
          showProgress: false
        };
      case 'ALL_AI_ASSISTANTS':
        return {
          icon: Crown,
          title: 'Tous les assistants IA',
          color: 'purple',
          gradient: 'from-purple-50 to-purple-100',
          showProgress: false
        };
      default:
        return {
          icon: TrendingUp,
          title: 'Fonctionnalité Premium',
          color: 'gray',
          gradient: 'from-gray-50 to-gray-100',
          showProgress: false
        };
    }
  };

  const config = getFeatureConfig(feature);
  const Icon = config.icon;
  const recommendedPlan = getRecommendedPlan(feature);
  const message = getPaywallMessage(feature);

  // Version compacte
  if (compact) {
    return (
      <div className={`p-3 border rounded-lg bg-gradient-to-r ${config.gradient} ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Icon className={`h-4 w-4 text-${config.color}-600`} />
            <span className="text-sm font-medium text-gray-900">
              {config.title}
            </span>
          </div>
          <PaywallButton 
            feature={feature}
            size="sm"
            text="Débloquer"
          />
        </div>
      </div>
    );
  }

  return (
    <Card className={`${className} border-l-4 border-l-${config.color}-500`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full bg-${config.color}-100`}>
              <Icon className={`h-5 w-5 text-${config.color}-600`} />
            </div>
            <div>
              <CardTitle className="text-lg">{config.title}</CardTitle>
              <Badge variant="outline" className="mt-1">
                Plan {recommendedPlan}
              </Badge>
            </div>
          </div>
          {isNearLimit(subscription?.planType) && feature === 'CREATE_CHATBOT' && (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Message descriptif */}
        <p className="text-sm text-gray-600">
          {message}
        </p>

        {/* Barre de progression pour les chatbots */}
        {showUsage && config.showProgress && subscription && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Chatbots utilisés</span>
              <span className="font-medium">
                {usage.activeChatbots} / {
                  subscription.planType === 'DECLIC' ? '1' :
                  subscription.planType === 'PRATIQUE' ? '3' : '∞'
                }
              </span>
            </div>
            <Progress 
              value={getUsagePercentage(subscription.planType)} 
              className="h-2"
            />
            {isNearLimit(subscription.planType) && (
              <p className="text-xs text-amber-600">
                ⚠️ Vous approchez de la limite de votre plan
              </p>
            )}
          </div>
        )}

        {/* Avantages du plan recommandé */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">
            Avec le plan {recommendedPlan} :
          </h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {recommendedPlan === 'PRATIQUE' && (
              <>
                <li>• Jusqu'à 3 chatbots actifs</li>
                <li>• Assistant Bibliothèque</li>
                <li>• Assistant Clinique</li>
              </>
            )}
            {recommendedPlan === 'PIONNIER' && (
              <>
                <li>• Chatbots illimités</li>
                <li>• Tous les assistants IA</li>
                <li>• Offre limitée (places restantes)</li>
              </>
            )}
            {recommendedPlan === 'EXPERT' && (
              <>
                <li>• Chatbots illimités</li>
                <li>• Tous les assistants IA</li>
                <li>• Support prioritaire</li>
              </>
            )}
          </ul>
        </div>

        {/* Bouton d'action */}
        <PaywallButton 
          feature={feature}
          text={`Passer au plan ${recommendedPlan}`}
          className="w-full"
        />
      </CardContent>
    </Card>
  );
};