'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Users, UserCheck, ClipboardList, RefreshCw, ShieldCheck, CreditCard, TrendingUp, UserPlus, UserMinus, ArrowRightLeft, MessageSquare, Send, Loader2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
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

interface TicketMessage {
  id: number;
  body: string;
  isAdmin: boolean;
  createdAt: string;
}

interface SupportTicket {
  id: number;
  subject: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
  kine: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    planType: string | null;
  };
  messages: TicketMessage[];
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

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Support state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [replyBodies, setReplyBodies] = useState<Record<number, string>>({});
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const messagesEndRefs = useRef<Record<number, HTMLDivElement | null>>({});

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

  const fetchTickets = async () => {
    setTicketsLoading(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/support/admin/tickets`);
      if (res.ok) {
        const json = await res.json();
        setTickets(json.data);
      }
    } catch {
      // Silencieux
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleReply = async (ticketId: number) => {
    const body = replyBodies[ticketId]?.trim();
    if (!body) return;

    setReplyingTo(ticketId);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/support/admin/tickets/${ticketId}/reply`,
        { method: 'POST', body: JSON.stringify({ body }) }
      );
      if (res.ok) {
        setReplyBodies(prev => ({ ...prev, [ticketId]: '' }));
        fetchTickets();
      }
    } catch {
      // Silencieux
    } finally {
      setReplyingTo(null);
    }
  };

  const handleResolve = async (ticketId: number) => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/support/admin/tickets/${ticketId}/resolve`,
        { method: 'PUT' }
      );
      if (res.ok) {
        fetchTickets();
      }
    } catch {
      // Silencieux
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'support') {
      fetchTickets();
    }
  }, [activeTab]);

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

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
            <Button variant="outline" size="sm" onClick={activeTab === 'support' ? fetchTickets : fetchStats} disabled={loading || ticketsLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${(loading || ticketsLoading) ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
              {error}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="dashboard">Statistiques</TabsTrigger>
              <TabsTrigger value="support" className="gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Support
                {tickets.filter(t => t.messages.length > 0 && !t.messages[t.messages.length - 1].isAdmin).length > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">
                    {tickets.filter(t => t.messages.length > 0 && !t.messages[t.messages.length - 1].isAdmin).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6 mt-4">
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
            </TabsContent>

            {/* Onglet Support */}
            <TabsContent value="support" className="space-y-4 mt-4">
              {ticketsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun ticket ouvert</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* En attente d'abord, puis repondu */}
                  {[...tickets]
                    .sort((a, b) => {
                      const aWaiting = a.messages.length > 0 && !a.messages[a.messages.length - 1].isAdmin;
                      const bWaiting = b.messages.length > 0 && !b.messages[b.messages.length - 1].isAdmin;
                      if (aWaiting && !bWaiting) return -1;
                      if (!aWaiting && bWaiting) return 1;
                      return 0;
                    })
                    .map((ticket) => {
                    const lastMessage = ticket.messages[ticket.messages.length - 1];
                    const isWaiting = lastMessage && !lastMessage.isAdmin;

                    return (
                    <Card key={ticket.id} className={isWaiting ? 'border-orange-300 dark:border-orange-700' : ''}>
                      <CardContent className="pt-4 pb-3">
                        {/* Header du ticket */}
                        <button
                          onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="font-semibold text-sm truncate">{ticket.subject}</p>
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  #{ticket.id}
                                </Badge>
                                {isWaiting ? (
                                  <Badge className="text-[10px] shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                    En attente
                                  </Badge>
                                ) : (
                                  <Badge className="text-[10px] shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                    Repondu
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                <span>{ticket.kine.firstName} {ticket.kine.lastName}</span>
                                <span>-</span>
                                <span>{ticket.kine.email}</span>
                                {ticket.kine.planType && (
                                  <Badge className={`text-[9px] px-1 py-0 ${PLAN_COLORS[ticket.kine.planType] || ''}`}>
                                    {ticket.kine.planType}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {ticket.messages.length} message{ticket.messages.length > 1 ? 's'  : ''} - {formatDateShort(ticket.createdAt)}
                              </p>
                            </div>
                            {expandedTicket === ticket.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                            )}
                          </div>
                        </button>

                        {/* Contenu expandé */}
                        {expandedTicket === ticket.id && (
                          <div className="mt-4 border-t pt-4">
                            {/* Messages */}
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 mb-4">
                              {ticket.messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.isAdmin ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                    msg.isAdmin
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted text-foreground'
                                  }`}>
                                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                    <p className={`text-[10px] mt-1 ${msg.isAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                      {msg.isAdmin ? 'Admin' : `${ticket.kine.firstName}`} - {formatDateShort(msg.createdAt)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                              <div ref={(el) => { messagesEndRefs.current[ticket.id] = el; }} />
                            </div>

                            {/* Zone de reponse */}
                            <div className="flex gap-2">
                              <Textarea
                                value={replyBodies[ticket.id] || ''}
                                onChange={(e) => setReplyBodies(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                placeholder="Repondre au ticket..."
                                className="min-h-[60px] resize-none text-sm"
                                maxLength={5000}
                              />
                              <div className="flex flex-col gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => handleReply(ticket.id)}
                                  disabled={replyingTo === ticket.id || !replyBodies[ticket.id]?.trim()}
                                >
                                  {replyingTo === ticket.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResolve(ticket.id)}
                                  title="Marquer comme resolu"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </AuthGuard>
  );
}
