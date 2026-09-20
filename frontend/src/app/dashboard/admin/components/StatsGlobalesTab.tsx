'use client';

// Onglet admin « Statistiques › Métriques » : KPIs, usage des features, comparatif semaine/mois.
// Extrait tel quel de page.tsx (aucun changement de rendu) pour tenir dans le groupe Statistiques.
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserCheck, ClipboardList, CreditCard, TrendingUp, TrendingDown, Minus, UserMinus, ArrowRightLeft, MessageSquare, Mail, FileText, FileSignature, Gift, Activity, Sparkles } from 'lucide-react';

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

// Comparatif période courante vs précédente (semaine ou mois)
interface Comparison {
  current: number;
  previous: number;
  deltaPct: number | null; // null si période précédente à 0
}

interface Metric {
  total: number | null;
  week: Comparison;
  month: Comparison;
}

interface LettersMetric extends Metric {
  byMethod: { email: Metric; whatsapp: Metric };
}

export interface ActivityStats {
  kines: Metric;
  subscriptions: Metric;
  trials: Metric;
  patients: Metric;
  programmes: Metric;
  bilans: Metric;
  contracts: Metric;
  referrals: Metric;
  letters: LettersMetric;
}

export interface DashboardStats {
  planCounts: {
    FREE: number;
    DECLIC: number;
    PRATIQUE: number;
    PIONNIER: number;
    EXPERT: number;
  };
  planCycleCounts?: Record<string, { monthly: number; yearly: number }>;
  cycleCounts?: { monthly: number; yearly: number };
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
  activity: ActivityStats;
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
  PRATIQUE: '29',
  PIONNIER: '19',
  EXPERT: '49',
};

// Badge de variation vs période précédente (vert ↑ / rouge ↓ / neutre —)
function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-muted-foreground" title="Rien sur la période précédente">—</span>;
  }
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="h-3 w-3" />0%
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{pct}%
    </span>
  );
}

// Carte de statistique : total + comparatifs semaine / mois
function StatCard({
  title,
  icon: Icon,
  metric,
  footer,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  metric: Metric;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <p className="text-3xl font-bold mt-1">{metric.total ?? '—'}</p>
        <div className="mt-3 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Cette sem.</span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{metric.week.current}</span>
              <DeltaBadge pct={metric.week.deltaPct} />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Ce mois</span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{metric.month.current}</span>
              <DeltaBadge pct={metric.month.deltaPct} />
            </span>
          </div>
        </div>
        {footer && <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

interface StatsGlobalesTabProps {
  stats: DashboardStats | null;
}

export default function StatsGlobalesTab({ stats }: StatsGlobalesTabProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {stats && (
        <>
          {/* KPIs + usage des features (total + comparatif semaine/mois) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Kinés inscrits" icon={Users} metric={stats.activity.kines} />
            <StatCard title="Abonnements" icon={UserCheck} metric={stats.activity.subscriptions} />
            <StatCard title="Essais en cours" icon={Sparkles} metric={stats.activity.trials} />
            <StatCard title="Patients" icon={Activity} metric={stats.activity.patients} />
            <StatCard title="Programmes" icon={ClipboardList} metric={stats.activity.programmes} />
            <StatCard title="Bilans générés" icon={FileText} metric={stats.activity.bilans} />
            <StatCard title="Contrats" icon={FileSignature} metric={stats.activity.contracts} />
            <StatCard title="Parrainages" icon={Gift} metric={stats.activity.referrals} />
            <StatCard
              title="Courriers envoyés"
              icon={Mail}
              metric={stats.activity.letters}
              footer={
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{stats.activity.letters.byMethod.email.total}</span>
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{stats.activity.letters.byMethod.whatsapp.total}</span>
                </span>
              }
            />
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
                          <span>
                            {count} kiné{count > 1 ? 's' : ''}
                            {plan !== 'FREE' && count > 0 && stats.planCycleCounts?.[plan] && (
                              <span className="text-muted-foreground">
                                {' '}· {stats.planCycleCounts[plan].monthly} mens. / {stats.planCycleCounts[plan].yearly} ann.
                              </span>
                            )}
                          </span>
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
                {stats.cycleCounts && (
                  <div className="mt-4 flex items-center justify-center gap-4 border-t pt-3 text-sm">
                    <span><strong>{stats.cycleCounts.monthly}</strong> mensuel{stats.cycleCounts.monthly > 1 ? 's' : ''}</span>
                    <span className="text-muted-foreground">·</span>
                    <span><strong>{stats.cycleCounts.yearly}</strong> annuel{stats.cycleCounts.yearly > 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
