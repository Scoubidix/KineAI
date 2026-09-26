'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import type { TestGuide } from '@/types/bilan';
import TestGuideContent from './TestGuideContent';
import YouTubeFacade from './YouTubeFacade';

interface TestGuideDialogProps {
  fieldKey: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Déclencheur (bouton ⓘ) : rattaché par DialogTrigger, Radix lui rend le focus à la fermeture */
  children?: ReactNode;
}

/**
 * Fiche pratique d'un test (pattern WAI-ARIA Dialog via Radix) : fenêtre centrée sur ordinateur,
 * plein écran sur téléphone. Le contenu n'est chargé qu'à la première ouverture.
 * Réutilisable par la future bibliothèque des tests.
 */
export default function TestGuideDialog({ fieldKey, label, open, onOpenChange, children }: TestGuideDialogProps) {
  const [guide, setGuide] = useState<TestGuide | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/bilan-guides/${encodeURIComponent(fieldKey)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setGuide(json.guide);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [fieldKey]);

  useEffect(() => {
    if (open && status === 'idle') load();
  }, [open, status, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {/* Pas de description : le texte de la fiche suffit (aria-describedby explicite, sinon Radix avertit) */}
      <DialogContent aria-describedby={undefined} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto sm:max-w-2xl max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-full max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
        <DialogHeader className="border-b pb-3 pr-8">
          <DialogTitle className="text-lg font-semibold leading-snug text-[#3899aa]">{label}</DialogTitle>
        </DialogHeader>

        {(status === 'loading' || status === 'idle') && (
          <div className="space-y-2" aria-busy="true" aria-label="Chargement de la fiche">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Impossible de charger la fiche.</p>
            <Button type="button" variant="outline" size="sm" onClick={load}>Réessayer</Button>
          </div>
        )}

        {status === 'ready' && guide && (
          <div className="space-y-4">
            <TestGuideContent content={guide.content} />
            {guide.youtubeId && <YouTubeFacade videoId={guide.youtubeId} start={guide.youtubeStart} title={label} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
