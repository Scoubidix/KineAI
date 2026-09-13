'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { Download, Edit, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { deleteBilan } from '@/utils/bilanApi';
import { downloadBilanPdf, fetchBilanRender } from '@/utils/bilanExport';
import { BILAN_TYPE_COLORS, BILAN_TYPE_LABELS, type BilanDocument, type BilanType } from '@/types/bilan';
import { CARD, PageHeader, formatDateLong } from '../../../components/listPage';
import { BILANS_REALISES_HREF } from '../../page';

interface BilanFull {
  id: number;
  motif: string | null;
  type: BilanType;
  createdAt: string;
  document: BilanDocument | null;
}

export default function BilanRealisePage() {
  const params = useParams<{ patientId: string; bilanId: string }>();
  const patientId = Number(params.patientId);
  const bilanId = Number(params.bilanId);
  const router = useRouter();
  const { toast } = useToast();
  const [bilan, setBilan] = useState<BilanFull | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(patientId) || !Number.isInteger(bilanId)) { setNotFound(true); return; }
    let cancelled = false;
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans/${bilanId}`)
      .then((r) => (r.ok ? r.json() : { success: false }))
      .then((j) => { if (!cancelled) { if (j.success) setBilan(j.bilan); else setNotFound(true); } })
      .catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; };
  }, [patientId, bilanId]);

  // Rendu serveur : c'est le même producteur que le PDF, et le seul capable d'afficher les
  // bilans hérités (sans `document`, uniquement un `bilanHtml`), que l'éditeur refuse.
  useEffect(() => {
    if (!bilan) return;
    let cancelled = false;
    fetchBilanRender(bilan.id)
      .then((r) => { if (!cancelled) setHtml(r.html); })
      .catch((e: Error) => { if (!cancelled) setRenderError(e.message); });
    return () => { cancelled = true; };
  }, [bilan]);

  const backHref = `${BILANS_REALISES_HREF}/${patientId}`;

  const handleDelete = async () => {
    if (!bilan) return;
    try {
      await deleteBilan(bilan.id);
      toast({ title: 'Bilan supprimé' });
      router.push(backHref);
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handlePdf = async () => {
    if (!bilan) return;
    const r = await downloadBilanPdf(bilan.id);
    if (!r.success) toast({ title: 'Erreur', description: r.error ?? 'PDF impossible', variant: 'destructive' });
  };

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <PageHeader backHref={backHref} backLabel="Retour aux bilans du patient" title="Bilan introuvable" />
        <p className="text-sm text-muted-foreground text-center py-10">Ce bilan n’existe pas ou ne t’appartient pas.</p>
      </div>
    );
  }

  const c = bilan ? BILAN_TYPE_COLORS[bilan.type] : null;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <PageHeader backHref={backHref} backLabel="Retour aux bilans du patient" title={bilan?.motif || 'Bilan'} />

      {bilan && (
        <div className="flex items-center gap-2 flex-wrap">
          {c && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>{BILAN_TYPE_LABELS[bilan.type]}</span>}
          <span className="text-xs text-muted-foreground flex-1">{formatDateLong(bilan.createdAt)}</span>
          {/* Un bilan hérité n'a pas de `document` : l'éditeur le refuse, on n'offre pas le bouton */}
          {bilan.document && (
            <Button size="sm" onClick={() => router.push(`/dashboard/kine/bilan-kine/${bilan.id}?step=document`)} className="btn-teal h-8 rounded-full px-3">
              <Edit className="h-3.5 w-3.5 mr-1.5" />Ouvrir dans l’éditeur
            </Button>
          )}
          <Button size="sm" onClick={handlePdf} className="btn-teal h-8 rounded-full px-3">
            <Download className="h-3.5 w-3.5 mr-1.5" />PDF
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce bilan ?</AlertDialogTitle>
                <AlertDialogDescription>Le bilan du {formatDateLong(bilan.createdAt)} ne sera plus visible dans la fiche patient.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <div className={`${CARD} bilan-preview min-h-[200px] text-sm leading-relaxed text-foreground p-4`}>
        {renderError ? (
          <p className="text-sm text-destructive text-center py-8">{renderError}</p>
        ) : html === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
        )}
      </div>
    </div>
  );
}
