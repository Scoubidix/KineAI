import React, { useState, useEffect, useCallback } from 'react';
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
import { Input } from './ui/input';
import { Label } from './ui/label';
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
  FileText,
  CheckCircle,
  CreditCard,
  Calendar,
  Shield,
  Loader2,
  Gift
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { plans } from '../config/plans';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const PaywallModal = ({ isOpen, onClose, subscription }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [pioneerSlotsRemaining, setPioneerSlotsRemaining] = useState(null);

  // États pour le système d'étapes
  const [currentStep, setCurrentStep] = useState('selection'); // 'selection' | 'confirmation'
  const [pendingUpgrade, setPendingUpgrade] = useState(null); // {planType, planData, currentPlan}

  // État pour le code de parrainage
  const [referralCode, setReferralCode] = useState('');


  // Récupérer les places restantes pour le plan Pionnier (optimisé)
  const fetchPioneerSlots = useCallback(async () => {
    if (!isOpen) return;
    
    try {
      const response = await fetch(`${API_URL}/api/plans/PIONNIER/remaining-slots`);
      const data = await response.json();
      setPioneerSlotsRemaining(data.remaining);
    } catch (error) {
      console.error('Erreur slots Pionnier:', error);
      setPioneerSlotsRemaining(0); // Fallback sécurisé
    }
  }, [isOpen]);

  useEffect(() => {
    fetchPioneerSlots();
  }, [fetchPioneerSlots]);

  // Vérifier si c'est un changement de plan ou un nouvel abonnement
  const isUpgrade = subscription && subscription.planType && subscription.planType !== 'FREE';

  // Créer une session de checkout (défini en premier car utilisé par handlePlanClick)
  const handleUpgrade = useCallback(async (planType) => {

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

      const payload = {
        planType,
        successUrl: `${window.location.origin}/dashboard/kine/upgrade/success?upgrade=success`,
        cancelUrl: `${window.location.origin}/dashboard/kine/home`,
        ...(referralCode.trim() && { referralCode: referralCode.trim().toUpperCase() })
      };
      console.log('🎁 Checkout payload:', payload);

      const response = await fetch(`${API_URL}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.url) {
        // Vérifier le type de réponse
        if (data.type === 'plan_change') {
          // Changement de plan instantané → toast amélioré SANS redirection
          toast({
            title: "Plan modifié avec succès !",
            description: `✅ Changement de ${data.subscription.previousPlan} vers ${data.subscription.newPlan} effectué
💳 Proratisation automatique sur votre prochaine facture
🚀 Nouvelles fonctionnalités actives immédiatement`,
            variant: "default",
            className: "bg-green-50 border-green-200 text-green-800",
            duration: 6000
          });

          // Fermer la modal - l'utilisateur reste dans l'app
          onClose();

          // ✅ PAS de redirection pour les changements de plan

        } else {
          // Nouveau checkout classique → redirection Stripe
          window.location.href = data.url;
        }
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
  }, [referralCode, onClose]);

  // Gérer le clic sur un plan (avec confirmation si nécessaire)
  const handlePlanClick = useCallback((planType) => {
    const selectedPlan = plans[planType];

    if (isUpgrade) {
      // Abonnement existant → passer à l'étape de confirmation
      setPendingUpgrade({
        planType,
        planData: selectedPlan,
        currentPlan: subscription.planType
      });
      setCurrentStep('confirmation');
    } else {
      // Nouvel abonnement → checkout direct
      handleUpgrade(planType);
    }
  }, [isUpgrade, subscription, handleUpgrade]);

  // Confirmation du changement de plan
  const handleConfirmUpgrade = useCallback(async () => {
    if (pendingUpgrade) {
      await handleUpgrade(pendingUpgrade.planType);
      // Reset après succès
      setPendingUpgrade(null);
      setCurrentStep('selection');
    }
  }, [pendingUpgrade, handleUpgrade]);

  // Annuler la confirmation
  const handleCancelUpgrade = useCallback(() => {
    setPendingUpgrade(null);
    setCurrentStep('selection');
  }, []);

  // Gérer la fermeture de la modal avec reset
  const handleModalClose = useCallback(() => {
    // Reset tous les états
    setPendingUpgrade(null);
    setCurrentStep('selection');
    setReferralCode('');
    onClose();
  }, [onClose]);

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
  const recommendedPlan = !subscription || subscription.planType === 'FREE' ? 'PRATIQUE' : 'EXPERT';

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent 
        className={`p-0 overflow-hidden ${
          currentStep === 'confirmation' 
            ? 'max-w-md sm:max-w-md' 
            : 'max-w-7xl sm:max-w-7xl w-[95vw] max-h-[90vh]'
        }`}
      >
        {currentStep === 'selection' ? (
          <>
            {/* Header - Style cohérent avec l'app */}
            <DialogHeader className="px-6 py-4 border-b border-border bg-card">
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <Shield className="h-5 w-5 text-accent" />
                Mon Assistant Kiné
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Choisissez votre plan d'abonnement professionnel
              </DialogDescription>
            </DialogHeader>

            {/* Contenu scrollable */}
            <div className="p-6 overflow-y-auto space-y-6 bg-background">

              {/* Grid des plans - Style cohérent avec l'app */}
              <div className="flex flex-wrap justify-center gap-4 max-w-7xl mx-auto">
                {Object.values(plans)
                  .filter(plan => isPlanAvailable(plan.type))
                  .map((plan) => {
                  const isCurrentPlan = currentPlan === plan.type;
                  const isRecommended = recommendedPlan === plan.type;
                  const isAvailable = isPlanAvailable(plan.type);

                  return (
                    <Card 
                      key={plan.type}
                      className={`relative flex flex-col w-64 shadow-lg border-border transition-all duration-200 hover:shadow-xl cursor-pointer ${
                        isRecommended ? 'ring-2 ring-accent shadow-accent/20' : ''
                      } ${!isAvailable ? 'opacity-60 cursor-not-allowed' : ''} ${isCurrentPlan ? 'ring-2 ring-primary shadow-primary/20' : 'hover:border-muted-foreground/30'}`}
                      onClick={!isCurrentPlan && isAvailable ? () => handlePlanClick(plan.type) : undefined}
                    >
                      {/* Badge recommandé */}
                      {isRecommended && (
                        <div className="absolute -top-3 right-3">
                          <Badge className="bg-accent text-accent-foreground text-xs px-3 py-1 rounded-full shadow-md">
                            Recommandé
                          </Badge>
                        </div>
                      )}

                      {/* Badge plan actuel */}
                      {isCurrentPlan && (
                        <div className="absolute -top-3 left-3">
                          <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full shadow-md">
                            Plan actuel
                          </Badge>
                        </div>
                      )}

                      <CardHeader className="text-center pb-4">
                        <div className={`mx-auto p-3 rounded-full mb-3 ${
                          isCurrentPlan ? 'bg-primary/10' : isRecommended ? 'bg-accent/10' : 'bg-muted/30'
                        }`}>
                          <Shield className={`h-6 w-6 ${
                            isCurrentPlan ? 'text-primary' : isRecommended ? 'text-accent' : 'text-muted-foreground'
                          }`} />
                        </div>
                        <CardTitle className="text-lg font-semibold text-foreground">{plan.name}</CardTitle>
                        <div className="text-3xl font-bold text-foreground">
                          {plan.price}€
                          <span className="text-sm font-normal text-muted-foreground">/mois</span>
                        </div>
                        
                        {/* Status du plan Pionnier */}
                        {plan.type === 'PIONNIER' && (
                          <Badge 
                            variant={pioneerSlotsRemaining === 0 ? 'destructive' : 'secondary'} 
                            className="text-xs mt-2 font-medium"
                          >
                            {pioneerSlotsRemaining === 0 ? '🔒 Complet' : `🔥 ${pioneerSlotsRemaining || '?'} places restantes`}
                          </Badge>
                        )}
                      </CardHeader>

                      <CardContent className="flex flex-col flex-grow px-6 space-y-4">
                        {/* Programmes limit */}
                        <div className="text-center py-3 bg-muted/20 rounded-lg border">
                          <span className="text-sm font-semibold text-foreground">
                            {plan.limits.programmes === -1 
                              ? '♾️ Programmes illimités' 
                              : `${plan.limits.programmes} programme${plan.limits.programmes > 1 ? 's' : ''} max`
                            }
                          </span>
                        </div>

                        {/* Fonctionnalités principales */}
                        <div className="space-y-2 flex-grow text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                            <span>Gestion patients</span>
                          </div>
                          
                          {plan.features.assistants.includes('CONVERSATIONNEL') && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>IA Conversationnelle</span>
                            </div>
                          )}
                          
                          {plan.features.assistants.includes('BIBLIOTHEQUE') && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>IA Bibliographique</span>
                            </div>
                          )}
                          
                          {plan.features.assistants.includes('CLINIQUE') && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>IA Clinique</span>
                            </div>
                          )}

                          {plan.features.assistants.includes('ADMINISTRATIF') && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>IA Administrative</span>
                            </div>
                          )}

                          {plan.features.bilanKine && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>Bilan kiné</span>
                            </div>
                          )}
                        </div>

                        {/* Bouton d'action - poussé vers le bas */}
                        <div className="mt-auto pt-4">
                          <Button
                            onClick={!isCurrentPlan && isAvailable ? () => handlePlanClick(plan.type) : undefined}
                            disabled={isCurrentPlan || !isAvailable || isLoading}
                            className={`w-full h-11 font-medium transition-all ${
                              isCurrentPlan 
                                ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                                : !isAvailable 
                                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                  : 'bg-accent text-accent-foreground hover:bg-accent/90 shadow-md hover:shadow-lg'
                            }`}
                            variant={isCurrentPlan ? "secondary" : "default"}
                          >
                            {isLoading ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Chargement...</>
                            ) : isCurrentPlan ? (
                              <>✓ Plan actuel</>
                            ) : !isAvailable ? (
                              '🔒 Non disponible'
                            ) : isUpgrade ? (
                              `Passer à ${plan.name}`
                            ) : (
                              `Choisir ${plan.name}`
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
              );
            })}
          </div>

              {/* Message plan Pionnier - Style cohérent */}
              {pioneerSlotsRemaining !== null && pioneerSlotsRemaining <= 10 && pioneerSlotsRemaining > 0 && (
                <Card className="shadow-lg border-border bg-gradient-to-r from-purple-50 to-amber-50 border-purple-200">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-purple-100">
                        <Crown className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-purple-900">Plan Pionnier - Offre limitée</p>
                        <p className="text-sm text-purple-700">
                          Plus que <span className="font-bold">{pioneerSlotsRemaining}</span> places sur 100 disponibles
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Champ Code de parrainage - Seulement pour nouveaux abonnements */}
              {!isUpgrade && (
                <Card className="border-dashed border-primary/30 bg-primary/5">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Gift className="h-5 w-5 text-primary" />
                      <Label htmlFor="referralCode" className="font-medium">Code de parrainage (optionnel)</Label>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="referralCode"
                        placeholder="Ex: ABC123"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        className="font-mono tracking-wider uppercase"
                        maxLength={10}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Vous avez un code de parrainage ? Entrez-le pour recevoir 1 mois offert après votre premier renouvellement.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Note de sécurité - Style cohérent */}
              <div className="flex items-center justify-center gap-4 py-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  <span>Paiement sécurisé Stripe</span>
                </div>
                <span>•</span>
                <span>Annulation à tout moment</span>
                <span>•</span>
                <span>Support professionnel</span>
              </div>
            </div>
          </>
        ) : (
          /* Étape de confirmation */
          <>
            <DialogHeader>
              <DialogTitle className="text-center">
                Confirmer le changement de plan ?
              </DialogTitle>
            </DialogHeader>
            
            {pendingUpgrade && (
              <div className="space-y-4 p-6">
                {/* Plan actuel */}
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div>
                    <p className="font-medium text-red-900">Plan actuel</p>
                    <p className="text-sm text-red-700">
                      {plans[pendingUpgrade.currentPlan]?.name} - {plans[pendingUpgrade.currentPlan]?.price}€/mois
                    </p>
                  </div>
                  <div className="text-red-600">❌</div>
                </div>

                {/* Nouveau plan */}
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div>
                    <p className="font-medium text-green-900">Nouveau plan</p>
                    <p className="text-sm text-green-700">
                      {pendingUpgrade.planData.name} - {pendingUpgrade.planData.price}€/mois
                    </p>
                  </div>
                  <div className="text-green-600">✅</div>
                </div>

                {/* Informations importantes */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-800">Accès immédiat aux nouvelles fonctionnalités</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-800">Proratisation automatique sur votre prochaine facture</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-800">Aucun prélèvement aujourd'hui</span>
                    </div>
                  </div>
                </div>

                {/* Boutons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCancelUpgrade}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    Retour
                  </Button>
                  <Button
                    onClick={handleConfirmUpgrade}
                    disabled={isLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isLoading ? '⏳ Changement...' : 'Confirmer'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};