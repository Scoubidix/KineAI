'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, FileText, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { deleteBilan } from '@/utils/bilanApi';
import { downloadBilanPdf } from '@/utils/bilanExport';
import { BILAN_TYPE_COLORS, BILAN_TYPE_LABELS, type BilanType } from '@/types/bilan';
import { CARD, EmptyState, FilterChip, ListSkeleton, PageHeader, formatDateLong } from '../../components/ListPage';
import { BILANS_REALISES_HREF, parseId } from '../../components/bilansRealises';

interface BilanSummary {
  id: number;
  motif: string | null;
  type: BilanType;
  createdAt: string;
}

const TYPES: BilanType[] = ['INITIAL', 'INTERMEDIAIRE', 'FINAL'];

export default function PatientBilansPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = parseId(params.patientId);
  const { toast } = useToast();
  const [bilans, setBilans] = useState<BilanSummary[] | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'ok' | 'introuvable' | 'panne'>('ok');
  const [filter, setFilter] = useState<BilanType | 'all'>('all');
  const [pendingDelete, setPendingDelete] = useState<BilanSummary | null>(null);

  // `GET /api/patients/:id` vérifie déjà l'appartenance au kiné et répond 404 sinon : on
  // distingue ainsi « pas ton patient » de « aucun bilan » et de « le serveur est tombé »,
  // au lieu de télécharger toute la patientèle pour n'en garder qu'un nom.
  useEffect(() => {
    if (patientId === null) { setLoadState('introuvable'); setBilans([]); return; }
    let cancelled = false;
    const api = process.env.NEXT_PUBLIC_API_URL;
    Promise.all([
      fetchWithAuth(`${api}/api/patients/${patientId}`),
      fetchWithAuth(`${api}/api/patients/${patientId}/bilans`),
    ])
      .then(async ([rp, rb]) => {
        if (cancelled) return;
        if (rp.status === 404) { setLoadState('introuvable'); setBilans([]); return; }
        if (!rp.ok || !rb.ok) { setLoadState('panne'); setBilans([]); return; }
        const p = await rp.json();
        const b = await rb.json();
        setPatientName(`${p.firstName} ${String(p.lastName).toUpperCase()}`);
        setBilans(b.success ? b.bilans : []);
        if (!b.success) setLoadState('panne');
      })
      .catch(() => { if (!cancelled) { setLoadState('panne'); setBilans([]); } });
    return () => { cancelled = true; };
  }, [patientId]);

  const counts = useMemo(() => {
    const c = { INITIAL: 0, INTERMEDIAIRE: 0, FINAL: 0 } as Record<BilanType, number>;
    for (const b of bilans ?? []) c[b.type] += 1;
    return c;
  }, [bilans]);

  // Un type dont le dernier bilan vient d'être supprimé ne doit pas laisser une liste vide
  const effective = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;
  const visible = (bilans ?? []).filter((b) => effective === 'all' || b.type === effective);

  const handleDelete = async (b: BilanSummary) => {
    setPendingDelete(null);
    try {
      await deleteBilan(b.id);
      setBilans((prev) => (prev ?? []).filter((x) => x.id !== b.id));
      toast({ title: 'Bilan supprimé' });
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  const handlePdf = async (b: BilanSummary) => {
    const r = await downloadBilanPdf(b.id);
    if (!r.success) toast({ title: 'Erreur', description: r.error ?? 'PDF impossible', variant: 'destructive' });
  };

  const titre = patientName ?? (loadState === 'introuvable' ? 'Patient introuvable' : 'Bilans du patient');

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <PageHeader backHref={BILANS_REALISES_HREF} backLabel="Retour aux patients" title={titre} />

      {bilans !== null && bilans.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par type de bilan">
          <FilterChip label="Tous" count={bilans.length} active={effective === 'all'} onClick={() => setFilter('all')} />
          {TYPES.filter((t) => counts[t] > 0).map((t) => (
            <FilterChip key={t} label={BILAN_TYPE_LABELS[t]} count={counts[t]} active={effective === t} onClick={() => setFilter(t)} />
          ))}
        </div>
      )}

      {bilans === null && <ListSkeleton label="Chargement des bilans" />}

      {loadState === 'introuvable' && (
        <EmptyState emoji="🔍" badgeClass="bg-[#eff6ff]" message="Ce patient n’existe pas ou ne t’appartient pas."
          action={<Link href={BILANS_REALISES_HREF} className="text-sm text-[#3899aa] underline underline-offset-4">Revenir aux patients</Link>} />
      )}

      {loadState === 'panne' && (
        <EmptyState emoji="⚠️" badgeClass="bg-[#fef2f2]" message="Impossible de charger les bilans pour l’instant. Recharge la page dans un instant." />
      )}

      {loadState === 'ok' && bilans !== null && bilans.length === 0 && (
        <EmptyState
          emoji="🔍"
          badgeClass="bg-[#eff6ff]"
          message="Aucun bilan pour ce patient"
          action={<Link href={BILANS_REALISES_HREF} className="text-sm text-[#3899aa] underline underline-offset-4">Revenir aux patients</Link>}
        />
      )}

      {visible.length > 0 && (
        <ul className={`${CARD} divide-y divide-border/60 overflow-hidden`}>
          {visible.map((b) => {
            const c = BILAN_TYPE_COLORS[b.type];
            return (
              <li key={b.id} className="group flex items-center gap-3 pl-3 pr-2 py-3 hover:bg-muted/40 transition-colors">
                <span aria-hidden="true" className="shrink-0 w-9 h-9 rounded-full bg-[#3899aa]/10 text-[#3899aa] inline-flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </span>
                <Link href={`${BILANS_REALISES_HREF}/${patientId}/${b.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">{b.motif || 'Sans motif'}</span>
                    <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>{BILAN_TYPE_LABELS[b.type]}</span>
                  </div>
                  <div className="text-xs mt-0.5 truncate text-muted-foreground">{formatDateLong(b.createdAt)}</div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* Divulgation progressive : masqué au repos sur pointeur, toujours visible au tactile */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Actions pour le bilan du ${formatDateLong(b.createdAt)}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`${BILANS_REALISES_HREF}/${patientId}/${b.id}`}>Ouvrir</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { void handlePdf(b); }}>
                      <Download className="h-4 w-4 mr-2" />Télécharger le PDF
                    </DropdownMenuItem>
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

      {/* Une seule boîte de confirmation pour toute la liste, pilotée par l'loadState */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce bilan ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `Le bilan du ${formatDateLong(pendingDelete.createdAt)} ne sera plus visible dans la fiche patient.` : ''}
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
