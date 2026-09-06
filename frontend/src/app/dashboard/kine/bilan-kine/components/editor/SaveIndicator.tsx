'use client';
import React from 'react';
import { Loader2, Check, AlertTriangle, WifiOff, CloudOff } from 'lucide-react';
import type { SaveState } from '@/hooks/useBilanAutosave';

interface SaveIndicatorProps { state: SaveState; savedAt: Date | null; pending: boolean }

export default function SaveIndicator({ state, savedAt, pending }: SaveIndicatorProps) {
  const time = savedAt ? savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium';
  if (state === 'saving' || (pending && state !== 'stale' && state !== 'offline' && state !== 'error')) {
    return <span className={`${base} bg-muted text-muted-foreground`}><Loader2 className="h-3 w-3 animate-spin" />Enregistrement…</span>;
  }
  if (state === 'stale') return <span className={`${base} bg-amber-100 text-amber-800`}><AlertTriangle className="h-3 w-3" />Modifié ailleurs</span>;
  if (state === 'offline') return <span className={`${base} bg-amber-100 text-amber-800`}><WifiOff className="h-3 w-3" />Hors ligne, en attente</span>;
  if (state === 'error') return <span className={`${base} bg-red-100 text-red-700`}><CloudOff className="h-3 w-3" />Non enregistré</span>;
  if (state === 'saved' && time) return <span className={`${base} bg-green-100 text-green-700`}><Check className="h-3 w-3" />Enregistré {time}</span>;
  return <span className={`${base} bg-muted text-muted-foreground`}>Brouillon</span>;
}
