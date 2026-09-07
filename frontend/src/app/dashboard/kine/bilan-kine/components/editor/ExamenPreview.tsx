'use client';
import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { Loader2 } from 'lucide-react';
import { fetchBilanRender } from '@/utils/bilanExport';

interface ExamenPreviewProps { bilanId: number; refreshKey: string; evolution: boolean }

// Tableaux de l'examen clinique tels qu'ils sortiront dans le PDF (rendu serveur)
export default function ExamenPreview({ bilanId, refreshKey, evolution }: ExamenPreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchBilanRender(bilanId, { evolution }).then((r) => { if (!cancelled) setHtml(r.examenHtml); }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [bilanId, refreshKey, evolution]);
  if (error) return <p className="text-sm text-destructive p-3">{error}</p>;
  if (html === null) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>;
  if (html === '') return <p className="text-sm text-muted-foreground italic p-3">Aucune mesure en tableau. Ajoute des mesures à l’étape Mesures.</p>;
  return <div className="bilan-preview text-sm p-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
