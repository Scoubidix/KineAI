'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { matchesAllTokens } from '@/utils/textSearch';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  FileText,
  Edit,
  Download,
  Trash2,
  ArrowLeft,
  Loader2,
  Calendar,
} from 'lucide-react';
import { BilanType, BilanStatus, BilanDocument, BILAN_TYPE_LABELS, BILAN_TYPE_COLORS } from '@/types/bilan';
import { fetchBilanRender, downloadBilanPdf } from '@/utils/bilanExport';
import { deleteBilan } from '@/utils/bilanApi';

interface PatientWithBilans {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  lastBilanDate: string | null;
  bilanCount: number;
}

interface BilanSummary {
  id: number;
  motif: string | null;
  type: BilanType;
  status: BilanStatus;
  createdAt: string;
  updatedAt: string;
}

interface BilanFull extends BilanSummary {
  rawNotes: string;
  bilanHtml: string | null;
  structuredData: unknown;
  document: BilanDocument | null;
}

type View = 'search' | 'list' | 'detail';

interface PatientBilansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PatientBilansModal({ open, onOpenChange }: PatientBilansModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [view, setView] = useState<View>('search');
  const [search, setSearch] = useState('');

  const [patients, setPatients] = useState<PatientWithBilans[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  const [selectedPatient, setSelectedPatient] = useState<PatientWithBilans | null>(null);
  const [bilans, setBilans] = useState<BilanSummary[]>([]);
  const [loadingBilans, setLoadingBilans] = useState(false);

  const [selectedBilan, setSelectedBilan] = useState<BilanFull | null>(null);
  const [loadingBilan, setLoadingBilan] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Reset complet à la fermeture
  useEffect(() => {
    if (!open) {
      setView('search');
      setSearch('');
      setSelectedPatient(null);
      setBilans([]);
      setSelectedBilan(null);
    }
  }, [open]);

  // Charger les patients ayant des bilans à l'ouverture (vue search)
  useEffect(() => {
    if (!open || view !== 'search') return;
    const fetchPatients = async () => {
      setLoadingPatients(true);
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/bilans/patients-with-bilans`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setPatients(json.patients);
      } finally {
        setLoadingPatients(false);
      }
    };
    fetchPatients();
  }, [open, view]);

  // Chargement du rendu (lecture seule) via le moteur serveur
  useEffect(() => {
    if (!selectedBilan) return;
    let cancelled = false;
    setRenderedHtml(null);
    setRenderError(null);
    fetchBilanRender(selectedBilan.id)
      .then((r) => { if (!cancelled) setRenderedHtml(r.html); })
      .catch((e: Error) => { if (!cancelled) setRenderError(e.message); });
    return () => { cancelled = true; };
  }, [selectedBilan]);

  const filteredPatients = patients.filter((p) =>
    matchesAllTokens(`${p.firstName} ${p.lastName}`, search)
  );

  const handleSelectPatient = async (p: PatientWithBilans) => {
    setSelectedPatient(p);
    setView('list');
    setLoadingBilans(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${p.id}/bilans`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setBilans(json.bilans);
    } finally {
      setLoadingBilans(false);
    }
  };

  const handleViewBilan = async (bilanId: number) => {
    if (!selectedPatient) return;
    setLoadingBilan(true);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${selectedPatient.id}/bilans/${bilanId}`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setSelectedBilan(json.bilan);
        setView('detail');
      }
    } finally {
      setLoadingBilan(false);
    }
  };

  const handleDeleteBilan = async () => {
    if (!selectedBilan) return;
    try {
      await deleteBilan(selectedBilan.id);
      setBilans((prev) => prev.filter((b) => b.id !== selectedBilan.id));
      setSelectedBilan(null);
      setView('list');
      toast({ title: 'Bilan supprimé', description: 'Le bilan a été supprimé' });
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedBilan) return;
    const result = await downloadBilanPdf(selectedBilan.id);
    if (!result.success) toast({ title: 'Erreur', description: result.error ?? 'PDF impossible', variant: 'destructive' });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <FileText className="w-5 h-5" />
            {view === 'search' && 'Bilans réalisés'}
            {view === 'list' && selectedPatient && (
              <span className="truncate">
                Bilans — {selectedPatient.firstName} {selectedPatient.lastName.toUpperCase()}
              </span>
            )}
            {view === 'detail' && selectedBilan && (
              <span className="truncate">
                Bilan {BILAN_TYPE_LABELS[selectedBilan.type]} — {formatDate(selectedBilan.createdAt)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* === Vue 1 : recherche === */}
        {view === 'search' && (
          <div className="space-y-3 overflow-y-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un patient..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                autoFocus
              />
            </div>

            {loadingPatients ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#3899aa]" />
              </div>
            ) : filteredPatients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {patients.length === 0
                  ? 'Aucun patient avec un bilan pour le moment'
                  : 'Aucun patient trouvé'}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {filteredPatients.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPatient(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#3899aa]/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-[#3899aa]">
                        {p.firstName[0]}
                        {p.lastName[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {p.firstName} {p.lastName.toUpperCase()}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(p.birthDate).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.bilanCount} bilan{p.bilanCount > 1 ? 's' : ''}
                        {p.lastBilanDate && ` · dernier le ${formatDate(p.lastBilanDate)}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === Vue 2 : liste des bilans du patient === */}
        {view === 'list' && selectedPatient && (
          <div className="space-y-3 overflow-y-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('search')}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground self-start"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Retour à la recherche
            </Button>

            {loadingBilans ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#3899aa]" />
              </div>
            ) : bilans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun bilan pour ce patient</p>
            ) : (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {bilans.map((b) => {
                  const colors = BILAN_TYPE_COLORS[b.type];
                  return (
                    <button
                      key={b.id}
                      onClick={() => handleViewBilan(b.id)}
                      disabled={loadingBilan}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5 transition-colors text-left disabled:opacity-50"
                    >
                      <FileText className="w-4 h-4 text-[#3899aa] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                            {BILAN_TYPE_LABELS[b.type]}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(b.createdAt)}
                          </span>
                        </div>
                        {b.motif && <p className="text-sm font-medium truncate mt-0.5">{b.motif}</p>}
                      </div>
                      {loadingBilan && <Loader2 className="w-4 h-4 animate-spin text-[#3899aa]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === Vue 3 : détail / édition d'un bilan === */}
        {view === 'detail' && selectedBilan && selectedPatient && (
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* Barre actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedBilan(null);
                  setView('list');
                }}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Retour à la liste
              </Button>
              <div className="flex gap-2">
                {selectedBilan.document && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/dashboard/kine/bilan-kine/${selectedBilan.id}?step=document`)}
                    className="btn-teal h-8 rounded-full px-3"
                  >
                    <Edit className="h-3.5 w-3.5 mr-1.5" />
                    Ouvrir dans l'éditeur
                  </Button>
                )}
                <Button size="sm" onClick={handleDownloadPdf} className="btn-teal h-8 rounded-full px-3">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  PDF
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Supprimer
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer ce bilan ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Le bilan ne sera plus visible dans la fiche patient.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteBilan} className="bg-red-600 hover:bg-red-700">
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Méta */}
            {selectedBilan.motif && (
              <div className="text-xs text-muted-foreground italic">Motif : {selectedBilan.motif}</div>
            )}

            {/* Contenu (lecture seule) */}
            <div className="flex-1 overflow-y-auto">
              <div className="bilan-preview min-h-[200px] text-sm leading-relaxed text-foreground p-4 rounded-xl border border-border/50 bg-white dark:bg-card">
                {renderError ? (
                  <p className="text-sm text-destructive text-center py-8">{renderError}</p>
                ) : renderedHtml === null ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#3899aa] mx-auto" />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedHtml) }} />
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
