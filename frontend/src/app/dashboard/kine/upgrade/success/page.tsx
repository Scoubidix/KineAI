'use client';

import React, { useState, useEffect, Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthGuard } from '@/components/AuthGuard';
import { useSubscription } from '@/hooks/useSubscription';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  CheckCircle, 
  Sparkles, 
  ArrowRight, 
  Calendar,
  CreditCard,
  RefreshCw,
  AlertCircle,
  Home,
  Zap,
  Users,
  Crown
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getAuth } from 'firebase/auth';
import { plans } from '@/config/plans';

interface SubscriptionData {
  planType: string | null;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  usage?: {
    activePrograms: number;
    monthlyMessages: number;
    totalPatients: number;
  };
  limits?: {
    programmes: number;
    messages: number;
    patients: number;
  };
}

// Composant qui utilise useSearchParams
function UpgradeSuccessContent() {
  const searchParams = useSearchParams();
  const { subscription, refreshSubscription, isLoading: subscriptionLoading } = useSubscription() as {
    subscription: SubscriptionData | null;
    refreshSubscription: () => void;
    isLoading: boolean;
  };
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Récupération des paramètres URL
  useEffect(() => {
    const sessionFromUrl = searchParams.get('session_id');
    const upgradeParam = searchParams.get('upgrade');
    
    if (upgradeParam === 'success') {
      setSessionId(sessionFromUrl);
      setLoading(false);
    } else {
      setError('Paramètre de succès manquant');
      setLoading(false);
    }
  }, [searchParams]);

  // Refresh manuel de l'abonnement - SIMPLE
  const handleRefreshSubscription = async () => {
    setRefreshing(true);
    await refreshSubscription();
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Obtenir les fonctionnalités par plan
  const getPlanFeatures = (planType: string) => {
    const features = {
      'DECLIC': [
        '1 programme simultané avec IA',
        'Assistant IA conversationnel'
      ],
      'PRATIQUE': [
        '3 programmes simultanés avec IA',
        'Assistant IA conversationnel',
        'Assistant IA bibliographique',
        'Assistant IA clinique'
      ],
      'PIONNIER': [
        'Programmes illimités avec IA',
        'Assistant IA conversationnel',
        'Assistant IA bibliographique',
        'Assistant IA clinique',
        'Assistant IA administratif'
      ],
      'EXPERT': [
        'Programmes illimités avec IA',
        'Assistant IA conversationnel',
        'Assistant IA bibliographique',
        'Assistant IA clinique',
        'Assistant IA administratif'
      ]
    };
    return features[planType as keyof typeof features] || [];
  };

  // Obtenir les détails du plan
  const getPlanDetails = (planType: string) => {
    const plan = Object.values(plans).find(p => p.type === planType);
    return plan || null;
  };

  // Icône du plan
  const getPlanIcon = (planType: string) => {
    switch (planType) {
      case 'DECLIC': return <Zap className="h-8 w-8 text-gray-600" />;
      case 'PRATIQUE': return <Users className="h-8 w-8 text-blue-600" />;
      case 'PIONNIER': return <Crown className="h-8 w-8 text-purple-600" />;
      case 'EXPERT': return <Sparkles className="h-8 w-8 text-amber-600" />;
      default: return <CheckCircle className="h-8 w-8 text-green-600" />;
    }
  };

  // Couleurs du plan
  const getPlanColors = (planType: string) => {
    const colors = {
      'DECLIC': { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700', accent: 'text-gray-600 dark:text-gray-400' },
      'PRATIQUE': { bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-700', accent: 'text-blue-600 dark:text-blue-400' },
      'PIONNIER': { bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-700', accent: 'text-purple-600 dark:text-purple-400' },
      'EXPERT': { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-700', accent: 'text-amber-600 dark:text-amber-400' }
    };
    return colors[planType as keyof typeof colors] || colors['DECLIC'];
  };

  if (loading || subscriptionLoading) {
    return (
      <AppLayout>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Vérification de votre abonnement...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md mx-auto text-center border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30">
            <CardHeader>
              <div className="mx-auto mb-4 p-3 bg-red-100 dark:bg-red-900/50 rounded-full w-fit">
                <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-red-900 dark:text-red-300">Erreur de vérification</CardTitle>
              <CardDescription className="text-red-700 dark:text-red-400">
                Une erreur s'est produite lors de la vérification de votre paiement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-700 dark:text-red-400 mb-4">{error}</p>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/dashboard/kine/home">
                    <Home className="h-4 w-4 mr-2" />
                    Retour au tableau de bord
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const currentPlan = subscription?.planType || null;
  const planDetails = currentPlan ? getPlanDetails(currentPlan) : null;
  const colors = currentPlan ? getPlanColors(currentPlan) : getPlanColors('DECLIC');

  return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Animation de succès */}
        <div className="text-center mb-8">
          <div className="relative mx-auto w-20 h-20 mb-6">
            <div className="absolute inset-0 bg-accent/20 rounded-full animate-ping"></div>
            <div className="relative bg-accent rounded-full w-20 h-20 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-white" />
            </div>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            🎉 Paiement réussi !
          </h1>
        </div>

        {/* Activation en cours */}
        {(!currentPlan || currentPlan === 'FREE') ? (
          <Card className="border-border bg-card shadow-lg mb-8">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
                <RefreshCw className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-primary">Activation de votre abonnement</CardTitle>
              <CardDescription className="text-muted-foreground text-lg">
                Votre paiement a été traité avec succès ! Nous finalisons l'activation de votre compte.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-muted-foreground">
                  {currentPlan === 'FREE' 
                    ? 'Si vous venez d\'effectuer un paiement, l\'activation peut prendre quelques instants.'
                    : 'L\'activation de votre abonnement est en cours. Cela ne devrait prendre que quelques secondes.'
                  }
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={handleRefreshSubscription}
                  disabled={refreshing}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Actualisation...' : 'Actualiser maintenant'}
                </Button>
                
                <Button asChild variant="outline" className="w-full">
                  <Link href="/dashboard/kine/home">
                    <Home className="h-4 w-4 mr-2" />
                    Continuer vers le tableau de bord
                  </Link>
                </Button>
              </div>
              
            </CardContent>
          </Card>
        ) : currentPlan && planDetails ? (
          <Card className={`${colors.border} ${colors.bg} shadow-lg mb-8`}>
            <CardHeader className="text-center pb-4 relative">
              {/* Bouton actualiser en haut à droite */}
              <Button 
                onClick={handleRefreshSubscription}
                disabled={refreshing}
                variant="outline" 
                size="sm"
                className="absolute top-4 right-4 p-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              
              <div className={`mx-auto p-4 rounded-full ${colors.bg} ${colors.border} border-2 mb-4`}>
                {getPlanIcon(currentPlan)}
              </div>
              <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                Plan {planDetails.name}
                <Badge className="bg-accent text-accent-foreground">Actif</Badge>
              </CardTitle>
              <CardDescription className="text-lg">
                Vous avez maintenant accès à toutes les fonctionnalités du plan {planDetails.name}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Informations de facturation */}
              <div className="flex flex-col items-center gap-6">
                <div className="w-full flex flex-col items-center text-center gap-3 p-6 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                  <CreditCard className="h-6 w-6 text-accent" />
                  <div>
                    <p className="font-semibold">Montant facturé</p>
                    <p className="text-3xl font-bold text-primary">{planDetails.price}€/mois</p>
                  </div>
                </div>
                
                <div className="w-full flex items-center justify-center gap-3 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                  <Calendar className="h-6 w-6 text-accent" />
                  <div>
                    <p className="font-semibold">Prochaine facturation</p>
                    <p className="text-lg font-medium">
                      {subscription?.currentPeriodEnd 
                        ? format(new Date(subscription.currentPeriodEnd), 'd MMMM yyyy', { locale: fr })
                        : format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'd MMMM yyyy', { locale: fr })
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Fonctionnalités débloquées */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-accent" />
                  Fonctionnalités débloquées
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {getPlanFeatures(currentPlan).map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-accent" />
                      <span>{feature}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-accent" />
                    <span>Tableau de bord complet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-accent" />
                    <span>Support prioritaire</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-center pt-4">
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                >
                  <Link href="/dashboard/kine/home">
                    <Home className="h-5 w-5 mr-2" />
                    Accéder au tableau de bord
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Fallback si l'abonnement n'est pas encore chargé
          <Card className="border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 shadow-lg mb-8">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-amber-100 dark:bg-amber-900/50 rounded-full w-fit">
                <RefreshCw className="h-8 w-8 text-amber-600 dark:text-amber-400 animate-spin" />
              </div>
              <CardTitle className="text-amber-900 dark:text-amber-300">Activation en cours</CardTitle>
              <CardDescription className="text-amber-700 dark:text-amber-400">
                Votre abonnement est en cours d'activation. Cela peut prendre quelques secondes.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={handleRefreshSubscription}
                disabled={refreshing}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Actualiser l'abonnement
              </Button>
            </CardContent>
          </Card>
        )}


        {/* Informations de session (développement) */}
        {sessionId && process.env.NODE_ENV === 'development' && (
          <Card className="mt-6 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-sm font-mono">Debug Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs font-mono space-y-1">
                <p><strong>Session ID:</strong> {sessionId}</p>
                <p><strong>Plan actuel:</strong> {currentPlan || 'En cours de chargement'}</p>
                <p><strong>Statut:</strong> {subscription?.status || 'En cours de chargement'}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
}

// Page principale avec Suspense
export default function UpgradeSuccessPage() {
  return (
    <AppLayout>
      <AuthGuard role="kine" />
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      }>
        <UpgradeSuccessContent />
      </Suspense>
    </AppLayout>
  );
}