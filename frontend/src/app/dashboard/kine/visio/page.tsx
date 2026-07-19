'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listSeances, cancelSeance, VisioSeance, VisioStatus } from '@/lib/visioApi';
import { Button } from '@/components/ui/button';
import { Plus, Video, X, Pencil } from 'lucide-react';
import NouveauVisioModal from './components/NouveauVisioModal';
import RescheduleVisioModal from './components/RescheduleVisioModal';

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
  const [rescheduleTarget, setRescheduleTarget] = useState<VisioSeance | null>(null);

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

  const upcoming = useMemo(
    () =>
      seances
        .filter(isUpcoming)
        .filter((s) => matchesPeriod(s, period))
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [seances, period]
  );
  const history = useMemo(
    () =>
      seances
        .filter(isHistory)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [seances]
  );

  const rows = tab === 'a-venir' ? upcoming : history;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Vidéotransmission</h1>
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
        <ul className="space-y-2">
          {rows.map((s) => {
            const joinable = s.status === 'SCHEDULED' || s.status === 'LIVE';
            const inUpcoming = tab === 'a-venir';
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {s.patient?.firstName} {s.patient?.lastName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(s.scheduledAt).toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[s.status]}`}
                  >
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
                  {inUpcoming && s.status === 'SCHEDULED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setRescheduleTarget(s)}
                    >
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
          })}
          {rows.length === 0 && (
            <li className="text-muted-foreground">
              {tab === 'a-venir' ? 'Aucune séance sur cette période.' : 'Aucune séance passée.'}
            </li>
          )}
        </ul>
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
    </div>
  );
}
