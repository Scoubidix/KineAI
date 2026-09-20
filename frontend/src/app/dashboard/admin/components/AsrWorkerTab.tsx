'use client';

// Onglet admin « Statistiques › Worker ASR » : état live du worker (poll 10 s) et agrégats
// sur 7 ou 30 jours (usage, délai vécu par le kiné, échecs par cause, traitements bloqués).
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Loader2, AlertTriangle, Activity } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

interface WorkerHealth {
  configured: boolean;
  reachable: boolean;
  status: 'ok' | 'loading' | 'error' | null;
  model: string | null;
  slots: number | null;
  busy: number | null;
  queued: number | null;
  breaker: { open: boolean; failures: number; openUntil: number | null };
}

interface UsageDay {
  date: string;
  segments: number;
  segmentsDictation: number;
  segmentsSession: number;
  audioMinutes: number;
  activeKines: number;
}

interface LatencyDay {
  date: string;
  dictation: { p50: number | null; p95: number | null; count: number };
  session: { p50: number | null; p95: number | null; count: number };
}

interface AsrStats {
  days: number;
  from: string;
  usage: UsageDay[];
  totals: {
    segments: number; audioMinutes: number; activeKines: number;
    avgSegmentsPerActiveKine: number; maxSegmentsPerKine: number;
    retryRate: number; rtf: number | null;
  };
  latency: LatencyDay[];
  failures: { segments: { error: string; count: number }[]; jobs: { error: string; count: number }[] };
  stuck: { transcribing: number; tail: number };
}

const POLL_MS = 10_000;
const dayLabel = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

// Palette validée (séparation daltonisme + contraste ≥ 3:1, claire et sombre) — ne pas
// remplacer par des tokens --chart-* : deux d'entre eux sont indiscernables l'un de l'autre.
const DICTATION_COLOR = '#0d9488'; // teal — Dictée
const SESSION_COLOR = '#6366f1'; // indigo — Séance
const FAILURE_COLOR = '#d97706'; // ambre — échecs
// Trait de séparation entre segments empilés (2 px, couleur du fond de la carte — les
// graphiques sont sur bg-card, pas bg-background, les deux teintes diffèrent).
const STACK_GAP_COLOR = 'hsl(var(--card))';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function HealthBanner({ health }: { health: WorkerHealth | null }) {
  if (!health) {
    return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Lecture de l&apos;état du worker…</div>;
  }
  if (!health.configured) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Worker non configuré sur cet environnement (<code>ASR_WORKER_URL</code> / <code>ASR_WORKER_TOKEN</code> absents).
      </div>
    );
  }

  const down = !health.reachable || health.status === 'error';
  const loading = health.status === 'loading';
  const dot = down ? 'bg-red-500' : loading ? 'bg-amber-600' : 'bg-emerald-500';
  const label = down ? 'injoignable' : loading ? 'modèle en chargement' : 'en ligne';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
          Worker {label}
        </span>
        {health.model && <span className="text-muted-foreground">modèle&nbsp;: {health.model}</span>}
        {health.slots !== null && (
          <span className="text-muted-foreground">créneaux&nbsp;: {health.busy ?? 0}/{health.slots}</span>
        )}
        {health.queued !== null && <span className="text-muted-foreground">file&nbsp;: {health.queued}</span>}
        {health.breaker.open && (
          <span className="flex items-center gap-1.5 font-medium text-red-600">
            <AlertTriangle className="h-4 w-4" />
            disjoncteur ouvert ({health.breaker.failures} échecs)
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Le disjoncteur est celui de l&apos;instance backend qui répond, pas une vue d&apos;ensemble.
      </p>
    </div>
  );
}

// Un des deux graphiques de délai (petits multiples) : p50 plein + p95 tireté, une seule
// couleur (celle du registre concerné), légende car deux séries.
// `domain` est partagé entre les deux instances (calculé par l'appelant) : deux petits
// multiples doivent être comparables sans échelle Y indépendante, sinon on recrée
// précisément l'erreur de lisibilité que le découpage en deux graphiques doit éviter.
function LatencyChart({
  title, data, color, domain,
}: {
  title: string;
  data: { label: string; p50: number | null; p95: number | null }[];
  color: string;
  domain: [number, number | 'auto'];
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-sm font-medium text-foreground">{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} unit="s" domain={domain} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="p50" name="p50" stroke={color} strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="p95" name="p95" stroke={color} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AsrWorkerTab() {
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [stats, setStats] = useState<AsrStats | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard/asr/health`);
      const body = await res.json();
      if (body.success) setHealth(body.data);
    } catch {
      // Un écran de monitoring ne doit pas casser quand le service surveillé tombe
    }
  }, []);

  // Poll 10 s, suspendu quand l'onglet du navigateur est masqué (même principe que usePionniersChat)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(loadHealth, POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => { if (document.hidden) stop(); else { loadHealth(); start(); } };

    loadHealth();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [loadHealth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard/asr/stats?days=${days}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.success) {
          setStats(body.data);
        } else {
          // Ne pas laisser les données de la fenêtre précédente affichées sous le
          // nouveau libellé (ex. chiffres 7 j visibles sous le bouton « 30 jours »).
          setStats(null);
          setError(body.error || 'Erreur de chargement');
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setError('Erreur de chargement');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const usage = (stats?.usage ?? []).map((u) => ({ ...u, label: dayLabel(u.date) }));
  const dictationLatency = (stats?.latency ?? []).map((l) => ({
    label: dayLabel(l.date),
    p50: l.dictation.p50,
    p95: l.dictation.p95,
  }));
  const sessionLatency = (stats?.latency ?? []).map((l) => ({
    label: dayLabel(l.date),
    p50: l.session.p50,
    p95: l.session.p95,
  }));
  // Domaine Y partagé entre les deux petits multiples de délai : sans ça, deux courbes
  // d'allure identique pourraient représenter 8 s et 120 s sur des échelles indépendantes.
  const latencyValues = [...dictationLatency, ...sessionLatency]
    .flatMap((d) => [d.p50, d.p95])
    .filter((v): v is number => v !== null);
  const latencyMax = latencyValues.length ? Math.max(...latencyValues) : undefined;
  const latencyDomain: [number, number | 'auto'] = [0, latencyMax ?? 'auto'];
  const stuckTotal = (stats?.stuck.transcribing ?? 0) + (stats?.stuck.tail ?? 0);

  return (
    <div className="space-y-6">
      <HealthBanner health={health} />

      <div className="flex items-center gap-2">
        {([7, 30] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              days === d ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {d} jours
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des statistiques…
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {stats && !loading && (
        <>
          {stuckTotal > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {stuckTotal} traitement(s) bloqué(s) — {stats.stuck.transcribing} en transcription,{' '}
                {stats.stuck.tail} en queue. En temps normal ce compteur vaut 0.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Tile label="Segments" value={stats.totals.segments.toLocaleString('fr-FR')} />
            <Tile label="Minutes audio" value={stats.totals.audioMinutes.toLocaleString('fr-FR')} />
            <Tile label="Kinés actifs" value={stats.totals.activeKines.toLocaleString('fr-FR')} />
            <Tile
              label="Segments / kiné"
              value={stats.totals.avgSegmentsPerActiveKine.toLocaleString('fr-FR')}
              hint={`max ${stats.totals.maxSegmentsPerKine.toLocaleString('fr-FR')}`}
            />
            <Tile label="Taux de reprise" value={`${Math.round(stats.totals.retryRate * 100)} %`} />
            <Tile
              label="RTF"
              value={stats.totals.rtf === null ? '—' : String(stats.totals.rtf)}
              hint={stats.totals.rtf === null ? 'pas encore de mesure' : 'calcul / audio'}
            />
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <Activity className="h-4 w-4" /> Segments par jour
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={usage}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                {/* itemStyle force la couleur du texte : par défaut recharts colore le texte
                    de l'infobulle avec getMainColorOfGraphicItem, qui vaut `stroke` pour une
                    Area — ici la couleur du fond utilisée pour l'écart de 2 px (cf. plus bas),
                    donc un texte quasi invisible sans ce correctif. */}
                <Tooltip itemStyle={{ color: 'hsl(var(--foreground))' }} />
                {/* Payload explicite : recharts dérive sinon la couleur de légende de l'Area
                    depuis `stroke` (utilisé ici pour l'écart de 2 px, cf. commentaire ci-dessous),
                    ce qui afficherait des pastilles couleur du fond au lieu du teal/indigo. */}
                <Legend
                  payload={[
                    { value: 'Dictée', type: 'square', color: DICTATION_COLOR },
                    { value: 'Séance', type: 'square', color: SESSION_COLOR },
                  ]}
                />
                {/* Écart de 2 px entre les segments empilés (bordure couleur du fond) :
                    encodage secondaire, la paire teal/indigo étant à la limite de
                    séparation pour une forme de daltonisme. */}
                <Area
                  type="monotone" dataKey="segmentsDictation" name="Dictée" stackId="1"
                  stroke={STACK_GAP_COLOR} strokeWidth={2} fill={DICTATION_COLOR} fillOpacity={0.35}
                />
                <Area
                  type="monotone" dataKey="segmentsSession" name="Séance" stackId="1"
                  stroke={STACK_GAP_COLOR} strokeWidth={2} fill={SESSION_COLOR} fillOpacity={0.35}
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Minutes audio transcrites par jour</h3>
            {/* Série unique : pas de légende, le titre suffit à la nommer. */}
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={usage}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="audioMinutes" name="Minutes audio" stroke={DICTATION_COLOR} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-1 text-sm font-medium text-foreground">Délai de transcription par segment</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Mise en file → texte écrit, en secondes. C&apos;est l&apos;attente réellement subie par le kiné.
              Deux graphiques séparés (Dictée / Séance) : quatre séries dans un seul plot ne se distinguent pas.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LatencyChart title="Dictée" data={dictationLatency} color={DICTATION_COLOR} domain={latencyDomain} />
              <LatencyChart title="Séance" data={sessionLatency} color={SESSION_COLOR} domain={latencyDomain} />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Échecs par cause</h3>
            {stats.failures.segments.length === 0 && stats.failures.jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun échec sur la période.</p>
            ) : (
              <>
                {stats.failures.segments.length > 0 && (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">Segments</p>
                    <ResponsiveContainer width="100%" height={Math.max(120, stats.failures.segments.length * 36)}>
                      <BarChart data={stats.failures.segments} layout="vertical" margin={{ top: 5, right: 24, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="error" width={180} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Segments" fill={FAILURE_COLOR} radius={[0, 4, 4, 0]}>
                          {/* Étiquette de valeur directement sur la barre : encodage secondaire
                              en plus de l'infobulle, pour la même raison de séparation limite. */}
                          <LabelList dataKey="count" position="right" className="fill-foreground" fontSize={12} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
                {stats.failures.jobs.length > 0 && (
                  <>
                    <p className="mb-2 mt-4 text-xs text-muted-foreground">
                      Traitements perdus de bout en bout (le kiné a perdu sa dictée)
                    </p>
                    <ul className="space-y-1 text-sm text-foreground">
                      {stats.failures.jobs.map((f) => (
                        <li key={f.error} className="flex justify-between border-b border-border py-1">
                          <span className="font-mono text-xs">{f.error}</span>
                          <span className="font-medium">{f.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
