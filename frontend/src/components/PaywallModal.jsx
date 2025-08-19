import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useSubscription } from '../hooks/useSubscription';
import { getAuth } from 'firebase/auth';
import { 
  Crown, 
  Check, 
  Zap, 
  Users, 
  X, 
  MessageSquare,
  BookOpen,
  Stethoscope,
  Sparkles,
  FileText
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { plans } from '../config/plans';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const PaywallModal = ({ isOpen, onClose }) => {
  const { subscription } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [pioneerSlotsRemaining, setPioneerSlotsRemaining] = useState(null);

  console.log('🚀 Modal ouvert:', isOpen);
  console.log('📊 Plan actuel:', subscription?.planType);

  // Récupérer les places restantes pour le plan Pionnier
  useEffect(() => {
    const fetchPioneerSlots = async () => {
      try {
        const response = await fetch(`${API_URL}/api/plans/PIONNIER/remaining-slots`);
        const data = await response.json();
        setPioneerSlotsRemaining(data.remaining);
        console.log('🏆 Places Pionnier restantes:', data.remaining);
      } catch (error) {
        console.error('❌ Erreur slots Pionnier:', error);
      }
    };

    if (isOpen) {
      fetchPioneerSlots();
    }
  }, [isOpen]);

  // Créer une session de checkout
  const handleUpgrade = async (planType) => {
    console.log('🛒 Création commande pour plan:', planType);
    
    const user = getAuth().currentUser;
    if (!user) {
      toast({
        title: "Erreur",
        description: "Vous devez être connecté",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const token = await user.getIdToken();
      
      const response = await fetch(`${API_URL}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          planType,
          successUrl: `${window.location.origin}/dashboard/kine?upgrade=success`,
          cancelUrl: `${window.location.origin}/dashboard/kine?upgrade=cancel`
        })
      });

      const data = await response.json();
      console.log('📡 Réponse Stripe:', response.status, data);

      if (response.ok && data.url) {
        console.log('✅ Redirection vers Stripe:', data.url);
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Erreur checkout');
      }
    } catch (error) {
      console.error('❌ Erreur:', error);
      toast({
        title: "Erreur de paiement",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Vérifier si le plan est disponible
  const isPlanAvailable = (planType) => {
    if (planType === 'PIONNIER') {
      return pioneerSlotsRemaining > 0;
    }
    return true;
  };

  // Configuration des icônes par plan
  const getPlanIcon = (planType) => {
    switch (planType) {
      case 'DECLIC': return <Zap className="h-6 w-6" />;
      case 'PRATIQUE': return <Users className="h-6 w-6" />;
      case 'PIONNIER': return <Crown className="h-6 w-6" />;
      case 'EXPERT': return <Sparkles className="h-6 w-6" />;
      default: return <Zap className="h-6 w-6" />;
    }
  };

  // Couleurs par plan
  const getPlanColors = (planType) => {
    const colors = {
      'DECLIC': { bg: 'bg-gray-50', border: 'border-gray-200', button: 'bg-gray-600 hover:bg-gray-700' },
      'PRATIQUE': { bg: 'bg-blue-50', border: 'border-blue-200', button: 'bg-blue-600 hover:bg-blue-700' },
      'PIONNIER': { bg: 'bg-purple-50', border: 'border-purple-200', button: 'bg-purple-600 hover:bg-purple-700' },
      'EXPERT': { bg: 'bg-amber-50', border: 'border-amber-200', button: 'bg-amber-600 hover:bg-amber-700' }
    };
    return colors[planType] || colors['DECLIC'];
  };

  const currentPlan = subscription?.planType;
  const recommendedPlan = !subscription || subscription.planType === 'FREE' ? 'DECLIC' : 'EXPERT';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="w-[95vw] max-w-[1400px] h-[95vh] max-h-[95vh] p-0 overflow-hidden"
        style={{ 
          width: '95vw', 
          maxWidth: '1400px', 
          height: '95vh', 
          maxHeight: '95vh',
          zIndex: 9999 
        }}
      >
        {/* Header fixe */}
        <DialogHeader className="px-6 py-4 border-b bg-white sticky top-0 z-10">
          <DialogTitle className="text-3xl font-bold text-center">
            Choisissez votre plan KineAI
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600 text-lg">
            Débloquez toutes les fonctionnalités pour optimiser votre pratique
          </DialogDescription>
        </DialogHeader>

        {/* Contenu scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Debug Info */}
          <div className="bg-blue-50 p-4 rounded-lg text-base mb-6">
            <strong>📊 Debug Info:</strong><br/>
            Plan actuel: <code className="bg-white px-2 py-1 rounded">{currentPlan || 'Aucun'}</code><br/>
            Plan recommandé: <code className="bg-white px-2 py-1 rounded">{recommendedPlan}</code><br/>
            Places Pionnier: <code className="bg-white px-2 py-1 rounded">{pioneerSlotsRemaining ?? 'Chargement...'}</code>
          </div>

          {/* Grid des plans - Responsive */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {Object.values(plans).map((plan) => {
              const colors = getPlanColors(plan.type);
              const isCurrentPlan = currentPlan === plan.type;
              const isRecommended = recommendedPlan === plan.type;
              const isAvailable = isPlanAvailable(plan.type);

              return (
                <Card 
                  key={plan.type}
                  className={`relative ${colors.border} ${colors.bg} transition-all duration-200 hover:shadow-lg ${
                    isRecommended ? 'ring-4 ring-blue-500 scale-105 shadow-xl' : ''
                  } ${!isAvailable ? 'opacity-60' : ''}`}
                >
                  {/* Badge recommandé */}
                  {isRecommended && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-blue-600 text-white text-sm px-3 py-1">
                        ⭐ Recommandé
                      </Badge>
                    </div>
                  )}

                  {/* Badge plan actuel */}
                  {isCurrentPlan && (
                    <div className="absolute -top-4 right-4">
                      <Badge variant="secondary" className="bg-green-600 text-white text-sm px-3 py-1">
                        ✅ Actuel
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="text-center pb-4 pt-6">
                    <div className={`mx-auto p-4 rounded-full ${colors.bg} ${colors.border} border-2 mb-3`}>
                      {getPlanIcon(plan.type)}
                    </div>
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                    <div className="text-4xl font-bold text-gray-900">
                      {plan.price}€
                      <span className="text-lg font-normal text-gray-500">/mois</span>
                    </div>
                    
                    {/* Status du plan Pionnier */}
                    {plan.type === 'PIONNIER' && (
                      <Badge variant={pioneerSlotsRemaining === 0 ? 'destructive' : 'secondary'} className="text-sm">
                        {pioneerSlotsRemaining === 0 ? '❌ Complet' : `🔥 ${pioneerSlotsRemaining || '?'} places restantes`}
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-6 px-6">
                    {/* Limites */}
                    <div className="text-center">
                      <div className="flex items-center justify-center text-lg font-semibold">
                        <MessageSquare className="h-5 w-5 mr-2 text-gray-600" />
                        <span>
                          {plan.limits.programmes === -1 
                            ? '∞ Programmes illimités' 
                            : `${plan.limits.programmes} programme${plan.limits.programmes > 1 ? 's' : ''} avec IA`
                          }
                        </span>
                      </div>
                    </div>

                    {/* Assistants IA disponibles */}
                    <div className="space-y-3">
                      <div className="flex items-center text-base">
                        <Check className="h-5 w-5 mr-3 text-green-500 flex-shrink-0" />
                        <span className="font-medium">Assistant Conversationnel</span>
                      </div>
                      
                      {plan.features.assistants.includes('BIBLIOTHEQUE') ? (
                        <div className="flex items-center text-base">
                          <BookOpen className="h-5 w-5 mr-3 text-green-500 flex-shrink-0" />
                          <span className="font-medium">Assistant Bibliothèque</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-base text-gray-400">
                          <X className="h-5 w-5 mr-3 flex-shrink-0" />
                          <span>Assistant Bibliothèque</span>
                        </div>
                      )}
                      
                      {plan.features.assistants.includes('CLINIQUE') ? (
                        <div className="flex items-center text-base">
                          <Stethoscope className="h-5 w-5 mr-3 text-green-500 flex-shrink-0" />
                          <span className="font-medium">Assistant Clinique</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-base text-gray-400">
                          <X className="h-5 w-5 mr-3 flex-shrink-0" />
                          <span>Assistant Clinique</span>
                        </div>
                      )}

                      {plan.features.assistants.includes('ADMINISTRATIF') ? (
                        <div className="flex items-center text-base">
                          <FileText className="h-5 w-5 mr-3 text-green-500 flex-shrink-0" />
                          <span className="font-medium">Assistant Administratif</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-base text-gray-400">
                          <X className="h-5 w-5 mr-3 flex-shrink-0" />
                          <span>Assistant Administratif</span>
                        </div>
                      )}
                    </div>

                    {/* Bouton d'action */}
                    <Button
                      onClick={() => {
                        console.log(`🖱️ Click sur: ${plan.type}`);
                        handleUpgrade(plan.type);
                      }}
                      disabled={isCurrentPlan || !isAvailable || isLoading}
                      className={`w-full ${colors.button} text-white text-lg py-3 h-auto font-semibold`}
                    >
                      {isLoading ? (
                        '⏳ Chargement...'
                      ) : isCurrentPlan ? (
                        '✅ Plan actuel'
                      ) : !isAvailable ? (
                        '❌ Non disponible'
                      ) : (
                        `🚀 Choisir ${plan.name} - ${plan.price}€/mois`
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Message plan Pionnier */}
          {pioneerSlotsRemaining !== null && pioneerSlotsRemaining <= 10 && pioneerSlotsRemaining > 0 && (
            <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center">
                <Crown className="h-6 w-6 text-purple-600 mr-3" />
                <div>
                  <h4 className="font-bold text-purple-900 text-xl">
                    Plan Pionnier - Offre limitée
                  </h4>
                  <p className="text-purple-700 text-lg mt-1">
                    Plus que {pioneerSlotsRemaining} places disponibles à vie ! 
                    Une fois les 100 places épuisées, cette offre ne sera plus jamais disponible.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Note de sécurité */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg text-center">
            <p className="text-gray-600 text-lg">
              🔒 Paiement sécurisé par Stripe • Annulation possible à tout moment
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};