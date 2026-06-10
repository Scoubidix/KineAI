'use client';

// Onglet admin : consommation de tokens IA du chat unifié (les 3 IAs sous quota).
// Aujourd'hui (en cours), hier, moyenne 10 jours, détail par plan, coûts estimés
// (tarif blended Mistral Medium 3.5, configurable côté backend).
import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Loader2, Zap, TrendingUp, Euro } from 'lucide-react';

interface PlanUsage {
  planType: string;
  todayTokens: number;
  activeKinesToday: number;
  yesterdayTokens: number;
  activeKinesYesterday: number;
  avgDailyTokens10d: number;
  projectedMonthlyTokens: number;
  projectedMonthlyCostEur: number;
}

interface TokenUsageData {
  today: { date: string; totalTokens: number; activeKines: number; estimatedCostEur: number };
  yesterday: { date: string; totalTokens: number; activeKines: number; estimatedCostEur: number };
  avgDailyTokens10d: number;
  projectedMonthlyTokens: number;
  projectedMonthlyCostEur: number;
  costAssumption: { blendedEurPerMillionTokens: number; note: string };
  byPlan: PlanUsage[];
  daily: { date: string; totalTokens: number }[];
}

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : n.toLocaleString('fr-FR');

const formatEur = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function TokenUsageTab() {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard/token-usage`);
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (error) {
        console.error('Erreur chargement usage tokens:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Impossible de charger les données d&apos;usage.</p>;
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Cartes de synthèse */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Zap className="h-4 w-4 text-[#3899aa]" /> Aujourd&apos;hui (en cours)
          </div>
          <p className="text-3xl font-bold mt-1">{formatTokens(data.today.totalTokens)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.today.activeKines} kiné(s) actif(s) · ≈ {formatEur(data.today.estimatedCostEur)}
          </p>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Zap className="h-4 w-4" /> Hier
          </div>
          <p className="text-3xl font-bold mt-1">{formatTokens(data.yesterday.totalTokens)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.yesterday.activeKines} kiné(s) actif(s) · ≈ {formatEur(data.yesterday.estimatedCostEur)}
          </p>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <TrendingUp className="h-4 w-4" /> Moyenne / jour (10 j)
          </div>
          <p className="text-3xl font-bold mt-1">{formatTokens(data.avgDailyTokens10d)}</p>
          <p className="text-xs text-muted-foreground mt-1">jours sans activité inclus</p>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Euro className="h-4 w-4 text-amber-600" /> Coût mensuel projeté
          </div>
          <p className="text-3xl font-bold mt-1">{formatEur(data.projectedMonthlyCostEur)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatTokens(data.projectedMonthlyTokens)} tokens / mois</p>
        </div>
      </div>

      {/* Tableau par plan */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-medium">Consommation par plan</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium text-right">Aujourd&apos;hui</th>
                <th className="px-4 py-2 font-medium text-right">Hier</th>
                <th className="px-4 py-2 font-medium text-right">Kinés actifs (hier)</th>
                <th className="px-4 py-2 font-medium text-right">Moyenne / jour (10 j)</th>
                <th className="px-4 py-2 font-medium text-right">Coût / mois projeté</th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((plan) => (
                <tr key={plan.planType} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-medium">{plan.planType}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatTokens(plan.todayTokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatTokens(plan.yesterdayTokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{plan.activeKinesYesterday}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatTokens(plan.avgDailyTokens10d)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatEur(plan.projectedMonthlyCostEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historique 10 jours */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-medium">10 derniers jours</h3>
        </div>
        <div className="divide-y divide-border/50">
          {data.daily.map((day) => {
            const maxTokens = Math.max(...data.daily.map((d) => d.totalTokens), 1);
            return (
              <div key={day.date} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground capitalize">{formatDate(day.date)}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3899aa] rounded-full"
                    style={{ width: `${Math.round((day.totalTokens / maxTokens) * 100)}%` }}
                  />
                </div>
                <span className="w-20 text-right tabular-nums">{formatTokens(day.totalTokens)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Coûts estimés sur un tarif blended de {data.costAssumption.blendedEurPerMillionTokens} €/M tokens — {data.costAssumption.note}.
        Périmètre : les 3 IAs du chat unifié (l&apos;IA administrative est hors quota).
      </p>
    </div>
  );
}
