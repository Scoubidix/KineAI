'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listSeances, cancelSeance, archiveSeances, unarchiveSeance, VisioSeance, VisioStatus } from '@/lib/visioApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Video, X, Pencil, Send, FileText, Search, Archive, ArchiveRestore } from 'lucide-react';
import { matchesAllTokens } from '@/utils/textSearch';
import { useToast } from '@/hooks/use-toast';
import NouveauVisioModal from './components/NouveauVisioModal';
import RescheduleVisioModal from './components/RescheduleVisioModal';
import ResendLinkModal from './components/ResendLinkModal';
import CompteRenduModal from './components/CompteRenduModal';

const STATUS_LABELS: Record<VisioStatus, string> = {
  SCHEDULED: 'Programmée',
  LIVE: 'En cours',
  ENDED: 'Terminée',
  CANCELLED: 'Annulée',
};

const STATUS_CLASSES: Record<VisioStatus, string> = {
  SCHEDULED: 'bg-[#3899aa]/10 text-[#3899aa]',
  LIVE: 'bg-green-600 text-white',
  ENDED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-red-100 text-red-600',
};

// Palette d'avatars patients (déterministe par id) — alignée sur la page d'accueil
const AVATAR_COLORS = ['#3899aa', '#f59e0b', '#8b5cf6', '#22c55e'];
const avatarColor = (id: number): string => AVATAR_COLORS[id % AVATAR_COLORS.length];
const getInitials = (name?: string): string => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const [crTarget, setCrTarget] = useState<VisioSeance | null>(null);
  const { toast } = useToast();

  // --- Historique : bascule Récentes / Archivées ---
  const [histView, setHistView] = useState<'recent' | 'archived'>('recent');
  const [archivedRows, setArchivedRows] = useState<VisioSeance[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState<string | null>(null);
  const [archivedLoaded, setArchivedLoaded] = useState(false);

  // --- Mode sélection pour l'archivage en lot ---
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const fetchSeances = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    listSeances()
      .then(setSeances)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fetchArchived = useCallback(() => {
    setArchivedLoading(true);
    setArchivedError(null);
    listSeances(true)
      .then((rows) => { setArchivedRows(rows); setArchivedLoaded(true); })
      .catch((e) => setArchivedError(e.message))
      .finally(() => setArchivedLoading(false));
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
  const archivedFiltered = useMemo(
    () =>
      archivedRows
        .filter(matchesPatient)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [archivedRows, matchesPatient]
  );

  // Sortie du mode sélection (réinitialise les cases)
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  // Changement d'onglet / de sous-vue : on annule toute sélection en cours
  const switchTab = (t: Tab) => { setTab(t); exitSelect(); };
  const switchHistView = (v: 'recent' | 'archived') => {
    setHistView(v);
    exitSelect();
    if (v === 'archived' && !archivedLoaded) fetchArchived();
  };

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allSelected = history.length > 0 && selected.size === history.length;
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(history.map((s) => s.id)));

  const confirmArchive = async () => {
    if (selected.size === 0) return;
    setArchiving(true);
    try {
      const { archived } = await archiveSeances([...selected]);
      exitSelect();
      fetchSeances(true);          // l'historique récent se vide des séances archivées
      setArchivedLoaded(false);    // forcera un rechargement des archives à la prochaine ouverture
      toast({ title: 'Séances archivées', description: `${archived} séance(s) déplacée(s) dans les archives.` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async (id: number) => {
    try {
      await unarchiveSeance(id);
      setArchivedRows((prev) => prev.filter((s) => s.id !== id));
      fetchSeances(true);          // réapparaît dans l'historique récent
      toast({ title: 'Séance désarchivée' });
    } catch (e) {
      setArchivedError((e as Error).message);
    }
  };

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

  // Rendu d'une ligne de séance.
  //  - timeOnly=true → n'affiche que l'heure (date dans le sous-titre du groupe).
  //  - selectable=true → case à cocher pour l'archivage en lot.
  //  - archivedView=true → ligne d'archive (bouton Désarchiver).
  const renderRow = (
    s: VisioSeance,
    timeOnly = false,
    opts: { selectable?: boolean; archivedView?: boolean } = {}
  ) => {
    const { selectable = false, archivedView = false } = opts;
    const joinable = s.status === 'SCHEDULED' || s.status === 'LIVE';
    const inUpcoming = tab === 'a-venir';
    const when = new Date(s.scheduledAt);
    const dateLabel = timeOnly
      ? when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : when.toLocaleString('fr-FR');
    const patientName = `${s.patient?.firstName ?? ''} ${s.patient?.lastName ?? ''}`.trim();
    const isSelected = selected.has(s.id);
    return (
      <li
        key={s.id}
        onClick={selectable ? () => toggleOne(s.id) : undefined}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
          selectable ? 'cursor-pointer' : ''
        } ${
          selectable && isSelected
            ? 'border-[#3899aa] bg-[#3899aa]/5'
            : 'hover:bg-muted/40'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          {selectable && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleOne(s.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Sélectionner la séance de ${patientName}`}
            />
          )}
          <Avatar className="h-9 w-9 border">
            <AvatarFallback
              className="text-xs font-semibold text-white"
              style={{ backgroundColor: avatarColor(s.patient?.id ?? s.id) }}
            >
              {getInitials(patientName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{patientName || '—'}</span>
            <span className="text-sm text-muted-foreground">{dateLabel}</span>
          </div>
        </div>
        <div
          className="flex flex-wrap items-center justify-end gap-2"
          onClick={selectable ? (e) => e.stopPropagation() : undefined}
        >
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[s.status]}`}>
            {STATUS_LABELS[s.status]}
          </span>
          {!inUpcoming && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCrTarget(s)}>
              <FileText className="h-4 w-4" />
              Compte-rendu
            </Button>
          )}
          {archivedView && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleUnarchive(s.id)}>
              <ArchiveRestore className="h-4 w-4" />
              Désarchiver
            </Button>
          )}
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
    <div className="space-y-6">
      {/* Hero — même vibe que la page d'accueil */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-6 text-white md:px-8"
        style={{ background: 'linear-gradient(135deg, #1f5c6a 0%, #2d5f6e 50%, #3899aa 100%)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <Video className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-none md:text-3xl">Vidéotransmission</h1>
              <p className="mt-1.5 text-sm opacity-80">Tes séances de télésoin</p>
            </div>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="gap-2 bg-white font-semibold text-primary hover:bg-white/90"
          >
            <Plus className="h-4 w-4" />
            Nouveau RDV
          </Button>
        </div>
        <div className="relative mt-5 sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full border-0 bg-white/95 pl-9 text-foreground placeholder:text-muted-foreground"
            placeholder="Rechercher un patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Liste des séances */}
      <Card className="card-hover">
        <CardContent className="p-4 sm:p-6">
          {/* Onglets */}
          <div className="flex gap-2 border-b">
            {(['a-venir', 'historique'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
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
            <div className="mt-4 flex gap-2">
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

          {/* Historique : sous-bascule Récentes / Archivées + archivage en lot */}
          {tab === 'historique' && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {([
                  ['recent', 'Récentes'],
                  ['archived', 'Archivées'],
                ] as ['recent' | 'archived', string][]).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => switchHistView(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      histView === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {histView === 'recent' && (
                selectMode ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                      Tout sélectionner
                    </label>
                    <Button
                      size="sm"
                      className="btn-teal gap-1.5"
                      disabled={selected.size === 0 || archiving}
                      onClick={confirmArchive}
                    >
                      <Archive className="h-4 w-4" />
                      {archiving ? 'Archivage…' : `Archiver la sélection (${selected.size})`}
                    </Button>
                    <Button size="sm" variant="outline" onClick={exitSelect}>
                      Annuler
                    </Button>
                  </div>
                ) : (
                  history.length > 0 && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSelectMode(true)}>
                      <Archive className="h-4 w-4" />
                      Archiver
                    </Button>
                  )
                )
              )}
            </div>
          )}

          <div className="mt-4">
            {tab === 'historique' && histView === 'archived' ? (
              <>
                {archivedLoading && <p className="text-muted-foreground">Chargement…</p>}
                {archivedError && <p className="text-red-600">{archivedError}</p>}
                {!archivedLoading && !archivedError && (
                  archivedFiltered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                        <Archive className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Aucune séance archivée.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {archivedFiltered.map((s) => renderRow(s, false, { archivedView: true }))}
                    </ul>
                  )
                )}
              </>
            ) : (
              <>
                {loading && <p className="text-muted-foreground">Chargement…</p>}
                {error && <p className="text-red-600">{error}</p>}
                {!loading && !error && (
                  rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                        <Video className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tab === 'a-venir' ? 'Aucune séance sur cette période.' : 'Aucune séance passée.'}
                      </p>
                      {tab === 'a-venir' && (
                        <Button onClick={() => setModalOpen(true)} className="btn-teal mt-4 gap-2">
                          <Plus className="h-4 w-4" />
                          Nouveau RDV
                        </Button>
                      )}
                    </div>
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
                    <ul className="space-y-2">
                      {rows.map((s) => renderRow(s, false, { selectable: tab === 'historique' && selectMode }))}
                    </ul>
                  )
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

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

      {crTarget && (
        <CompteRenduModal
          open={crTarget !== null}
          onOpenChange={(o) => !o && setCrTarget(null)}
          seanceId={crTarget.id}
          initialValue={crTarget.compteRendu ?? ''}
          onSaved={() => fetchSeances(true)}
        />
      )}
    </div>
  );
}
