'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Save,
  X,
  User,
  Calendar,
} from 'lucide-react';
import { BilanType, BILAN_TYPE_LABELS, BILAN_TYPE_COLORS } from '@/types/bilan';
import { generateBilanPdf, KineProfileForPdf, PatientForPdf } from '@/utils/bilanPdf';

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
  createdAt: string;
  updatedAt: string;
}

interface BilanFull extends BilanSummary {
  rawNotes: string;
  bilanHtml: string;
  structuredData: unknown;
}

type View = 'search' | 'list' | 'detail';

interface PatientBilansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PatientBilansModal({ open, onOpenChange }: PatientBilansModalProps) {
  const { toast } = useToast();

  const [view, setView] = useState<View>('search');
  const [search, setSearch] = useState('');

  const [patients, setPatients] = useState<PatientWithBilans[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  const [selectedPatient, setSelectedPatient] = useState<PatientWithBilans | null>(null);
  const [bilans, setBilans] = useState<BilanSummary[]>([]);
  const [loadingBilans, setLoadingBilans] = useState(false);

  const [selectedBilan, setSelectedBilan] = useState<BilanFull | null>(null);
  const [loadingBilan, setLoadingBilan] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const [kineProfile, setKineProfile] = useState<KineProfileForPdf | null>(null);

  // Reset complet à la fermeture
  useEffect(() => {
    if (!open) {
      setView('search');
      setSearch('');
      setSelectedPatient(null);
      setBilans([]);
      setSelectedBilan(null);
      setEditing(false);
    }
  }, [open]);

  // Charger profil kiné (pour entête PDF) à l'ouverture
  useEffect(() => {
    if (!open) return;
    const fetchProfile = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
        if (res.ok) {
          const data = await res.json();
          setKineProfile(data);
        }
      } catch {
        // silent
      }
    };
    fetchProfile();
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

  // Injection HTML dans le contentEditable d'édition (équivalent du pattern existant)
  useEffect(() => {
    if (editing && editRef.current && selectedBilan) {
      editRef.current.innerHTML = selectedBilan.bilanHtml;
    }
  }, [editing, selectedBilan]);

  // Injection HTML dans la div de visualisation (lecture seule)
  useEffect(() => {
    if (!editing && viewRef.current && selectedBilan) {
      viewRef.current.innerHTML = DOMPurify.sanitize(selectedBilan.bilanHtml);
    }
  }, [editing, selectedBilan]);

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
        setEditing(false);
        setView('detail');
      }
    } finally {
      setLoadingBilan(false);
    }
  };

  const handleStartEdit = () => {
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedPatient || !selectedBilan || !editRef.current) return;
    try {
      setSavingEdit(true);
      const newHtml = DOMPurify.sanitize(editRef.current.innerHTML);
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${selectedPatient.id}/bilans/${selectedBilan.id}`,
        { method: 'PUT', body: JSON.stringify({ bilanHtml: newHtml }) }
      );
      const json = await res.json();
      if (json.success) {
        setSelectedBilan({ ...selectedBilan, bilanHtml: newHtml });
        setEditing(false);
        toast({ title: 'Bilan modifié', description: 'Les modifications ont été sauvegardées' });
      } else {
        toast({ title: 'Erreur', description: json.error || 'Sauvegarde impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Sauvegarde impossible', variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteBilan = async () => {
    if (!selectedPatient || !selectedBilan) return;
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${selectedPatient.id}/bilans/${selectedBilan.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        setBilans((prev) => prev.filter((b) => b.id !== selectedBilan.id));
        setSelectedBilan(null);
        setView('list');
        toast({ title: 'Bilan supprimé', description: 'Le bilan a été supprimé' });
      } else {
        toast({ title: 'Erreur', description: json.error || 'Suppression impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Suppression impossible', variant: 'destructive' });
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedBilan || !selectedPatient) return;
    const patient: PatientForPdf = {
      firstName: selectedPatient.firstName,
      lastName: selectedPatient.lastName,
      birthDate: selectedPatient.birthDate,
    };
    // On utilise le HTML actuellement édité si on est en mode édition
    const html =
      editing && editRef.current
        ? DOMPurify.sanitize(editRef.current.innerHTML)
        : selectedBilan.bilanHtml;
    const result = generateBilanPdf({
      bilanHtml: html,
      bilanDateIso: selectedBilan.createdAt,
      kineProfile,
      patient,
    });
    if (!result.success) {
      toast({ title: 'Erreur', description: result.error ?? 'PDF impossible', variant: 'destructive' });
    }
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
                  setEditing(false);
                  setView('list');
                }}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Retour à la liste
              </Button>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={savingEdit}
                      className="h-8 rounded-full px-3"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="btn-teal h-8 rounded-full px-3"
                    >
                      {savingEdit ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Enregistrer
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={handleStartEdit} className="btn-teal h-8 rounded-full px-3">
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Modifier
                    </Button>
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
                  </>
                )}
              </div>
            </div>

            {/* Méta */}
            {selectedBilan.motif && (
              <div className="text-xs text-muted-foreground italic">Motif : {selectedBilan.motif}</div>
            )}

            {/* Contenu (édition ou lecture) */}
            <div className="flex-1 overflow-y-auto">
              {editing ? (
                <div
                  ref={editRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="min-h-[400px] text-sm leading-relaxed text-foreground p-4 rounded-xl border-2 border-[#3899aa]/40 bg-white dark:bg-card focus:outline-none focus:border-[#3899aa]/70 transition-all"
                />
              ) : (
                <div
                  ref={viewRef}
                  className="min-h-[200px] text-sm leading-relaxed text-foreground p-4 rounded-xl border border-border/50 bg-white dark:bg-card"
                />
              )}
              {editing && (
                <p className="text-[11px] text-muted-foreground mt-2 text-right">
                  Tu peux modifier directement le contenu ci-dessus
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
