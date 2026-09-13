'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MoreHorizontal, Search, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { listMyBilans, deleteBilan } from '@/utils/bilanApi';
import { BILAN_TYPE_LABELS, BILAN_TYPE_COLORS, type BilanListItem } from '@/types/bilan';
import { formatRelative, hasActiveJob, jobLabel, jobLabelClass, needsAction, patientName, shortMotif } from '../components/DraftsRow';

// Surface commune aux blocs de la page : la carte blanche élevée du reste de l'app
// (partie statique de .card-hover — le halo teal au survol est réservé au cliquable)
const CARD = 'rounded-xl bg-white dark:bg-card border border-border shadow-md';

// Recherche tolérante aux accents et à la casse : « lombalgie » trouve « Lombalgie »
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const initials = (b: BilanListItem): string | null =>
  (b.patient ? `${b.patient.firstName[0] ?? ''}${b.patient.lastName[0] ?? ''}`.toUpperCase() || null : null);

/** Pourcentage à afficher en barre : seulement pendant un traitement qui avance. */
const activeProgress = (b: BilanListItem): number | null => {
  const j = b.job;
  if (!j || j.progress === null || j.status === 'DONE' || needsAction(b)) return null;
  return Math.round(j.progress * 100);
};

// ---- Filtres par état ----
// Les trois étapes automatiques (transcription, correction, rédaction) tiennent dans un seul
// groupe : elles s'enchaînent en quelques minutes et n'appellent aucune décision différente du
// kiné. Le détail reste sur chaque ligne (« 40 % · Correction ») et dans la barre.
type Bucket = 'action' | 'processing' | 'ready' | 'notes';
type Filter = Bucket | 'all';

const bucketOf = (b: BilanListItem): Bucket => {
  if (needsAction(b)) return 'action';
  const s = b.job?.status;
  if (s === 'TRANSCRIBING' || s === 'CORRECTING' || s === 'COMPOSING') return 'processing';
  if (s === 'DONE' || b.status === 'GENERE') return 'ready';
  return 'notes';
};

const BUCKETS: { key: Bucket; label: string; amber?: boolean }[] = [
  { key: 'action', label: 'À reprendre', amber: true },
  { key: 'processing', label: 'En traitement' },
  { key: 'ready', label: 'Rédigés' },
  { key: 'notes', label: 'Notes' },
];

export default function BrouillonsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<BilanListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<BilanListItem | null>(null);

  const load = () => listMyBilans({ statuses: ['BROUILLON', 'GENERE'], limit: 100 });

  useEffect(() => {
    let cancelled = false;
    load().then((l) => { if (!cancelled) setItems(l); }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  // Un bilan se rédige côté serveur : on rafraîchit l'avancement tant qu'un traitement tourne
  // (effet piloté par un booléen, sinon chaque rafraîchissement réarmerait l'intervalle)
  const active = hasActiveJob(items ?? []);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setInterval(() => { load().then((l) => { if (!cancelled) setItems(l); }).catch(() => {}); }, 10_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { action: 0, processing: 0, ready: 0, notes: 0 };
    for (const b of items ?? []) c[bucketOf(b)] += 1;
    return c;
  }, [items]);

  // Un groupe qui se vide (dernière suppression, traitement qui aboutit) ne doit pas laisser la
  // page sur une liste vide : on retombe sur « Tous » sans attendre un clic.
  const effective: Filter = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;

  // Filtre et tri côté client : l'API ne renvoie que les 100 derniers brouillons du kiné.
  // Tri figé sur le plus récent — le seul ordre utile pour des brouillons, la recherche
  // couvrant le besoin « retrouver le bilan d'un patient nommé ».
  const visible = useMemo(() => {
    const q = fold(query.trim());
    const kept = (items ?? []).filter((b) => (effective === 'all' || bucketOf(b) === effective)
      && (!q || fold(`${patientName(b)} ${b.motif ?? ''}`).includes(q)));
    return [...kept].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items, query, effective]);

  const handleDelete = async (b: BilanListItem) => {
    setPendingDelete(null);
    try {
      await deleteBilan(b.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== b.id));
      toast({ title: 'Brouillon supprimé' });
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const open = (b: BilanListItem) => router.push(`/dashboard/kine/bilan-kine/${b.id}`);

  const chip = (key: Filter, label: string, count: number, amber = false) => {
    const on = effective === key;
    const tone = amber
      ? 'border-amber-500 bg-amber-500/10 text-amber-700'
      : 'border-[#3899aa] bg-[#3899aa]/10 text-[#3899aa]';
    return (
      <button
        key={key}
        type="button"
        onClick={() => setFilter(key)}
        aria-pressed={on}
        className={`inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-colors ${on ? tone : 'border-border bg-white dark:bg-card text-muted-foreground hover:bg-muted/60'}`}
      >
        {label}
        <span className={`tabular-nums ${on ? '' : amber ? 'text-amber-700' : 'text-foreground/70'}`}>{count}</span>
      </button>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {/* Barre d'application (MD3 top app bar) : le retour partage la ligne du titre au lieu de
          flotter seul au-dessus. Bordé plutôt que fantôme, pour se voir sans attendre le survol. */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push('/dashboard/kine/bilan-kine')}
          aria-label="Retour aux bilans"
          title="Retour aux bilans"
          className="h-9 w-9 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold truncate text-[#3899aa]">Mes brouillons</h1>
      </div>

      {items !== null && items.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un patient, un motif…"
              aria-label="Rechercher un brouillon"
              className="pl-9 bg-white dark:bg-card"
            />
          </div>
          {/* Puces de filtre : les compteurs répondent à « ai-je quelque chose à finir ? »
              sans qu'on ait besoin de filtrer. Un groupe vide n'affiche pas sa puce. */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par état">
            {chip('all', 'Tous', items.length)}
            {BUCKETS.filter((b) => counts[b.key] > 0).map((b) => chip(b.key, b.label, counts[b.key], b.amber))}
          </div>
        </div>
      )}

      {items === null && (
        <div className={`${CARD} divide-y divide-border/60 overflow-hidden`} aria-busy="true" aria-label="Chargement des brouillons">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className={`${CARD} py-12 text-center space-y-3`}>
          <div aria-hidden="true" className="w-12 h-12 mx-auto rounded-xl bg-[#fffbeb] flex items-center justify-center text-2xl">📂</div>
          <p className="text-sm text-muted-foreground">Aucun brouillon en cours</p>
          <Button asChild size="sm"><Link href="/dashboard/kine/bilan-kine">Démarrer un bilan</Link></Button>
        </div>
      )}

      {items !== null && items.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Aucun brouillon ne correspond à &laquo;&nbsp;{query.trim()}&nbsp;&raquo;
        </p>
      )}

      {visible.length > 0 && (
        <ul className={`${CARD} divide-y divide-border/60 overflow-hidden`}>
          {visible.map((b) => {
            const c = BILAN_TYPE_COLORS[b.type];
            const label = jobLabel(b);
            const pct = activeProgress(b);
            const ini = initials(b);
            return (
              <li
                key={b.id}
                /* Liseré ambre = le kiné doit agir ; transparent ailleurs pour garder l'alignement */
                className={`group relative flex items-center gap-3 pl-3 pr-2 py-3 border-l-2 transition-colors hover:bg-muted/40 ${needsAction(b) ? 'border-l-amber-500' : 'border-l-transparent'}`}
              >
                <span aria-hidden="true" className="shrink-0 w-9 h-9 rounded-full bg-[#3899aa]/10 text-[#3899aa] text-xs font-semibold inline-flex items-center justify-center">
                  {ini ?? <User className="h-4 w-4" />}
                </span>

                {/* Un vrai lien, pas un bouton : Ctrl-clic, clic-milieu, URL au survol et « copier
                    le lien » doivent fonctionner comme sur la carte du hub. La barre de progression
                    en sort (contenu non-phrasing + son aria-label serait absorbé dans le nom du lien). */}
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/kine/bilan-kine/${b.id}`} className="block text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{patientName(b)}</span>
                      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>{BILAN_TYPE_LABELS[b.type]}</span>
                    </div>
                    <div className={`text-xs mt-0.5 truncate ${jobLabelClass(b)}`}>
                      {label ?? (b.status === 'GENERE' ? 'Rédigé' : 'Brouillon')} · {shortMotif(b.motif) || 'Sans motif'} · {formatRelative(b.updatedAt)}
                    </div>
                  </Link>
                  {pct !== null && (
                    <Progress
                      value={pct}
                      aria-label={`Avancement du traitement : ${pct} %`}
                      className="h-1 mt-2 max-w-[240px] bg-[#3899aa]/15"
                      indicatorClassName="bg-[#3899aa]"
                    />
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* Divulgation progressive : masqué au repos sur pointeur, toujours visible au tactile */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Actions pour le brouillon de ${patientName(b)}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open(b)}>Ouvrir</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPendingDelete(b)} className="text-red-600 focus:text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" />Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {/* Une seule boîte de confirmation pour toute la liste, pilotée par l'état */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce brouillon ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `Le brouillon de ${patientName(pendingDelete)} et ses notes seront définitivement supprimés.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && handleDelete(pendingDelete)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
