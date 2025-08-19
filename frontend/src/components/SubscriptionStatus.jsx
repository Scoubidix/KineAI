import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { PaywallButton } from './PaywallButton';
import { usePaywall } from '../hooks/usePaywall';
import { useCurrentUsage } from '../hooks/useCurrentUsage';
import { 
  Crown, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  Settings,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Stethoscope,
  FileText
} from 'lucide-react';
import { plans } from '../config/plans';

export const SubscriptionStatus = ({ className = "" }) => {
  const { subscription, showPaywall } = usePaywall();
  const { usage, getUsagePercentage, isNearLimit, getPlanLimit } = useCurrentUsage();

  if (!subscription) {
    return (
      <Card className={`${className} border-amber-200 bg-amber-50`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="font-medium text-amber-900">
                Chargement de l'abonnement...
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentPlan = plans[subscription.planType];
  const usagePercentage = getUsagePercentage(subscription.planType);
  const nearLimit = isNearLimit(subscription.planType);
  const planLimit = getPlanLimit(subscription.planType);

  // Configuration des couleurs selon le plan
  const getPlanStyle = () => {
    switch (subscription.planType) {
      case 'DECLIC':
        return {
          gradient: 'from-gray-600 to-gray-700',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700'
        };
      case 'PRATIQUE':
        return {
          gradient: 'from-blue-600 to-blue-700',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700'
        };
      case 'PIONNIER':
        return {
          gradient: 'from-purple-600 to-purple-700',
          bg: 'bg-purple-50',
          border: 'border-purple-200',
          text: 'text-purple-700'
        };
      case 'EXPERT':
        return {
          gradient: 'from-amber-600 to-orange-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-700'
        };
      default:
        return {
          gradient: 'from-gray-600 to-gray-700',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700'
        };
    }
  };

  const style = getPlanStyle();

  return (
    <Card className={`${className} ${style.border} ${style.bg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full bg-gradient-to-r ${style.gradient}`}>
              {subscription.planType === 'PIONNIER' ? (
                <Crown className="h-5 w-5 text-white" />
              ) : (
                <Users className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <CardTitle className={`text-lg ${style.text}`}>
                Plan {currentPlan.name}
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Badge 
                  variant={subscription.status === 'active' ? 'default' : 'secondary'}
                  className={subscription.status === 'active' ? 'bg-green-600' : ''}
                >
                  {subscription.status === 'active' ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Actif
                    </>
                  ) : (
                    subscription.status
                  )}
                </Badge>
                <span className="text-sm text-gray-600">
                  {currentPlan.price}€/mois
                </span>
              </div>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => showPaywall('AI_ADMINISTRATIF')}
          >
            <Settings className="h-4 w-4 mr-1" />
            Gérer
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Usage des programmes pour les plans limités */}
        {planLimit !== -1 && planLimit > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Programmes avec IA utilisés</span>
              </div>
              <span className="text-sm font-semibold">
                {usage.activeProgrammes} / {planLimit}
              </span>
            </div>
            <Progress 
              value={usagePercentage} 
              className={`h-2 ${nearLimit ? 'bg-amber-100' : ''}`}
            />
            {nearLimit && (
              <div className="flex items-center space-x-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">
                  Vous approchez de la limite de votre plan
                </span>
              </div>
            )}
          </div>
        )}

        {/* Assistants IA inclus */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">
            Assistants IA inclus :
          </h4>
          <div className="grid grid-cols-1 gap-2 text-xs">
            {currentPlan.features.assistants.includes('CONVERSATIONNEL') && (
              <div className="flex items-center space-x-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Assistant Conversationnel</span>
              </div>
            )}
            {currentPlan.features.assistants.includes('BIBLIOTHEQUE') && (
              <div className="flex items-center space-x-1">
                <BookOpen className="h-3 w-3 text-green-500" />
                <span>Assistant Bibliothèque</span>
              </div>
            )}
            {currentPlan.features.assistants.includes('CLINIQUE') && (
              <div className="flex items-center space-x-1">
                <Stethoscope className="h-3 w-3 text-green-500" />
                <span>Assistant Clinique</span>
              </div>
            )}
            {currentPlan.features.assistants.includes('ADMINISTRATIF') && (
              <div className="flex items-center space-x-1">
                <FileText className="h-3 w-3 text-green-500" />
                <span>Assistant Administratif</span>
              </div>
            )}
          </div>
        </div>

        {/* Suggestion d'upgrade si pas le plan le plus élevé */}
        {subscription.planType !== 'EXPERT' && subscription.planType !== 'PIONNIER' && (
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">
                  Besoin de plus de fonctionnalités ?
                </p>
              </div>
              <PaywallButton 
                feature="AI_ADMINISTRATIF"
                text="Améliorer"
                size="sm"
                variant="outline"
              />
            </div>
          </div>
        )}

        {/* Message spécial pour le plan Pionnier */}
        {subscription.planType === 'PIONNIER' && (
          <div className="pt-2 border-t border-purple-200">
            <div className="flex items-center space-x-2">
              <Crown className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-purple-700 font-medium">
                Membre Pionnier - Accès à vie garanti !
              </span>
            </div>
          </div>
        )}

        {/* Statistiques d'utilisation */}
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Messages ce mois</span>
            <div className="flex items-center space-x-1">
              <TrendingUp className="h-3 w-3" />
              <span className="font-medium">{usage.monthlyMessages || 0}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Version compacte pour la sidebar
export const SubscriptionStatusCompact = ({ className = "" }) => {
  const { subscription } = usePaywall();
  const { usage, getPlanLimit } = useCurrentUsage();

  if (!subscription) return null;

  const currentPlan = plans[subscription.planType];
  const style = getPlanStyle(subscription.planType);
  const planLimit = getPlanLimit(subscription.planType);

  return (
    <div className={`p-3 rounded-lg ${style.bg} ${style.border} border ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-1 rounded-full bg-gradient-to-r ${style.gradient}`}>
            {subscription.planType === 'PIONNIER' ? (
              <Crown className="h-3 w-3 text-white" />
            ) : (
              <Users className="h-3 w-3 text-white" />
            )}
          </div>
          <span className="text-sm font-medium">{currentPlan.name}</span>
        </div>
        {planLimit !== -1 && planLimit > 0 && (
          <span className="text-xs text-gray-600">
            {usage.activeProgrammes}/{planLimit}
          </span>
        )}
      </div>
    </div>
  );
};

// Fonction utilitaire pour obtenir le style (utilisée dans la version compacte)
const getPlanStyle = (planType) => {
  switch (planType) {
    case 'DECLIC':
      return {
        gradient: 'from-gray-600 to-gray-700',
        bg: 'bg-gray-50',
        border: 'border-gray-200'
      };
    case 'PRATIQUE':
      return {
        gradient: 'from-blue-600 to-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200'
      };
    case 'PIONNIER':
      return {
        gradient: 'from-purple-600 to-purple-700',
        bg: 'bg-purple-50',
        border: 'border-purple-200'
      };
    case 'EXPERT':
      return {
        gradient: 'from-amber-600 to-orange-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200'
      };
    default:
      return {
        gradient: 'from-gray-600 to-gray-700',
        bg: 'bg-gray-50',
        border: 'border-gray-200'
      };
  }
};