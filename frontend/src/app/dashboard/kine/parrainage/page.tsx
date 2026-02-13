'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Gift,
  Copy,
  Check,
  Users,
  Euro,
  Clock,
  Loader2,
  Share2,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';

interface ReferralStats {
  code: string | null;
  link: string | null;
  stats: {
    total: number;
    pending: number;
    completed: number;
    canceled: number;
    totalCreditsEarned: number;
  };
  limits: {
    monthlyUsed: number;
    monthlyMax: number;
  };
  referrals: Array<{
    id: number;
    refereeName: string;
    plan: string;
    credit: number;
    status: string;
    date: string;
    creditedAt: string | null;
  }>;
}

export default function ParrainagePage() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Charger les stats au montage
  useEffect(() => {
    fetchReferralStats();
  }, []);

  const fetchReferralStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) {
        setError('Vous devez être connecté');
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/referral/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Erreur lors du chargement');
      }
    } catch (err) {
      console.error('Erreur fetch stats:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    try {
      setGenerating(true);

      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive"
        });
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/referral/generate-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: data.isNew ? "Code généré !" : "Code existant",
          description: `Votre code de parrainage : ${data.code}`,
          className: "bg-green-50 border-green-200 text-green-800"
        });
        // Recharger les stats
        await fetchReferralStats();
      } else {
        toast({
          title: "Erreur",
          description: data.error || 'Erreur lors de la génération',
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error('Erreur génération code:', err);
      toast({
        title: "Erreur",
        description: "Erreur de connexion au serveur",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: "Copié !",
      description: "Le code a été copié dans votre presse-papier",
      className: "bg-green-50 border-green-200 text-green-800"
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700"><Clock className="h-3 w-3 mr-1" />En attente</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"><CheckCircle className="h-3 w-3 mr-1" />Validé</Badge>;
      case 'CANCELED':
        return <Badge variant="outline" className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"><XCircle className="h-3 w-3 mr-1" />Annulé</Badge>;
      case 'EXPIRED':
        return <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"><Clock className="h-3 w-3 mr-1" />Expiré</Badge>;
      case 'FRAUD':
        return <Badge variant="outline" className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"><AlertCircle className="h-3 w-3 mr-1" />Rejeté</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanLabel = (plan: string) => {
    const planLabels: Record<string, string> = {
      'DECLIC': 'Déclic (9€)',
      'PRATIQUE': 'Pratique (29€)',
      'PIONNIER': 'Pionnier (20€)',
      'EXPERT': 'Expert (59€)'
    };
    return planLabels[plan] || plan;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-[#3899aa]">
            <Gift className="h-6 w-6 text-[#3899aa]" />
            Parrainage
          </h1>
          <p className="text-foreground mt-1">
            Parrainez vos confrères et gagnez tous les deux 1 mois gratuit !
          </p>
        </div>

        {/* Erreur d'abonnement */}
        {error && error.includes('abonnement') && (
          <Card className="border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-900 dark:text-orange-300">Abonnement requis</p>
                  <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
                    Vous devez avoir un abonnement actif pour pouvoir parrainer des confrères.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Carte principale - Code de parrainage */}
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Share2 className="h-5 w-5 text-[#3899aa]" />
              Mon code de parrainage
            </CardTitle>
            <CardDescription className="text-foreground">
              Partagez ce code avec vos confrères kinésithérapeutes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats?.code ? (
              <>
                {/* Code affiché */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <Input
                      value={stats.code}
                      readOnly
                      className="text-2xl font-mono font-bold text-center tracking-widest bg-muted"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(stats.code!)}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Lien complet */}
                {stats.link && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Lien de parrainage :</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs break-all">{stats.link}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(stats.link!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Vous n'avez pas encore de code de parrainage
                </p>
                <Button onClick={generateCode} disabled={generating || !!error} className="btn-teal">
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4 mr-2" />
                      Générer mon code
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comment ça marche */}
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <HelpCircle className="h-5 w-5 text-[#3899aa]" />
              Comment ça marche ?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg text-center">
                <div className="h-10 w-10 rounded-full bg-[#3899aa]/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-[#3899aa] font-bold">1</span>
                </div>
                <p className="font-medium text-foreground">Partagez votre code</p>
                <p className="text-sm text-foreground mt-1">
                  Envoyez votre code à un confrère kiné
                </p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <div className="h-10 w-10 rounded-full bg-[#3899aa]/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-[#3899aa] font-bold">2</span>
                </div>
                <p className="font-medium text-foreground">Il s'abonne</p>
                <p className="text-sm text-foreground mt-1">
                  Il entre votre code lors de son paiement
                </p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <div className="h-10 w-10 rounded-full bg-[#3899aa]/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-[#3899aa] font-bold">3</span>
                </div>
                <p className="font-medium text-foreground">Vous gagnez tous les deux</p>
                <p className="text-sm text-foreground mt-1">
                  1 mois offert après son 1er renouvellement
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Le filleul doit entrer le code manuellement</strong> dans le champ "Code de parrainage" lors du checkout (page de paiement Stripe).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Statistiques */}
        {stats && (
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="card-hover">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.stats.total}</p>
                    <p className="text-sm text-foreground">Filleuls total</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.stats.completed}</p>
                    <p className="text-sm text-foreground">Parrainages validés</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Euro className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.stats.totalCreditsEarned}€</p>
                    <p className="text-sm text-foreground">Crédits gagnés</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Liste des filleuls */}
        {stats && stats.referrals.length > 0 && (
          <Card className="card-hover">
            <CardHeader>
              <CardTitle className="text-foreground">Mes filleuls</CardTitle>
              <CardDescription className="text-foreground">
                Limite : {stats.limits.monthlyUsed}/{stats.limits.monthlyMax} parrainages validés ce mois
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.referrals.map((referral) => (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between p-3 border rounded-lg transition-all duration-300 hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-[#3899aa]/10"
                  >
                    <div>
                      <p className="font-medium">{referral.refereeName}</p>
                      <p className="text-sm text-muted-foreground">
                        {getPlanLabel(referral.plan)} - {new Date(referral.date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-green-600">+{referral.credit}€</span>
                      {getStatusBadge(referral.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Message si pas de filleuls */}
        {stats && stats.referrals.length === 0 && stats.code && (
          <Card className="card-hover border-dashed">
            <CardContent className="pt-6 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground">
                Vous n'avez pas encore de filleuls. Partagez votre code !
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
