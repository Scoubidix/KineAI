'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';

import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Clock, Calendar as CalendarIcon, CalendarDays, Percent } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import NouveauBilanModal from '@/app/dashboard/kine/bilan-kine/components/NouveauBilanModal';
import NouveauContratModal from '@/app/dashboard/kine/contrats/components/NouveauContratModal';

// Interfaces pour les types de données
interface KineData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface PatientSession {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    nom: string;
    age: number;
  };
  programme: {
    id: number;
    titre: string;
    dateDebut: string;
    dateFin: string;
    isArchived: boolean;
  };
  seance: {
    index: number;
    total: number;
  };
  session: {
    isValidated: boolean;
    painLevel: number | null;
    difficultyLevel: number | null;
    validatedAt: string | null;
  };
}

interface AdherenceData {
  success: boolean;
  adherence: {
    totalPatients: number;
    validatedPatients: number;
    percentage: number;
  };
}

interface PatientsSessionsData {
  success: boolean;
  patients: PatientSession[];
}

interface DashboardStats {
  success: boolean;
  timeSaved: {
    thisWeekMinutes: number;
    lastWeekMinutes: number;
    deltaMinutes: number;
    formatted: { hours: number; minutes: number };
  };
  bilansGeneratedTotal: number;
  iaSearchesTotal: number;
  programmesActiveToday: number;
}

interface WeekAdherence {
  success: boolean;
  week: { start: string; end: string };
  totalSessions: number;
  doneSessions: number;
  missedSessions: number;
  plannedToday: number;
  percentage: number;
  deltaVsLastWeek: number;
}

const getInitials = (name?: string): string => {
  if (!name) return '??';
  const names = name.split(' ');
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

// Palette d'avatars patients (déterministe par id) — évite le gris uniforme
const AVATAR_COLORS = ['#3899aa', '#f59e0b', '#8b5cf6', '#22c55e'];
const avatarColor = (id: number): string => AVATAR_COLORS[id % AVATAR_COLORS.length];

export default function KineHomePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [adherenceData, setAdherenceData] = useState<AdherenceData | null>(null);
  const [patientsData, setPatientsData] = useState<PatientsSessionsData | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [weekAdherence, setWeekAdherence] = useState<WeekAdherence | null>(null);
  const [kine, setKine] = useState<KineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAdherence, setLoadingAdherence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bilanModalOpen, setBilanModalOpen] = useState(false);
  const [contratModalOpen, setContratModalOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Toast de bienvenue après signature contrat via magic link
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') === 'contract') {
      toast({
        title: 'Bienvenue dans ton espace !',
        description: 'Ton contrat signé est disponible dans Mes Contrats → Reçus.',
        duration: 10000,
      });
      const url = new URL(window.location.href);
      url.searchParams.delete('welcome');
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAuthToken = async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error('Utilisateur non connecté');
    return await user.getIdToken();
  };

  // Chargement initial : profil + données de base
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (user) {
        await loadInitialData(user);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [API_URL]);

  // Rechargement lors du changement de date
  useEffect(() => {
    if (kine) {
      fetchAdherenceData(selectedDate);
      fetchWeekAdherence(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const loadInitialData = async (user: any) => {
    try {
      const token = await user.getIdToken();
      const profileResult = await fetchKineProfile(token);
      if (profileResult.success) {
        setKine(profileResult.data);
        await Promise.all([
          fetchAdherenceData(selectedDate, token),
          fetchDashboardStats(),
          fetchWeekAdherence(selectedDate),
        ]);
      }
    } catch (error) {
      console.error('Erreur chargement initial:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchKineProfile = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/kine/profile`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        return { success: true, data: await response.json() };
      }
      throw new Error('Erreur récupération profil');
    } catch (error) {
      console.error('Erreur lors du chargement du profil kiné:', error);
      return { success: false, error };
    }
  };

  const fetchAdherenceData = async (date: Date, token?: string) => {
    setLoadingAdherence(true);
    setError(null);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const authToken = token || await getAuthToken();
      const [adherenceResponse, patientsResponse] = await Promise.all([
        fetch(`${API_URL}/kine/adherence/${dateStr}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${API_URL}/kine/patients-sessions/${dateStr}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        }),
      ]);
      if (!adherenceResponse.ok || !patientsResponse.ok) {
        throw new Error('Erreur lors du chargement des données');
      }
      const [adherenceResult, patientsResult] = await Promise.all([
        adherenceResponse.json(),
        patientsResponse.json(),
      ]);
      if (adherenceResult.success && patientsResult.success) {
        setAdherenceData(adherenceResult);
        setPatientsData(patientsResult);
      } else {
        throw new Error('Données invalides reçues du serveur');
      }
    } catch (err) {
      console.error('Erreur lors du chargement des données d\'adhérence:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoadingAdherence(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/kine/dashboard-stats`);
      if (res.ok) setDashboardStats(await res.json());
    } catch (e) {
      console.error('Erreur dashboard-stats:', e);
    }
  };

  const fetchWeekAdherence = async (date: Date) => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await fetchWithAuth(`${API_URL}/kine/adherence-week/${dateStr}`);
      if (res.ok) setWeekAdherence(await res.json());
    } catch (e) {
      console.error('Erreur adherence-week:', e);
    }
  };

  // Chargement en cours
  if (loading) {
    return (
      <>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement de ton tableau de bord...</p>
          </div>
        </div>
      </>
    );
  }

  if (!kine) {
    return (
      <>
        <AuthGuard role="kine" />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Erreur de chargement</h2>
            <p className="text-muted-foreground mb-4">Impossible de charger tes informations.</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </div>
        </div>
      </>
    );
  }

  const RING_CIRCUMFERENCE = 2 * Math.PI * 38;

  return (
    <>
      <AuthGuard role="kine" />
      <div className="space-y-6">
        {/* Hero */}
        <div
          className="relative overflow-hidden rounded-2xl px-6 md:px-8 py-8 text-white"
          style={{ background: 'linear-gradient(135deg, #1f5c6a 0%, #2d5f6e 50%, #3899aa 100%)' }}
        >
          <p className="text-sm font-medium opacity-80">Bonjour,</p>
          <h1 className="text-2xl md:text-3xl font-bold mb-5">{kine.firstName} 👋</h1>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <div className="text-2xl md:text-3xl font-bold leading-none">
                {dashboardStats
                  ? `${dashboardStats.timeSaved.formatted.hours}h ${String(dashboardStats.timeSaved.formatted.minutes).padStart(2, '0')}`
                  : '—'}
              </div>
              <div className="text-xs opacity-70 mt-1">gagnées cette semaine</div>
              {dashboardStats && dashboardStats.timeSaved.deltaMinutes !== 0 && (
                <span className="inline-block mt-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-white/15">
                  {dashboardStats.timeSaved.deltaMinutes > 0 ? '↑ +' : '↓ '}
                  {Math.abs(dashboardStats.timeSaved.deltaMinutes)} min vs sem. dern.
                </span>
              )}
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold leading-none">{dashboardStats?.bilansGeneratedTotal ?? '—'}</div>
              <div className="text-xs opacity-70 mt-1">bilans générés par l'IA</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold leading-none">{dashboardStats?.iaSearchesTotal ?? '—'}</div>
              <div className="text-xs opacity-70 mt-1">recherches au Copilote IA</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold leading-none">{dashboardStats?.programmesActiveToday ?? '—'}</div>
              <div className="text-xs opacity-70 mt-1">programmes en cours aujourd'hui</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold leading-none">{adherenceData ? `${adherenceData.adherence.percentage}%` : '—'}</div>
              <div className="text-xs opacity-70 mt-1">adhérence aujourd'hui</div>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Actions rapides</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => setBilanModalOpen(true)} className="card-hover rounded-xl p-4 text-center transition-all">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-xl bg-[#ecfdf5]">📝</div>
              <div className="text-sm font-semibold">Nouveau bilan</div>
              <div className="text-[11px] text-muted-foreground">Générer en 2 min</div>
            </button>
            <button onClick={() => router.push('/dashboard/kine/chat')} className="card-hover rounded-xl p-4 text-center transition-all">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, #dbeafe, #c4b5fd)' }}>🧠</div>
              <div className="text-sm font-semibold">Copilote IA</div>
              <div className="text-[11px] text-muted-foreground">Poser une question</div>
            </button>
            <button onClick={() => router.push('/dashboard/kine/programmes?new=1')} className="card-hover rounded-xl p-4 text-center transition-all">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-xl bg-[#fffbeb]">🏋️</div>
              <div className="text-sm font-semibold">Nouveau programme</div>
              <div className="text-[11px] text-muted-foreground">Pour un patient</div>
            </button>
            <button onClick={() => setContratModalOpen(true)} className="card-hover rounded-xl p-4 text-center transition-all">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-xl bg-[#eff6ff]">📄</div>
              <div className="text-sm font-semibold">Nouveau contrat</div>
              <div className="text-[11px] text-muted-foreground">Gratuit & conforme</div>
            </button>
          </div>
        </div>

        {/* Grid 2 colonnes : Programme du jour + Adhérence */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
          {/* Programme du jour */}
          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="flex items-center gap-2 text-primary text-base">
                <CalendarDays className="h-5 w-5 text-accent" /> Programme du jour
              </CardTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs" disabled={loadingAdherence}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(selectedDate, 'PPP', { locale: fr })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} initialFocus locale={fr} disabled={(d) => d > new Date()} />
                </PopoverContent>
              </Popover>
            </CardHeader>
            <CardContent>
              {error ? (
                <p className="text-muted-foreground text-center py-6 italic text-sm">Erreur lors du chargement. Réessaye.</p>
              ) : patientsData && patientsData.patients.length > 0 ? (
                <div className="divide-y divide-border">
                  {patientsData.patients.map((ps) => (
                    <Link
                      key={`${ps.patient.id}-${ps.programme.id}`}
                      href={`/dashboard/kine/patients/${ps.patient.id}`}
                      className="flex items-center gap-3 py-2.5 group"
                    >
                      <Avatar className="h-9 w-9 border">
                        <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: avatarColor(ps.patient.id) }}>{getInitials(ps.patient.nom)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate group-hover:text-primary">{ps.patient.nom}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {ps.programme.titre} — Séance {ps.seance.index}/{ps.seance.total}
                        </div>
                      </div>
                      {ps.session.isValidated ? (
                        <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Confirmée</Badge>
                      ) : (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]"><Clock className="h-3 w-3 mr-1" />En attente</Badge>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-6 italic text-sm">
                  Aucun patient avec séance prévue pour le {format(selectedDate, 'dd/MM/yyyy')}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Adhérence semaine */}
          <Card className="card-hover">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-primary text-base">
                <Percent className="h-5 w-5 text-accent" /> Adhérence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-5 mb-4">
                <div className="relative h-24 w-24 shrink-0">
                  <svg viewBox="0 0 90 90" className="h-24 w-24 -rotate-90">
                    <circle cx="45" cy="45" r="38" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                    <circle
                      cx="45" cy="45" r="38" fill="none" stroke="#3899aa" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - (weekAdherence?.percentage ?? 0) / 100)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-primary">
                    {weekAdherence?.percentage ?? 0}%
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs mb-1">Cette semaine</div>
                  <div className="font-medium">{weekAdherence?.doneSessions ?? 0} sur {(weekAdherence?.doneSessions ?? 0) + (weekAdherence?.missedSessions ?? 0)} séances réalisées</div>
                  {weekAdherence && weekAdherence.deltaVsLastWeek !== 0 && (
                    <div className={`text-xs font-semibold mt-1 ${weekAdherence.deltaVsLastWeek > 0 ? 'text-green-600' : 'text-[#f97066]'}`}>
                      {weekAdherence.deltaVsLastWeek > 0 ? '↑ +' : '↓ '}{Math.abs(weekAdherence.deltaVsLastWeek)}% vs sem. dern.
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <div className="text-lg font-bold text-green-600">{weekAdherence?.doneSessions ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Réalisées</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <div className="text-lg font-bold text-[#f97066]">{weekAdherence?.missedSessions ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Manquées</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <div className="text-lg font-bold text-[#3899aa]">{weekAdherence?.plannedToday ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Prévues auj.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA Feedback Beta */}
        <Card className="card-hover">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <h3 className="text-lg font-semibold text-primary mb-1">Ton avis compte !</h3>
                <p className="text-sm text-muted-foreground">Partage tes remarques ou idées pour améliorer l'application.</p>
              </div>
              <Button asChild className="btn-teal flex items-center gap-2 whitespace-nowrap">
                <a href="https://tally.so/r/Np5BJp" target="_blank" rel="noopener noreferrer">
                  <AlertCircle className="h-4 w-4" />
                  Remarques / idées
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <NouveauBilanModal open={bilanModalOpen} onOpenChange={setBilanModalOpen} />
      <NouveauContratModal open={contratModalOpen} onOpenChange={setContratModalOpen} />
    </>
  );
}
