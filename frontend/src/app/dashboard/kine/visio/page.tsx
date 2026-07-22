'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listSeances, cancelSeance, VisioSeance, VisioStatus } from '@/lib/visioApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Video, X, Pencil, Send } from 'lucide-react';
import { matchesAllTokens } from '@/utils/textSearch';
import NouveauVisioModal from './components/NouveauVisioModal';
import RescheduleVisioModal from './components/RescheduleVisioModal';
import ResendLinkModal from './components/ResendLinkModal';

const STATUS_LABELS: Record<VisioStatus, string> = {
  SCHEDULED: 'Programmée',
  LIVE: 'En cours',
  ENDED: 'Terminée',
  CANCELLED: 'Annulée',
};

const STATUS_CLASSES: Record<VisioStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  LIVE: 'bg-green-100 text-green-700',
  ENDED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-600',
};

type Tab = 'a-venir' | 'historique';
type Period = 'jour' | 'semaine' | 'tous';

// --- Helpers de date (jour calendaire local) ---
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function isPastDay(iso: string): boolean {
  return dayStart(new Date(iso)) < dayStart(new Date());
}
function isToday(iso: string): boolean {
  return dayStart(new Date(iso)) === dayStart(new Date());
}
function isThisWeek(iso: string): boolean {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // lundi = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const mondayStart = dayStart(monday);
  const nextMonday = mondayStart + 7 * 24 * 3600 * 1000;
  const t = new Date(iso).getTime();
  return t >= mondayStart && t < nextMonday;
}

// À venir : LIVE, ou SCHEDULED dont la journée n'est pas passée (RDV en retard conservé).
function isUpcoming(s: VisioSeance): boolean {
  return s.status === 'LIVE' || (s.status === 'SCHEDULED' && !isPastDay(s.scheduledAt));
}
// Historique : terminées/annulées, ou SCHEDULED dont la journée est passée (jamais tenues).
function isHistory(s: VisioSeance): boolean {
  return (
    s.status === 'ENDED' ||
    s.status === 'CANCELLED' ||
    (s.status === 'SCHEDULED' && isPastDay(s.scheduledAt))
  );
}
function matchesPeriod(s: VisioSeance, period: Period): boolean {
  if (s.status === 'LIVE') return true; // une séance en cours est toujours visible
  if (period === 'tous') return true;
  if (period === 'jour') return isToday(s.scheduledAt);
  return isThisWeek(s.scheduledAt);
}

export default function VisioPage() {
  const router = useRouter();
  const [seances, setSeances] = useState<VisioSeance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('a-venir');
  const [period, setPeriod] = useState<Period>('jour');
  const [search, setSearch] = useState('');
  const [rescheduleTarget, setRescheduleTarget] = useState<VisioSeance | null>(null);
  const [resendTarget, setResendTarget] = useState<VisioSeance | null>(null);

  const fetchSeances = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    listSeances()
      .then(setSeances)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSeances();
    const t = setInterval(() => fetchSeances(true), 10000);
    return () => clearInterval(t);
  }, [fetchSeances]);

  const handleCancel = async (id: number) => {
    if (!confirm('Annuler cette séance ? Le lien du patient sera invalidé.')) return;
    setCancellingId(id);
    try {
      await cancelSeance(id);
      fetchSeances();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancellingId(null);
    }
  };

  // Filtre par nom de patient (barre de recherche, insensible casse/accents)
  const matchesPatient = useCallback(
    (s: VisioSeance) => {
      if (!search.trim()) return true;
      const name = s.patient ? `${s.patient.firstName} ${s.patient.lastName}` : '';
      return matchesAllTokens(name, search);
    },
    [search]
  );

  const upcoming = useMemo(
    () =>
      seances
        .filter(isUpcoming)
        .filter((s) => matchesPeriod(s, period))
        .filter(matchesPatient)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [seances, period, matchesPatient]
  );
  const history = useMemo(
    () =>
      seances
        .filter(isHistory)
        .filter(matchesPatient)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [seances, matchesPatient]
  );

  const rows = tab === 'a-venir' ? upcoming : history;

  // Groupage par jour (activé sur À venir quand période = semaine/tous)
  const showGroups = tab === 'a-venir' && period !== 'jour';
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: VisioSeance[] }[] = [];
    for (const s of rows) {
      const d = new Date(s.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const label = d.toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, label, items: [] }; groups.push(g); }
      g.items.push(s);
    }
    return groups;
  }, [rows]);

  // Rendu d'une ligne de séance. timeOnly=true → n'affiche que l'heure (date dans le sous-titre).
  const renderRow = (s: VisioSeance, timeOnly = false) => {
    const joinable = s.status === 'SCHEDULED' || s.status === 'LIVE';
    const inUpcoming = tab === 'a-venir';
    const when = new Date(s.scheduledAt);
    const dateLabel = timeOnly
      ? when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : when.toLocaleString('fr-FR');
    return (
      <li
        key={s.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
      >
        <div className="flex flex-col">
          <span className="font-medium">
            {s.patient?.firstName} {s.patient?.lastName}
          </span>
          <span className="text-sm text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[s.status]}`}>
            {STATUS_LABELS[s.status]}
          </span>
          {inUpcoming && joinable && s.patientPresent && (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Patient en salle
            </span>
          )}
          {inUpcoming && joinable && (
            <Button
              size="sm"
              className="btn-teal gap-1.5"
              onClick={() => router.push(`/dashboard/kine/visio/${s.id}/room`)}
            >
              <Video className="h-4 w-4" />
              Rejoindre
            </Button>
          )}
          {inUpcoming && (s.status === 'SCHEDULED' || s.status === 'LIVE') && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setResendTarget(s)}>
              <Send className="h-4 w-4" />
              Renvoyer
            </Button>
          )}
          {inUpcoming && s.status === 'SCHEDULED' && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRescheduleTarget(s)}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
          )}
          {inUpcoming && s.status === 'SCHEDULED' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={cancellingId === s.id}
              onClick={() => handleCancel(s.id)}
            >
              <X className="h-4 w-4" />
              {cancellingId === s.id ? 'Annulation…' : 'Annuler'}
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h1 className="text-2xl font-semibold">Vidéotransmission</h1>
          <Input
            className="w-full sm:w-72"
            placeholder="Rechercher un patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setModalOpen(true)} className="btn-teal gap-2">
          <Plus className="h-4 w-4" />
          Nouveau RDV
        </Button>
      </div>

      {/* Onglets */}
      <div className="mb-4 flex gap-2 border-b">
        {(['a-venir', 'historique'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'a-venir' ? 'À venir' : 'Historique'}
          </button>
        ))}
      </div>

      {/* Filtre de période (onglet À venir uniquement) */}
      {tab === 'a-venir' && (
        <div className="mb-4 flex gap-2">
          {([
            ['jour', "Aujourd'hui"],
            ['semaine', 'Cette semaine'],
            ['tous', 'Tous'],
          ] as [Period, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-muted-foreground">Chargement…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        rows.length === 0 ? (
          <p className="text-muted-foreground">
            {tab === 'a-venir' ? 'Aucune séance sur cette période.' : 'Aucune séance passée.'}
          </p>
        ) : showGroups ? (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.key}>
                <h3 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
                  {g.label}
                </h3>
                <ul className="space-y-2">{g.items.map((s) => renderRow(s, true))}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-2">{rows.map((s) => renderRow(s))}</ul>
        )
      )}

      <NouveauVisioModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={fetchSeances}
        existingSeances={seances}
      />

      <RescheduleVisioModal
        open={rescheduleTarget !== null}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        seance={rescheduleTarget}
        onRescheduled={fetchSeances}
      />

      <ResendLinkModal
        open={resendTarget !== null}
        onOpenChange={(o) => !o && setResendTarget(null)}
        seance={resendTarget}
        onResent={fetchSeances}
      />
    </div>
  );
}
