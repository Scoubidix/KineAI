'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Users, UserCheck, ClipboardList, RefreshCw, ShieldCheck, CreditCard, TrendingUp, UserPlus, UserMinus, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LastPayout {
  amount: number;
  currency: string;
  date: string;
  status: string;
}

interface PlanChange {
  from: string;
  to: string;
  date: string;
}

interface DashboardStats {
  planCounts: {
    FREE: number;
    DECLIC: number;
    PRATIQUE: number;
    PIONNIER: number;
    EXPERT: number;
  };
  totalKines: number;
  activeSubscriptions: number;
  totalPatients: number;
  activeProgrammes: number;
  mrr: number;
  lastPayout: LastPayout | null;
  newThisWeek: number;
  newThisMonth: number;
  cancelsThisWeek: number;
  cancelsThisMonth: number;
  planChanges: PlanChange[];
}

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  DECLIC: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PRATIQUE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  PIONNIER: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  EXPERT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
};

const PLAN_PRICES: Record<string, string> = {
  FREE: '0',
  DECLIC: '9',
  PRATIQUE: '19',
  PIONNIER: '20',
  EXPERT: '49',
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard/stats`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Acces refuse. Vous n\'etes pas administrateur.');
          return;
        }
        throw new Error('Erreur serveur');
      }
      const json = await res.json();
      setStats(json.data);
    } catch (err) {
      setError('Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <AuthGuard role="kine">
        <AppLayout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Chargement des statistiques...</p>
            </div>
          </div>
        </AppLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard role="kine">
      <AppLayout>
        <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Dashboard Admin</h1>
            </div>
            <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
              {error}
            </div>
          )}

          {stats && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Users className="h-4 w-4" />
                      Total kines
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.totalKines}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <UserCheck className="h-4 w-4" />
                      Abonnements actifs
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.activeSubscriptions}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Users className="h-4 w-4" />
                      Patients actifs
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.totalPatients}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <ClipboardList className="h-4 w-4" />
                      Programmes actifs
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.activeProgrammes}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Nouveaux inscrits */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <UserPlus className="h-4 w-4" />
                      Inscrits cette semaine
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.newThisWeek}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <UserPlus className="h-4 w-4" />
                      Inscrits ce mois
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.newThisMonth}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Résiliations */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <UserMinus className="h-4 w-4" />
                      Resiliations cette semaine
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.cancelsThisWeek}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <UserMinus className="h-4 w-4" />
                      Resiliations ce mois
                    </div>
                    <p className="text-3xl font-bold mt-1">{stats.cancelsThisMonth}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Changements de plan */}
              {stats.planChanges.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-5 w-5 text-orange-500" />
                      <CardTitle className="text-lg">Changements de plan ce mois</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.planChanges.map((change, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Badge className={PLAN_COLORS[change.from]}>{change.from}</Badge>
                          <span className="text-muted-foreground">→</span>
                          <Badge className={PLAN_COLORS[change.to]}>{change.to}</Badge>
                          <span className="text-muted-foreground ml-auto text-xs">
                            {formatDate(change.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Revenus */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      <CardTitle className="text-lg">MRR Stripe</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">{stats.mrr.toFixed(2)} EUR<span className="text-lg text-muted-foreground font-normal"> /mois</span></p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-blue-500" />
                      <CardTitle className="text-lg">Dernier virement Stripe</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stats.lastPayout ? (
                      <div>
                        <p className="text-3xl font-bold">{stats.lastPayout.amount.toFixed(2)} {stats.lastPayout.currency.toUpperCase()}</p>
                        <p className="text-sm text-muted-foreground mt-1">{formatDate(stats.lastPayout.date)}</p>
                        <Badge className={stats.lastPayout.status === 'paid' ? 'bg-green-100 text-green-800 mt-1' : 'bg-yellow-100 text-yellow-800 mt-1'}>
                          {stats.lastPayout.status === 'paid' ? 'Recu' : stats.lastPayout.status === 'in_transit' ? 'En transit' : stats.lastPayout.status}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Aucun virement</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Abonnements par plan */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Abonnements par plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.planCounts).map(([plan, count]) => {
                      const percentage = stats.totalKines > 0
                        ? Math.round((count / stats.totalKines) * 100)
                        : 0;
                      return (
                        <div key={plan} className="flex items-center gap-3">
                          <Badge className={`w-24 justify-center ${PLAN_COLORS[plan]}`}>
                            {plan}
                          </Badge>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span>{count} kiné{count > 1 ? 's' : ''}</span>
                              <span className="text-muted-foreground">{percentage}%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm text-muted-foreground w-16 text-right">
                            {PLAN_PRICES[plan]} EUR/m
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </AppLayout>
    </AuthGuard>
  );
}
