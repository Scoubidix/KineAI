'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { ProgrammeModal } from '@/components/ProgrammeModal';

import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Loader2, X, Edit, Trash2, Send, Copy, Plus, User, Calendar, Mail, Phone, Dumbbell, Clock, Activity, MessageCircle, CheckCircle, AlertCircle, Search, Archive, ArrowLeft, ChevronRight, FileText, Download } from 'lucide-react';
import DOMPurify from 'dompurify';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';

interface PatientData {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string | null;
  phone: string;
  goals?: string;
}

interface Programme {
  id: number;
  titre: string;
  description: string;
  duree: number;
  dateFin: string;
  exercices: any[];
}

interface BilanSummary {
  id: number;
  motif: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BilanFull extends BilanSummary {
  rawNotes: string;
  bilanHtml: string;
}

interface ArchivedProgramme {
  id: number;
  titre: string;
  description: string;
  duree: number;
  dateDebut: string;
  dateFin: string;
  archivedAt: string | null;
  exercices: Array<{
    id: number;
    series: number;
    repetitions: number;
    pause: number;
    tempsTravail?: number;
    consigne: string;
    exerciceModele: {
      id: number;
      nom: string;
      description: string;
    };
  }>;
  sessionValidations: Array<{
    date: string;
    isValidated: boolean;
    painLevel: number | null;
    difficultyLevel: number | null;
  }>;
}

// Type pour le statut WhatsApp
type WhatsAppStatus = 'idle' | 'sending' | 'success' | 'error';

function calculateAge(birthDateStr: string) {
  const birthDate = new Date(birthDateStr);
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
}

function formatDate(birthDateStr: string): string {
  const date = new Date(birthDateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [programmesData, setProgrammesData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États pour la création
  const [openCreateModal, setOpenCreateModal] = useState(false);
  
  // États pour la modification
  const [openEditModal, setOpenEditModal] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState<Programme | null>(null);
  
  // États pour génération de lien et WhatsApp
  const [generatingLink, setGeneratingLink] = useState<number | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [currentProgrammeId, setCurrentProgrammeId] = useState<number | null>(null);
  
  // États WhatsApp
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>('idle');
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // États programmes archivés
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedProgrammes, setArchivedProgrammes] = useState<ArchivedProgramme[]>([]);
  const [selectedArchivedProgramme, setSelectedArchivedProgramme] = useState<ArchivedProgramme | null>(null);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [archivedSearchQuery, setArchivedSearchQuery] = useState('');

  // États bilans
  const [bilans, setBilans] = useState<BilanSummary[]>([]);
  const [selectedBilan, setSelectedBilan] = useState<BilanFull | null>(null);
  const [showBilansModal, setShowBilansModal] = useState(false);
  const [loadingBilans, setLoadingBilans] = useState(false);
  const [loadingBilanDetail, setLoadingBilanDetail] = useState(false);
  const [editingBilanId, setEditingBilanId] = useState<number | null>(null);
  const [editBilanHtml, setEditBilanHtml] = useState('');
  const editBilanRef = useRef<HTMLDivElement>(null);
  const [kineProfile, setKineProfile] = useState<{ firstName: string; lastName: string; adresseCabinet?: string; rpps?: string } | null>(null);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/${patientId}`);
        if (!res.ok) throw new Error('Erreur récupération patient');
        const data = await res.json();
        setPatient(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (patientId) fetchPatient();
  }, [patientId]);

  useEffect(() => {
    const fetchProgrammes = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${patientId}`);
        const data = await res.json();
        setProgrammesData(data);
      } catch (err) {
        console.error("Erreur récupération programmes :", err);
      }
    };
    if (patientId) fetchProgrammes();
  }, [patientId]);

  // Charger les bilans du patient
  useEffect(() => {
    const fetchBilans = async () => {
      if (!patientId) return;
      try {
        setLoadingBilans(true);
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans`);
        const data = await res.json();
        if (data.success) setBilans(data.bilans);
      } catch (err) {
        console.error('Erreur chargement bilans:', err);
      } finally {
        setLoadingBilans(false);
      }
    };
    fetchBilans();
  }, [patientId]);

  // Charger le profil kiné pour le PDF
  useEffect(() => {
    const fetchKineProfile = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
        if (res.ok) {
          const data = await res.json();
          setKineProfile(data);
        }
      } catch (err) {
        console.error('Erreur chargement profil kiné:', err);
      }
    };
    fetchKineProfile();
  }, []);

  const handleViewBilan = async (bilanId: number) => {
    try {
      setLoadingBilanDetail(true);
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans/${bilanId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedBilan(data.bilan);
        setEditingBilanId(null);
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger le bilan', variant: 'destructive' });
    } finally {
      setLoadingBilanDetail(false);
    }
  };

  const handleStartEditBilan = () => {
    if (!selectedBilan) return;
    setEditingBilanId(selectedBilan.id);
    setEditBilanHtml(selectedBilan.bilanHtml);
    setTimeout(() => {
      if (editBilanRef.current) {
        editBilanRef.current.innerHTML = selectedBilan.bilanHtml;
      }
    }, 50);
  };

  const handleSaveEditBilan = async () => {
    if (!selectedBilan || !editBilanRef.current) return;
    try {
      const newHtml = DOMPurify.sanitize(editBilanRef.current.innerHTML);
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans/${selectedBilan.id}`, {
        method: 'PUT',
        body: JSON.stringify({ bilanHtml: newHtml }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedBilan({ ...selectedBilan, bilanHtml: newHtml });
        setEditingBilanId(null);
        toast({ title: 'Bilan modifié', description: 'Les modifications ont été sauvegardées' });
      } else {
        toast({ title: 'Erreur', description: data.error || 'Erreur modification', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la modification', variant: 'destructive' });
    }
  };

  const handleDeleteBilan = async (bilanId: number) => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/bilans/${bilanId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setBilans(prev => prev.filter(b => b.id !== bilanId));
        if (selectedBilan?.id === bilanId) setSelectedBilan(null);
        toast({ title: 'Bilan supprimé', description: 'Le bilan a été supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' });
    }
  };

  const handleDownloadBilanPDF = (bilan: BilanFull) => {
    if (!patient) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erreur', description: 'Autorise les fenêtres pop-up', variant: 'destructive' });
      return;
    }

    const today = new Date(bilan.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoUrl = `${window.location.origin}/logo.png`;
    const patientBirthDate = new Date(patient.birthDate).toLocaleDateString('fr-FR');

    let headerHTML = '';
    if (kineProfile) {
      const name = `${kineProfile.firstName} ${kineProfile.lastName.toUpperCase()}`;
      headerHTML = `
        <div class="header">
          <div class="header-left">
            <div class="header-name">${DOMPurify.sanitize(name)}</div>
            <div>Masseur-Kinésithérapeute D.E.</div>
            ${kineProfile.rpps ? `<div>RPPS : ${DOMPurify.sanitize(kineProfile.rpps)}</div>` : ''}
            ${kineProfile.adresseCabinet ? `<div>${DOMPurify.sanitize(kineProfile.adresseCabinet)}</div>` : ''}
          </div>
          <div class="header-right">
            <img src="${logoUrl}" alt="Logo" class="header-logo" />
            <div class="header-app-name">Mon Assistant Kiné</div>
          </div>
        </div>
        <div class="header-separator"></div>
      `;
    }

    const patientInfoHTML = `
      <div class="patient-info">
        <strong>Patient :</strong> ${DOMPurify.sanitize(patient.firstName)} ${DOMPurify.sanitize(patient.lastName.toUpperCase())}
        &nbsp;&bull;&nbsp; Né(e) le ${patientBirthDate}
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Bilan Kinésithérapique - ${DOMPurify.sanitize(patient.firstName)} ${DOMPurify.sanitize(patient.lastName)}</title>
          <style>
            @page { margin: 2cm; size: A4; }
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 21cm; margin: 0 auto; padding: 1cm; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5em; }
            .header-left { font-size: 11pt; line-height: 1.4; }
            .header-name { font-weight: bold; font-size: 13pt; }
            .header-right { display: flex; align-items: center; gap: 10px; }
            .header-logo { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
            .header-app-name { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; font-weight: bold; color: #3899aa; }
            .header-separator { height: 3px; background: linear-gradient(to right, #4db3c5, #1f5c6a); border: none; border-radius: 2px; margin: 0.6em 0 1.2em 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .patient-info { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin-bottom: 1em; padding: 0.5em 0; border-bottom: 1px solid #ccc; }
            .bilan-date { text-align: right; font-size: 10pt; color: #555; font-family: Arial, Helvetica, sans-serif; margin-bottom: -0.5em; }
            h1, h2, h3 { font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; }
            h1 { font-size: 16pt; text-align: center; }
            h2 { font-size: 14pt; }
            h3 { font-size: 12pt; }
            p, li { margin-bottom: 0.5em; text-align: justify; }
            strong { font-weight: bold; }
            u { text-decoration: underline; font-weight: 600; }
            em { font-style: italic; }
            hr { border: none; border-top: 1px solid #000; margin: 1em 0; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${headerHTML}
          <div class="bilan-date">Le ${today}</div>
          ${patientInfoHTML}
          ${DOMPurify.sanitize(bilan.bilanHtml)}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  };

  const refreshProgrammes = async () => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${patientId}`);
      const data = await res.json();
      setProgrammesData(data);
    } catch (err) {
      console.error("Erreur récupération programmes :", err);
    }
  };

  const handleEditProgramme = (programme: Programme) => {
    setEditingProgramme(programme);
    setOpenEditModal(true);
  };

  const handleDeleteProgramme = async (programmeId: number) => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${programmeId}`, {
        method: "DELETE"
      });
      
      if (!res.ok) throw new Error("Erreur suppression programme");
      
      await refreshProgrammes();
    } catch (err) {
      console.error("Erreur suppression programme :", err);
    }
  };

  const handleGenerateLink = async (programmeId: number) => {
    setGeneratingLink(programmeId);
    setCurrentProgrammeId(programmeId);
    setWhatsappStatus('idle');
    setWhatsappError(null);
    
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${programmeId}/generate-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (!res.ok) throw new Error("Erreur génération lien");
      
      const data = await res.json();
      setGeneratedLink(data.chatLink);
      setShowLinkModal(true);
      
    } catch (err) {
      console.error("Erreur génération lien :", err);
      alert("Erreur lors de la génération du lien");
    } finally {
      setGeneratingLink(null);
    }
  };

  // NOUVELLE FONCTION : Envoyer le lien par WhatsApp
  const handleSendWhatsApp = async () => {
    if (!currentProgrammeId || !generatedLink || !patient) return;

    setSendingWhatsApp(true);
    setWhatsappStatus('sending');
    setWhatsappError(null);

    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${currentProgrammeId}/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chatLink: generatedLink
        })
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setWhatsappStatus('success');
      } else {
        setWhatsappStatus('error');
        setWhatsappError(result.error || 'Erreur inconnue');
      }
    } catch (err) {
      console.error("Erreur envoi WhatsApp :", err);
      setWhatsappStatus('error');
      setWhatsappError('Erreur technique lors de l\'envoi');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const copyLinkToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      alert("Lien copié dans le presse-papiers !");
    }
  };

  // Fetch programmes archivés (lazy, au clic uniquement)
  const fetchArchivedProgrammes = async () => {
    setLoadingArchived(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${patientId}/archived`);
      if (!res.ok) throw new Error('Erreur récupération programmes archivés');
      const data = await res.json();
      setArchivedProgrammes(data);
    } catch (err) {
      console.error("Erreur récupération programmes archivés :", err);
      toast({ title: "Erreur", description: "Impossible de récupérer les anciens programmes", variant: "destructive" });
    } finally {
      setLoadingArchived(false);
    }
  };

  const handleOpenArchivedModal = () => {
    setShowArchivedModal(true);
    setSelectedArchivedProgramme(null);
    setArchivedSearchQuery('');
    fetchArchivedProgrammes();
  };

  const getArchivedStats = (programme: ArchivedProgramme) => {
    const validations = programme.sessionValidations;
    const totalDays = Math.ceil(
      (new Date(programme.dateFin).getTime() - new Date(programme.dateDebut).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const validatedDays = validations.filter(v => v.isValidated).length;
    const painLevels = validations.filter(v => v.painLevel !== null).map(v => v.painLevel as number);
    const difficultyLevels = validations.filter(v => v.difficultyLevel !== null).map(v => v.difficultyLevel as number);
    const avgPain = painLevels.length > 0 ? Math.round((painLevels.reduce((a, b) => a + b, 0) / painLevels.length) * 10) / 10 : null;
    const avgDifficulty = difficultyLevels.length > 0 ? Math.round((difficultyLevels.reduce((a, b) => a + b, 0) / difficultyLevels.length) * 10) / 10 : null;
    return { totalDays, validatedDays, avgPain, avgDifficulty };
  };

  const filteredArchivedProgrammes = archivedProgrammes.filter(p =>
    p.titre.toLowerCase().includes(archivedSearchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(archivedSearchQuery.toLowerCase())
  );

  return (
    <>
      <div className="p-4 sm:p-6 space-y-6 overflow-x-hidden">
        {/* Section profil patient NOUVELLE VERSION */}
        <div className="card-hover rounded-lg overflow-hidden">
          <div className="relative">
            
            {loading ? (
              <div className="relative flex items-center justify-center py-6">
                <Loader2 className="animate-spin w-6 h-6 text-[#3899aa]" />
              </div>
            ) : patient && (
              <div className="relative p-4">
                {/* Tout dans un seul bloc ultra-compact */}
                <div className="rounded-xl p-4">
                  <div className="space-y-2">
                    {/* Avatar + Nom + Age + Infos contact */}
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-[#3899aa]/10 flex items-center justify-center ring-2 ring-[#3899aa]/30">
                          <User className="w-6 h-6 text-[#3899aa]" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center ring-1 ring-white">
                          <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-8">
                          <h1 className="text-xl font-bold text-[#3899aa] leading-tight">
                            {patient.firstName} {patient.lastName.toUpperCase()}
                          </h1>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground min-w-0">
                            {patient.email && (
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3 text-[#3899aa] shrink-0" />
                                <span className="truncate">{patient.email}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1 shrink-0">
                              <Phone className="w-3 h-3 text-[#3899aa]" />
                              {patient.phone}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span className="text-xs">
                            {calculateAge(patient.birthDate)} ans • {formatDate(patient.birthDate)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          onClick={() => { setShowBilansModal(true); }}
                          className="h-9 text-sm gap-2 border-[#3899aa]/30 text-[#3899aa] hover:bg-[#3899aa]/10"
                        >
                          <FileText className="w-4 h-4" />
                          Bilans
                          {bilans.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-[#3899aa]/10 text-[#3899aa]">
                              {bilans.length}
                            </Badge>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleOpenArchivedModal}
                          className="h-9 text-sm gap-2 border-[#3899aa]/30 text-[#3899aa] hover:bg-[#3899aa]/10"
                        >
                          <Archive className="w-4 h-4" />
                          Anciens Programmes
                        </Button>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section programmes */}
        <Card className="card-hover">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold flex items-center gap-2 text-[#3899aa]">
                <Activity className="w-5 h-5 text-[#3899aa]" />
                Programmes d'exercices
              </CardTitle>
              <p className="text-sm text-foreground">
                Gère les programmes de rééducation de ton patient
              </p>
            </div>
            {programmesData.length === 0 && (
              <>
                <Button
                  className="btn-teal w-full sm:w-auto"
                  onClick={() => setOpenCreateModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau programme
                </Button>
                <ProgrammeModal
                  open={openCreateModal}
                  onOpenChange={setOpenCreateModal}
                  patientId={parseInt(patientId as string, 10)}
                  onCreated={async () => { await refreshProgrammes(); }}
                />
              </>
            )}
          </CardHeader>
          
          <CardContent>
            {programmesData.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Aucun programme créé
                </h3>
                <p className="text-foreground mb-6">
                  Commence par créer un programme d'exercices personnalisé pour ce patient
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {programmesData.map((programme: any, index: number) => (
                  <Card key={programme.id || index} className="card-hover border-l-4 border-l-[#3899aa]">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">
                            {programme.titre}
                          </h3>
                          <p className="text-foreground mb-3">{programme.description}</p>
                          <div className="flex items-center gap-2 sm:gap-4 text-sm text-muted-foreground flex-wrap">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{programme.duree} jours</span>
                            </div>
                            {programme.dateFin && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>Fin : {new Date(programme.dateFin).toLocaleDateString('fr-FR')}</span>
                              </div>
                            )}
                            {programme.exercices && (
                              <div className="flex items-center gap-1">
                                <Dumbbell className="w-4 h-4" />
                                <span>{programme.exercices.length} exercice{programme.exercices.length > 1 ? 's' : ''}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 self-start">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                            onClick={() => handleGenerateLink(programme.id)}
                            disabled={generatingLink === programme.id}
                          >
                            {generatingLink === programme.id ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                            ) : (
                              <Send className="w-4 h-4 mr-1.5" />
                            )}
                            Envoyer à mon Patient
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditProgramme(programme)}
                            className="hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-200 dark:hover:border-blue-700"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <ProgrammeModal
                            open={openEditModal && editingProgramme?.id === programme.id}
                            onOpenChange={(o) => { setOpenEditModal(o); if (!o) setEditingProgramme(null); }}
                            patientId={parseInt(patientId as string, 10)}
                            programme={editingProgramme ?? undefined}
                            onCreated={async () => { await refreshProgrammes(); }}
                          />

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Es-tu sûr de vouloir supprimer le programme <strong>"{programme.titre}"</strong> ?
                                  Cette action est irréversible et supprimera également l'accès chat du patient.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteProgramme(programme.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      
                      {/* Liste des exercices */}
                      {programme.exercices && programme.exercices.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                            <Dumbbell className="w-4 h-4 text-[#3899aa]" />
                            Exercices du programme
                          </h4>
                          <div className="grid gap-3">
                            {programme.exercices.map((exercise: any, exIndex: number) => (
                              <div key={exercise.id || exIndex} className="p-4 bg-gray-50 dark:bg-gray-800 border rounded-lg">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                                      {exercise.exerciceModele?.nom || exercise.nom}
                                    </h5>
                                    <div className="flex items-center gap-2 sm:gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2 flex-wrap">
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.series} série{exercise.series > 1 ? 's' : ''}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.repetitions} rép.
                                      </Badge>
                                      {exercise.tempsTravail > 0 && (
                                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/30">
                                          {exercise.tempsTravail}s travail
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="text-xs">
                                        {exercise.pause || exercise.tempsRepos || exercise.restTime}s repos
                                      </Badge>
                                    </div>
                                    {(exercise.consigne || exercise.instructions) && (
                                      <p className="text-sm text-gray-700 dark:text-gray-300 italic bg-blue-50 dark:bg-blue-900/30 p-2 rounded border-l-2 border-blue-200 dark:border-blue-700">
                                        💡 {exercise.consigne || exercise.instructions}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal Bilans */}
        <Dialog open={showBilansModal} onOpenChange={(open) => {
          setShowBilansModal(open);
          if (!open) {
            setSelectedBilan(null);
            setEditingBilanId(null);
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
              <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
                {selectedBilan ? (
                  <>
                    <button onClick={() => { setSelectedBilan(null); setEditingBilanId(null); }} className="hover:opacity-80 transition-opacity">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    {selectedBilan.motif || 'Bilan kinésithérapique'}
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Bilans kinésithérapiques
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            {!selectedBilan ? (
              <div className="space-y-4 pt-2">
                {loadingBilans ? (
                  <div className="text-center py-8">
                    <Loader2 className="animate-spin h-6 w-6 text-[#3899aa] mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">Chargement...</p>
                  </div>
                ) : bilans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucun bilan associé à ce patient</p>
                    <p className="text-xs mt-1">Génère un bilan depuis l'outil "Bilan Kiné" et associe-le à ce patient</p>
                  </div>
                ) : (
                  <div className="max-h-[60vh] overflow-y-auto space-y-2">
                    {bilans.map(bilan => (
                      <Card
                        key={bilan.id}
                        className="p-3 cursor-pointer transition-all duration-300 hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-[#3899aa]/5"
                        onClick={() => handleViewBilan(bilan.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">
                              {bilan.motif || 'Bilan kinésithérapique'}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(bilan.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Supprimer ce bilan ?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Cette action supprimera le bilan &quot;{bilan.motif || 'Bilan kinésithérapique'}&quot; de manière définitive.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteBilan(bilan.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Supprimer
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {/* Actions bilan */}
                <div className="flex items-center justify-end gap-2">
                  {editingBilanId === selectedBilan.id ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditingBilanId(null)} className="h-8 text-xs">
                        Annuler
                      </Button>
                      <Button size="sm" onClick={handleSaveEditBilan} className="h-8 text-xs btn-teal">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Sauvegarder
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={handleStartEditBilan} className="h-8 text-xs">
                        <Edit className="w-3 h-3 mr-1" />
                        Modifier
                      </Button>
                      <Button size="sm" onClick={() => handleDownloadBilanPDF(selectedBilan)} className="h-8 text-xs btn-teal">
                        <Download className="w-3 h-3 mr-1" />
                        PDF
                      </Button>
                    </>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  Créé le {new Date(selectedBilan.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>

                {loadingBilanDetail ? (
                  <div className="text-center py-6">
                    <Loader2 className="animate-spin h-5 w-5 text-[#3899aa] mx-auto" />
                  </div>
                ) : editingBilanId === selectedBilan.id ? (
                  <div
                    ref={editBilanRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="min-h-[200px] max-h-[50vh] overflow-y-auto text-sm leading-relaxed p-4 rounded-lg border-2 border-[#3899aa]/40 bg-white dark:bg-card focus:outline-none"
                  />
                ) : (
                  <div
                    className="text-sm leading-relaxed p-4 rounded-lg border bg-gray-50 dark:bg-gray-800/50 max-h-[50vh] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedBilan.bilanHtml) }}
                  />
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal pour afficher le lien généré avec WhatsApp */}
        <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
          <DialogContent className="w-[95vw] sm:max-w-lg top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-green-600" />
                Lien de chat généré
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
                <p className="text-sm text-green-800 dark:text-green-300 mb-3">
                  ✅ Lien sécurisé généré avec succès !
                </p>
                <p className="text-xs text-green-700 dark:text-green-400">
                  Ton patient pourra accéder à son programme personnalisé et poser ses questions via ce lien.
                </p>
              </div>
              
              {/* Section WhatsApp */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-600" />
                  <Label className="text-sm font-medium">Envoi WhatsApp</Label>
                </div>
                
                {/* Statut WhatsApp */}
                {whatsappStatus === 'idle' && patient?.phone && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                      📱 Prêt à envoyer à : <strong>{patient.phone}</strong>
                    </p>
                    <Button 
                      onClick={handleSendWhatsApp}
                      disabled={sendingWhatsApp}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {sendingWhatsApp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Envoyer sur WhatsApp
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                {whatsappStatus === 'sending' && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        Envoi du message WhatsApp en cours...
                      </p>
                    </div>
                  </div>
                )}
                
                {whatsappStatus === 'success' && (
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                        Message WhatsApp envoyé avec succès ! 📱
                      </p>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Ton patient va recevoir le lien sur WhatsApp dans quelques instants.
                    </p>
                  </div>
                )}
                
                {whatsappStatus === 'error' && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                        Erreur lors de l'envoi WhatsApp
                      </p>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-400 mb-3">
                      {whatsappError || 'Une erreur est survenue lors de l\'envoi.'}
                    </p>
                    <Button
                      onClick={handleSendWhatsApp}
                      disabled={sendingWhatsApp}
                      size="sm"
                      variant="outline"
                      className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Réessayer
                    </Button>
                  </div>
                )}
                
                {!patient?.phone && (
                  <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <p className="text-sm text-orange-800 dark:text-orange-300">
                        Numéro de téléphone manquant - WhatsApp indisponible
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Section lien manuel */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Lien à partager manuellement :</Label>
                <div className="p-2 sm:p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border text-xs sm:text-sm break-all font-mono">
                  {generatedLink}
                </div>
                <Button
                  onClick={copyLinkToClipboard}
                  variant="outline"
                  className="w-full hover:bg-gradient-to-r hover:from-[#4db3c5] hover:to-[#1f5c6a] hover:text-white hover:border-[#3899aa]/30 hover:shadow-[0_0_15px_rgba(56,153,170,0.3)]"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier le lien
                </Button>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => {
                    setShowLinkModal(false);
                    setWhatsappStatus('idle');
                    setWhatsappError(null);
                    setCurrentProgrammeId(null);
                    setGeneratedLink(null);
                  }}
                  variant="outline"
                  className="flex-1 hover:bg-gradient-to-r hover:from-[#4db3c5] hover:to-[#1f5c6a] hover:text-white hover:border-[#3899aa]/30 hover:shadow-[0_0_15px_rgba(56,153,170,0.3)]"
                >
                  Fermer
                </Button>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  🔒 <strong>Sécurité :</strong> Ce lien expire automatiquement à la fin du programme et est unique pour ce patient.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Modal programmes archivés */}
        <Dialog open={showArchivedModal} onOpenChange={(open) => {
          setShowArchivedModal(open);
          if (!open) {
            setSelectedArchivedProgramme(null);
            setArchivedSearchQuery('');
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
              <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
                {selectedArchivedProgramme ? (
                  <>
                    <button onClick={() => setSelectedArchivedProgramme(null)} className="hover:opacity-80 transition-opacity">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    {selectedArchivedProgramme.titre}
                  </>
                ) : (
                  <>
                    <Archive className="w-5 h-5" />
                    Anciens Programmes
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            {!selectedArchivedProgramme ? (
              /* === Étape 1 : Liste de sélection === */
              <div className="space-y-4 pt-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un programme..."
                    value={archivedSearchQuery}
                    onChange={(e) => setArchivedSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="max-h-[60vh] overflow-y-auto space-y-2">
                  {loadingArchived ? (
                    <div className="text-center py-8">
                      <Loader2 className="animate-spin h-6 w-6 text-[#3899aa] mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">Chargement...</p>
                    </div>
                  ) : filteredArchivedProgrammes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Archive className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{archivedSearchQuery ? 'Aucun programme trouvé' : 'Aucun ancien programme'}</p>
                    </div>
                  ) : (
                    filteredArchivedProgrammes.map(programme => (
                      <Card
                        key={programme.id}
                        className="p-3 cursor-pointer transition-all duration-300 hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-[#3899aa]/5"
                        onClick={() => setSelectedArchivedProgramme(programme)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{programme.titre}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{programme.description}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(programme.dateDebut).toLocaleDateString('fr-FR')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {programme.duree} jours
                              </span>
                              <span className="flex items-center gap-1">
                                <Dumbbell className="w-3 h-3" />
                                {programme.exercices.length} exercice{programme.exercices.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* === Étape 2 : Détail programme sélectionné === */
              (() => {
                const stats = getArchivedStats(selectedArchivedProgramme);
                const chartData = [
                  {
                    name: 'Jours validés',
                    value: stats.totalDays > 0 ? Math.round((stats.validatedDays / stats.totalDays) * 10) : 0,
                    label: `${stats.validatedDays}/${stats.totalDays}`,
                    color: '#3899aa'
                  },
                  {
                    name: 'Douleur moy.',
                    value: stats.avgPain ?? 0,
                    label: stats.avgPain !== null ? `${stats.avgPain}/10` : 'N/A',
                    color: stats.avgPain !== null && stats.avgPain >= 7 ? '#ef4444' : stats.avgPain !== null && stats.avgPain >= 4 ? '#f59e0b' : '#22c55e'
                  },
                  {
                    name: 'Difficulté moy.',
                    value: stats.avgDifficulty ?? 0,
                    label: stats.avgDifficulty !== null ? `${stats.avgDifficulty}/10` : 'N/A',
                    color: stats.avgDifficulty !== null && stats.avgDifficulty >= 7 ? '#ef4444' : stats.avgDifficulty !== null && stats.avgDifficulty >= 4 ? '#f59e0b' : '#22c55e'
                  }
                ];

                return (
                  <div className="space-y-5 pt-2">
                    {/* Graphique synthétique */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                      <h4 className="text-sm font-medium text-foreground mb-3">Synthèse du programme</h4>
                      <div className="w-full h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                            <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                            <Tooltip
                              formatter={(_: any, __: any, props: any) => [props.payload.label, props.payload.name]}
                              contentStyle={{ borderRadius: '8px', fontSize: '13px' }}
                            />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                              {chartData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-6 mt-2">
                        {chartData.map((item, i) => (
                          <div key={i} className="text-center">
                            <p className="text-lg font-bold" style={{ color: item.color }}>{item.label}</p>
                            <p className="text-[10px] text-muted-foreground">{item.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Liste exercices */}
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                        <Dumbbell className="w-4 h-4 text-[#3899aa]" />
                        Exercices ({selectedArchivedProgramme.exercices.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedArchivedProgramme.exercices.map((ex) => (
                          <div key={ex.id} className="bg-white dark:bg-gray-800 border rounded-lg p-3">
                            <p className="font-medium text-sm">{ex.exerciceModele.nom}</p>
                            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span>{ex.series} séries</span>
                              <span>{ex.repetitions} reps</span>
                              <span>{ex.pause}s repos</span>
                              {ex.tempsTravail && ex.tempsTravail > 0 && <span>{ex.tempsTravail}s travail</span>}
                            </div>
                            {ex.consigne && (
                              <p className="text-xs text-muted-foreground mt-1 italic">{ex.consigne}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}