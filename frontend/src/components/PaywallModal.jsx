import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
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
  Gift,
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { plans, getChatQuotaLabel } from '../config/plans';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const PaywallModal = ({ isOpen, onClose, subscription }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [pioneerSlotsRemaining, setPioneerSlotsRemaining] = useState(null);

  // canStartTrial : true si le kiné n'a jamais eu d'essai ni d'abonnement (= !hasHadTrial)
  const canStartTrial = subscription?.canStartTrial ?? false;

  // États pour le système d'étapes
  const [currentStep, setCurrentStep] = useState('selection'); // 'selection' | 'confirmation'
  const [pendingUpgrade, setPendingUpgrade] = useState(null); // {planType, planData, currentPlan}

  // État pour le code de parrainage
  const [referralCode, setReferralCode] = useState('');

  // Cycle de facturation choisi : 'monthly' | 'yearly' (annuel mis en avant par défaut)
  const [billingCycle, setBillingCycle] = useState('yearly');

  // Pop-up « aide FAMI » : au survol sur desktop (Popover), en accordéon tap-to-open sur mobile
  // (le hover n'existe pas sur tactile — standard « disclosure »).
  const [isFamiPopoverOpen, setIsFamiPopoverOpen] = useState(false);
  const [isFamiMobileOpen, setIsFamiMobileOpen] = useState(false);
  const famiPopoverTimeout = useRef(null);
  // Conteneur de la modal : à l'ouverture on y place le focus (a11y WAI-ARIA) au lieu de
  // le laisser sur le bouton déclencheur, qui passe en aria-hidden.
  const contentRef = useRef(null);


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

  // Vérifier si c'est un changement de plan ou un nouvel abonnement.
  // Pendant l'essai, le plan effectif est EXPERT mais il n'y a AUCUN abonnement Stripe
  // (subscriptionId null) → on traite comme un nouvel abonnement (checkout neuf), pas un changement.
  const isUpgrade = subscription && !subscription.isTrialing && subscription.planType && subscription.planType !== 'FREE';

  // Créer une session de checkout (défini en premier car utilisé par handlePlanClick)
  const handleUpgrade = useCallback(async (planType) => {

    const user = getAuth().currentUser;
    if (!user) {
      toast({
        title: "Erreur",
        description: "Tu dois être connecté",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const token = await user.getIdToken();

      const payload = {
        planType,
        billingCycle,
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
          // Changement de plan (immédiat ou différé à l'échéance) → toast SANS redirection
          toast({
            title: "Abonnement modifié",
            description: data.scheduled
              ? `Le passage de ${data.subscription.previousPlan} vers ${data.subscription.newPlan} prendra effet à la fin de ta période en cours.`
              : `Passage de ${data.subscription.previousPlan} vers ${data.subscription.newPlan} effectué.`,
            variant: "default",
            className: "toast-success",
            duration: 5000
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
  }, [referralCode, billingCycle, onClose]);

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
    setBillingCycle('yearly');
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

  const currentPlan = subscription?.planType ?? null;
  const currentCycle = subscription?.billingCycle || 'monthly';

  // Plan mis en avant (anneau teal + badge « Recommandé »), selon le plan actuel du kiné.
  // Pousse toujours vers plus de valeur ; le recommandé n'est jamais le plan actuel.
  // Pionnier (illimité, 19€, 100 places) est privilégié à Expert quand il reste des places.
  const recommendedPlan = (() => {
    const pionnierAvailable = pioneerSlotsRemaining > 0;
    switch (currentPlan ?? 'FREE') {
      case 'FREE':
        return pionnierAvailable ? 'PIONNIER' : 'PRATIQUE';
      case 'DECLIC':
        return pionnierAvailable ? 'PIONNIER' : 'PRATIQUE';
      case 'PRATIQUE':
        return pionnierAvailable ? 'PIONNIER' : 'EXPERT';
      default: // PIONNIER, EXPERT → aucune recommandation
        return null;
    }
  })();

  // Nature du changement en cours (pour la modale de récap). Doit rester aligné avec
  // StripeService.shouldDeferPlanChange côté back :
  // - downgrade de plan, ou annuel→mensuel, → différé à l'échéance ;
  // - MAIS un upgrade de plan reste immédiat même en passant au mensuel.
  const changeIsUpgrade = !!pendingUpgrade
    && (plans[pendingUpgrade.planType]?.price ?? 0) > (plans[pendingUpgrade.currentPlan]?.price ?? 0);
  const changeIsDowngrade = !!pendingUpgrade
    && (plans[pendingUpgrade.planType]?.price ?? 0) < (plans[pendingUpgrade.currentPlan]?.price ?? 0);
  const changeIsIntervalDowngrade = currentCycle === 'yearly' && billingCycle === 'monthly';
  const changeIsDeferred = changeIsDowngrade || (changeIsIntervalDowngrade && !changeIsUpgrade);
  // Passage à la facturation annuelle (immédiat, avec prélèvement du montant annuel proratisé)
  const changeToAnnual = billingCycle === 'yearly' && currentCycle !== 'yearly';
  const changeSamePlan = !!pendingUpgrade && pendingUpgrade.planType === pendingUpgrade.currentPlan;
  const currentPlanPriceLabel = currentCycle === 'yearly'
    ? `${plans[pendingUpgrade?.currentPlan]?.priceYearly}€/an`
    : `${plans[pendingUpgrade?.currentPlan]?.price}€/mois`;

  // --- Éléments réutilisés desktop / mobile (source unique) ---

  // Bascule Mensuel / Annuel : pleine largeur sur mobile (segmented control), auto sur desktop.
  const billingToggle = (
    <div className="flex w-full sm:w-auto items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
      <button
        type="button"
        onClick={() => setBillingCycle('monthly')}
        className={`flex-1 sm:flex-none rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          billingCycle === 'monthly' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Mensuel
      </button>
      <button
        type="button"
        onClick={() => setBillingCycle('yearly')}
        className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          billingCycle === 'yearly' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Annuel
        <span className="rounded-full bg-[#3899aa]/15 px-2 py-0.5 text-[10px] font-bold text-[#3899aa]">jusqu'à −15 %</span>
      </button>
    </div>
  );

  // Contenu explicatif « aide FAMI » (identique dans le Popover desktop et l'accordéon mobile).
  const famiSteps = [
    { title: "Tu t'abonnes en 2026", text: "Tu accèdes au module vidéotransmission sécurisée dès le premier jour." },
    { title: "Tu l'utilises normalement", text: "Consultations à distance, suivi post-op, directement intégré à ta pratique." },
    { title: "Tu déclares sur Amelipro (janv. – mars 2027)", text: "Une case à cocher sur Amelipro, au titre de l'année 2026. 5 minutes, une fois par an. Mon Assistant Kiné te fournit l'attestation d'équipement à joindre à ta déclaration." },
    { title: "Tu touches l'aide au printemps 2027", text: "350 € versés directement par ta CPAM. Pas de remboursement à demander, pas de facture." },
  ];
  const famiPanel = (
    <>
      <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-3">
        <HelpCircle className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-bold text-foreground">L'aide FAMI, comment ça marche ?</p>
      </div>
      <ol className="space-y-3 p-4">
        {famiSteps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent
        ref={contentRef}
        className={
          currentStep === 'confirmation'
            ? 'p-0 top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto'
            // Selection : plein écran sur mobile (standard modal pricing), dialog centré sur desktop (inchangé)
            : 'p-0 flex flex-col gap-0 top-0 left-0 translate-x-0 translate-y-0 w-screen max-w-none h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-hidden sm:grid sm:gap-4 sm:top-[50%] sm:left-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-7xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:border sm:overflow-y-auto'
        }
        onOpenAutoFocus={(e) => {
          // On évite l'autofocus sur un contrôle précis, mais on déplace le focus DANS la modal
          // (sinon il reste sur le déclencheur, qui est en aria-hidden -> warning a11y).
          e.preventDefault();
          contentRef.current?.focus();
        }}
      >
        {currentStep === 'selection' ? (
          <>
            {/* Header - Style cohérent avec l'app.
                Mobile : titre seul (1 colonne) → plus de wrap. Desktop : grille 3 colonnes inchangée. */}
            <DialogHeader className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <DialogTitle className="flex items-center gap-2.5 text-lg sm:text-xl font-semibold text-foreground">
                    <img
                      src="/logo.jpg"
                      alt="Mon Assistant Kiné"
                      className="h-8 w-8 rounded-md object-contain flex-shrink-0 bg-white/15 p-0.5"
                    />
                    <span>
                      <span className="text-[#3899aa]">M</span>on <span className="text-[#3899aa]">A</span>ssistant <span className="text-[#3899aa]">K</span>iné
                    </span>
                  </DialogTitle>
                  {/* Conservée en sr-only pour l'accessibilité (aria-describedby Radix), masquée visuellement */}
                  <DialogDescription className="sr-only">
                    Choisis ton plan d'abonnement professionnel
                  </DialogDescription>
                </div>

                {/* Bascule Mensuel / Annuel — centrée dans le header (desktop uniquement) */}
                <div className="hidden sm:flex justify-center">
                  {billingToggle}
                </div>

                {/* Bouton non cliquable « aide FAMI » — pop-up au survol (desktop uniquement) */}
                <Popover open={isFamiPopoverOpen} onOpenChange={setIsFamiPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400 px-3 py-1.5 text-xs font-bold text-amber-500 cursor-default justify-self-end mr-8"
                      onMouseEnter={() => {
                        if (famiPopoverTimeout.current) clearTimeout(famiPopoverTimeout.current);
                        setIsFamiPopoverOpen(true);
                      }}
                      onMouseLeave={() => {
                        famiPopoverTimeout.current = setTimeout(() => setIsFamiPopoverOpen(false), 150);
                      }}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      L'aide FAMI, comment ça marche ?
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-0"
                    align="end"
                    sideOffset={8}
                    onMouseEnter={() => {
                      if (famiPopoverTimeout.current) clearTimeout(famiPopoverTimeout.current);
                    }}
                    onMouseLeave={() => {
                      famiPopoverTimeout.current = setTimeout(() => setIsFamiPopoverOpen(false), 150);
                    }}
                  >
                    {famiPanel}
                  </PopoverContent>
                </Popover>
              </div>
            </DialogHeader>

            {/* Contenu scrollable (flex-1 min-h-0 => scroll interne en plein écran mobile) */}
            <div className="flex-1 min-h-0 p-3 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">

              {/* Contrôles mobile : bascule pleine largeur + aide FAMI en accordéon (desktop = dans le header) */}
              <div className="sm:hidden space-y-3">
                {billingToggle}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsFamiMobileOpen((v) => !v)}
                    aria-expanded={isFamiMobileOpen}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-400 px-3 py-2.5 text-sm font-bold text-amber-500"
                  >
                    <span className="flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4" />
                      L'aide FAMI, comment ça marche ?
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isFamiMobileOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {/* Accordéon : anime la hauteur via grid-rows 0fr→1fr (même pattern que la remise annuelle) */}
                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      isFamiMobileOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="rounded-lg border border-border">
                        {famiPanel}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid des plans - Style cohérent avec l'app */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-7xl mx-auto">
                {Object.values(plans)
                  .filter(plan => isPlanAvailable(plan.type))
                  .map((plan) => {
                  const isCurrentPlan = currentPlan === plan.type && currentCycle === billingCycle;
                  const isRecommended = recommendedPlan === plan.type;
                  const isAvailable = isPlanAvailable(plan.type);

                  return (
                    <Card 
                      key={plan.type}
                      className={`relative flex flex-col w-full shadow-lg border-border transition-all duration-200 hover:shadow-xl cursor-pointer ${
                        isRecommended ? 'ring-2 ring-accent shadow-accent/20 order-first sm:order-none' : ''
                      } ${!isAvailable ? 'opacity-60 cursor-not-allowed' : ''} ${isCurrentPlan ? 'ring-2 ring-primary shadow-primary/20' : 'hover:border-muted-foreground/30'} ${
                        plan.type === 'PIONNIER' && pioneerSlotsRemaining !== null && pioneerSlotsRemaining > 0 ? 'mb-6 sm:mb-0' : ''
                      }`}
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

                      {/* Badge fondateur Pionnier — identité + rareté fixe (100 places) */}
                      {plan.type === 'PIONNIER' && pioneerSlotsRemaining !== null && pioneerSlotsRemaining > 0 && (
                        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-10 w-[92%]">
                          <div className="rounded-2xl bg-purple-600 text-white px-3 py-1.5 shadow-md text-center leading-tight">
                            <span className="block text-xs font-bold">🔥 Rejoins la communauté des Pionniers</span>
                            <span className="block text-[11px] font-semibold text-purple-100">seulement 100 places</span>
                          </div>
                        </div>
                      )}

                      <CardHeader className="text-center pb-1 md:pb-1">
                        <CardTitle className="text-lg font-semibold text-foreground">{plan.name}</CardTitle>
                        <div className="text-2xl sm:text-3xl font-bold text-foreground">
                          {billingCycle === 'yearly' ? plan.priceYearly : plan.price}€
                          <span className="text-sm font-normal text-muted-foreground">
                            {billingCycle === 'yearly' ? '/an' : '/mois'}
                          </span>
                        </div>

                        {/* Bloc remise annuelle — déplié/replié en douceur selon le cycle
                            (grid-rows 0fr→1fr) pour lisser le changement de hauteur de la modal. */}
                        <div
                          className={`grid transition-all duration-300 ease-out ${
                            billingCycle === 'yearly' && plan.price * 12 > plan.priceYearly
                              ? 'grid-rows-[1fr] opacity-100 mt-2'
                              : 'grid-rows-[0fr] opacity-0 mt-0'
                          }`}
                        >
                          <div className="overflow-hidden flex flex-col items-center gap-1">
                            <span className="inline-flex items-center rounded-full border border-[#3899aa] px-3 py-1 text-sm font-extrabold text-[#3899aa]">
                              −{Math.round((1 - plan.priceYearly / (plan.price * 12)) * 100)} % vs mensuel
                            </span>
                            <span className="text-xs text-muted-foreground">
                              soit {(plan.priceYearly / 12).toFixed(2).replace('.', ',')} €/mois
                            </span>
                          </div>
                        </div>

                      </CardHeader>

                      <CardContent className="flex flex-col flex-grow px-6 pt-0 md:pt-0 space-y-4">
                        {/* Bandeau aide FAMI — pastille or centrée, entre le prix (au-dessus) et le
                            bandeau programmes (en-dessous). TOUJOURS rendu (note grisée si non éligible)
                            pour aligner les cartes entre elles. */}
                        <div className="flex justify-center">
                          {plan.features.videoTransmission ? (() => {
                            // Aide FAMI : 350€/an. Gain net si l'aide dépasse le coût, sinon reste à charge.
                            const annualCost = billingCycle === 'yearly' ? plan.priceYearly : plan.price * 12;
                            const famiGain = 350 - annualCost;
                            const text = famiGain > 0
                              ? `Tu gagnes +${famiGain}€/an avec l'aide FAMI`
                              : `Coût net ${annualCost - 350}€/an avec l'aide FAMI`;
                            return (
                              <span className="inline-flex items-center whitespace-nowrap px-3 py-1.5 text-xs font-bold text-amber-500">
                                {text}
                              </span>
                            );
                          })() : (
                            // Placeholder invisible : même hauteur que la pastille or, pour que le
                            // bandeau programmes reste aligné sur les cartes non éligibles (Déclic).
                            <span className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold invisible" aria-hidden="true">
                              placeholder
                            </span>
                          )}
                        </div>

                        {/* Fonctionnalités principales */}
                        <div className="space-y-2 flex-grow text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                            <span>
                              {plan.limits.programmes === -1
                                ? 'Programmes illimités'
                                : `${plan.limits.programmes} programme${plan.limits.programmes > 1 ? 's' : ''} max`
                              }
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                            <span>Gestion patients</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                            <span>Assistant IA - {getChatQuotaLabel(plan.type)}</span>
                          </div>

                          {plan.features.iaBilans && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>Génération de bilans</span>
                            </div>
                          )}

                          {plan.features.moduleAdmin && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>Module administratif</span>
                            </div>
                          )}

                          {plan.features.videoTransmission && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-accent flex-shrink-0" />
                              <span>Outil de vidéotransmission</span>
                            </div>
                          )}

                        </div>

                        {/* Bouton d'action - poussé vers le bas */}
                        <div className="mt-auto pt-4">
                          {plan.features.videoTransmission ? (
                            <div className="mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-[#3899aa]/40 bg-[#3899aa]/10 px-2.5 py-2 text-xs font-bold text-[#3899aa]">
                              Éligible à l'Aide FAMI de 350 €/an
                            </div>
                          ) : (
                            <div className="mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs font-medium text-muted-foreground">
                              Non éligible à l'aide FAMI
                            </div>
                          )}
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

              {/* Encart essai gratuit — barre pleine largeur, sous les choix d'abonnements
                  et au-dessus du parrainage. Visible uniquement si le kiné peut encore
                  démarrer un essai. */}
              {canStartTrial && (
                <div className="rounded-lg border border-teal-500 bg-white px-4 py-2.5 text-center shadow-sm">
                  <p className="text-sm sm:text-base font-bold text-teal-600">
                    🎁 14 Jours d'essai gratuits
                  </p>
                </div>
              )}

              {/* Champ Code de parrainage - Seulement pour nouveaux abonnements */}
              {!isUpgrade && (
                <Card className="border-dashed border-primary/30 bg-primary/5">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <Gift className="h-5 w-5 text-primary flex-shrink-0" />
                      <Label htmlFor="referralCode" className="font-medium whitespace-nowrap">Code de parrainage</Label>
                      <Input
                        id="referralCode"
                        placeholder="Ex: ABC123"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        className="font-mono tracking-wider uppercase flex-1"
                        maxLength={10}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Note de sécurité - Style cohérent */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4 py-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  <span>Paiement sécurisé Stripe</span>
                </div>
                <span className="hidden sm:inline">•</span>
                <span>Annulation à tout moment</span>
                <span className="hidden sm:inline">•</span>
                <span>Support professionnel</span>
              </div>
            </div>
          </>
        ) : (
          /* Étape de confirmation */
          <>
            <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold text-foreground">
                <Shield className="h-5 w-5 text-accent" />
                Confirmer le changement de plan
              </DialogTitle>
            </DialogHeader>

            {pendingUpgrade && (
              <div className="space-y-4 p-4 sm:p-6">
                {/* Plan actuel → Nouveau plan */}
                <Card className="card-hover">
                  <CardContent className="pt-5 pb-5 space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Plan actuel</p>
                        <p className="font-semibold text-foreground">
                          {plans[pendingUpgrade.currentPlan]?.name} - {currentPlanPriceLabel}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <div className="p-1.5 rounded-full bg-accent/10">
                        <Zap className="h-4 w-4 text-accent" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border border-accent/30 bg-accent/5">
                      <div>
                        <p className="text-xs text-accent font-medium uppercase tracking-wide">Nouveau plan</p>
                        <p className="font-semibold text-foreground">
                          {pendingUpgrade.planData.name} - {billingCycle === 'yearly'
                            ? `${pendingUpgrade.planData.priceYearly}€/an`
                            : `${pendingUpgrade.planData.price}€/mois`}
                        </p>
                      </div>
                      {changeIsDeferred ? (
                        <Badge className="bg-amber-500 text-white whitespace-nowrap">À l'échéance</Badge>
                      ) : (
                        <Badge className="bg-accent text-accent-foreground">Immédiat</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Informations importantes — dépend du sens du changement */}
                <Card className="card-hover">
                  <CardContent className="pt-5 pb-5">
                    {changeIsDeferred ? (
                      <div className="text-sm space-y-3">
                        <div className="flex items-start gap-2">
                          <Calendar className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">
                            Le changement prend effet <strong>à la fin de ta période en cours</strong>.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">
                            Tu conserves ton plan actuel ({plans[pendingUpgrade.currentPlan]?.name}) jusque-là, sans interruption.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">
                            Aucun remboursement du temps déjà payé, aucun prélèvement aujourd'hui.
                          </span>
                        </div>
                      </div>
                    ) : changeToAnnual ? (
                      <div className="text-sm space-y-3">
                        <div className="flex items-start gap-2">
                          <CreditCard className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">
                            Passage à la facturation annuelle : le montant de l'année est prélevé aujourd'hui, avec proratisation du temps déjà payé sur ton abonnement mensuel.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Calendar className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">Renouvellement ensuite une fois par an.</span>
                        </div>
                        {!changeSamePlan && (
                          <div className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                            <span className="text-foreground">
                              Accès immédiat aux fonctionnalités du plan {pendingUpgrade.planData.name}.
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm space-y-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">
                            Accès immédiat aux fonctionnalités du plan {pendingUpgrade.planData.name}.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CreditCard className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">
                            La différence est prélevée aujourd'hui, au prorata du temps restant sur ta période en cours.
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Boutons */}
                <div className="flex gap-3 pt-2">
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
                    className="flex-1 btn-teal"
                  >
                    {isLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Changement...</>
                    ) : 'Confirmer'}
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