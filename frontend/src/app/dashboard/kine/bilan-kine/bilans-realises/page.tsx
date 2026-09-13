'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { matchesAllTokens } from '@/utils/textSearch';
import { CARD, EmptyState, Initials, ListSkeleton, PageHeader, formatDateLong } from '../components/listPage';

export const BILANS_REALISES_HREF = '/dashboard/kine/bilan-kine/bilans-realises';

export interface PatientWithBilans {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  lastBilanDate: string | null;
  bilanCount: number;
}

export default function BilansRealisesPage() {
  const [patients, setPatients] = useState<PatientWithBilans[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/bilans/patients-with-bilans`)
      .then((r) => (r.ok ? r.json() : { success: false }))
      .then((j) => { if (!cancelled) setPatients(j.success ? j.patients : []); })
      .catch(() => { if (!cancelled) setPatients([]); });
    return () => { cancelled = true; };
  }, []);

  // Recherche par nom seulement : des puces de filtre par type n'apprendraient rien sur une
  // liste de patients, et le nom est la seule chose qu'un kiné a en tête en arrivant ici.
  const visible = useMemo(() => {
    const list = patients ?? [];
    return query.trim()
      ? list.filter((p) => matchesAllTokens(`${p.firstName} ${p.lastName}`, query))
      : list;
  }, [patients, query]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <PageHeader backHref="/dashboard/kine/bilan-kine" backLabel="Retour aux bilans" title="Bilans réalisés" />

      {patients !== null && patients.length > 0 && (
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un patient…"
            aria-label="Rechercher un patient"
            className="pl-9 bg-white dark:bg-card"
          />
        </div>
      )}

      {patients === null && <ListSkeleton label="Chargement des patients" />}

      {patients !== null && patients.length === 0 && (
        <EmptyState
          emoji="🔍"
          badgeClass="bg-[#eff6ff]"
          message="Aucun bilan réalisé pour l’instant"
          action={<Link href="/dashboard/kine/bilan-kine" className="text-sm text-[#3899aa] underline underline-offset-4">Démarrer un bilan</Link>}
        />
      )}

      {patients !== null && patients.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Aucun patient ne correspond à &laquo;&nbsp;{query.trim()}&nbsp;&raquo;
        </p>
      )}

      {visible.length > 0 && (
        <ul className={`${CARD} divide-y divide-border/60 overflow-hidden`}>
          {visible.map((p) => (
            <li key={p.id}>
              <Link
                href={`${BILANS_REALISES_HREF}/${p.id}`}
                className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40 transition-colors"
              >
                <Initials first={p.firstName} last={p.lastName} fallback={<User className="h-4 w-4" />} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.firstName} {p.lastName.toUpperCase()}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.bilanCount} bilan{p.bilanCount > 1 ? 's' : ''}
                    {p.lastBilanDate ? ` · dernier le ${formatDateLong(p.lastBilanDate)}` : ''}
                  </div>
                </div>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
