'use client';
import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FileText } from 'lucide-react';
import { fetchBilanRender } from '@/utils/bilanExport';

interface BilanPreviewModalProps { open: boolean; onOpenChange: (o: boolean) => void; bilanId: number; evolution: boolean }

export default function BilanPreviewModal({ open, onOpenChange, bilanId, evolution }: BilanPreviewModalProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetchBilanRender(bilanId, { evolution })
      .then((r) => { if (!cancelled) setHtml(r.html); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [open, bilanId, evolution]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#3899aa]"><FileText className="h-5 w-5" />Aperçu du bilan</DialogTitle></DialogHeader>
        {error ? <p className="text-sm text-destructive text-center py-8">{error}</p>
          : html === null ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#3899aa]" /></div>
          : <div className="bilan-preview bg-white text-black p-6 rounded-md border" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />}
      </DialogContent>
    </Dialog>
  );
}
