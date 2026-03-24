'use client';

import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import AppLayout from '@/components/AppLayout';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileText, FilePlus2, Loader2, Copy, Sparkles, Mail, Download, Lock, Lightbulb, ArrowLeft, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { PaywallModal } from '@/components/PaywallModal';
import { usePaywall } from '@/hooks/usePaywall';
import { useToast } from '@/hooks/use-toast';

export default function BilanKinePage() {
  const [rawNotes, setRawNotes] = useState('');
  const [motifConsultation, setMotifConsultation] = useState('');
  const [structuredBilan, setStructuredBilan] = useState('');
  const [bilanHtml, setBilanHtml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewResult, setIsPreviewResult] = useState(false);
  const [showBilan, setShowBilan] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [kineProfile, setKineProfile] = useState<{ firstName: string; lastName: string; adresseCabinet?: string; rpps?: string } | null>(null);
  const bilanRef = useRef<HTMLDivElement>(null);

  // Injecter le HTML dans le div contentEditable sans que React ne contrôle le contenu
  useEffect(() => {
    if (bilanRef.current && bilanHtml) {
      bilanRef.current.innerHTML = bilanHtml;
    }
  }, [bilanHtml]);

  const { subscription } = usePaywall();
  const { toast } = useToast();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  const getAuthToken = async () => {
    const auth = getAuth(app);
    return await auth.currentUser?.getIdToken();
  };

  // Charger le profil kiné au montage
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/kine/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setKineProfile(data);
        }
      } catch (error) {
        console.error('Erreur chargement profil kiné:', error);
      }
    };
    fetchProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateBilan = async () => {
    if (!rawNotes.trim()) {
      toast({
        title: "Notes vides",
        description: "Veuillez entrer vos notes cliniques avant de générer le bilan",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/chat/kine/ia-administrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: motifConsultation.trim()
            ? `MOTIF DE CONSULTATION : ${motifConsultation}\n\nNOTES CLINIQUES :\n${rawNotes}`
            : rawNotes,
          conversationHistory: []
        })
      });

      const data = await res.json();

      if (data.success) {
        setStructuredBilan(data.message);
        setBilanHtml(renderMarkdown(data.message));
        setIsPreviewResult(data.preview === true);
        setShowBilan(true);
      } else {
        toast({
          title: "Erreur",
          description: data.error || 'Erreur lors de la génération du bilan',
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Erreur génération bilan:', error);
      toast({
        title: "Erreur technique",
        description: 'Une erreur est survenue lors de la génération',
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBackToNotes = () => {
    setShowBilan(false);
  };

  // Récupère le texte visible du bilan (sans balises HTML)
  const getBilanText = () => {
    if (bilanRef.current) {
      return bilanRef.current.innerText;
    }
    return structuredBilan;
  };

  // Récupère le HTML édité du bilan, sanitizé
  const getBilanHtml = () => {
    if (bilanRef.current) {
      return DOMPurify.sanitize(bilanRef.current.innerHTML);
    }
    return bilanHtml;
  };

  const handleCopyBilan = async () => {
    if (!structuredBilan) return;

    try {
      await navigator.clipboard.writeText(getBilanText());
      toast({
        title: "Copié !",
        description: "Le bilan a été copié dans le presse-papiers",
        variant: "default",
      });
    } catch (error) {
      console.error('Erreur copie:', error);
      toast({
        title: "Erreur",
        description: 'Impossible de copier le bilan',
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = () => {
    if (!structuredBilan) return;

    try {
      const subject = encodeURIComponent('Bilan Kinésithérapique');
      const body = encodeURIComponent(getBilanText());
      const mailto = `mailto:?subject=${subject}&body=${body}`;

      window.location.href = mailto;
    } catch (error) {
      console.error('Erreur ouverture client mail:', error);
      toast({
        title: "Erreur",
        description: 'Erreur lors de l\'ouverture du client mail',
        variant: "destructive",
      });
    }
  };

  const handleDownloadPDF = () => {
    if (!structuredBilan) return;

    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({
          title: "Erreur",
          description: 'Veuillez autoriser les fenêtres pop-up pour télécharger le PDF',
          variant: "destructive",
        });
        return;
      }

      const formattedHTML = getBilanHtml();

      // En-tête praticien conditionnel
      const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const logoUrl = `${window.location.origin}/logo.png`;

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

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Bilan Kinésithérapique</title>
            <style>
              @page {
                margin: 2cm;
                size: A4;
              }
              body {
                font-family: 'Times New Roman', serif;
                font-size: 12pt;
                line-height: 1.6;
                color: #000;
                max-width: 21cm;
                margin: 0 auto;
                padding: 1cm;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 0.5em;
              }
              .header-left {
                font-size: 11pt;
                line-height: 1.4;
              }
              .header-name {
                font-weight: bold;
                font-size: 13pt;
              }
              .header-right {
                display: flex;
                align-items: center;
                gap: 10px;
              }
              .header-logo {
                width: 40px;
                height: 40px;
                border-radius: 8px;
                object-fit: cover;
              }
              .header-app-name {
                font-family: Arial, Helvetica, sans-serif;
                font-size: 12pt;
                font-weight: bold;
                color: #3899aa;
              }
              .header-separator {
                height: 3px;
                background: linear-gradient(to right, #4db3c5, #1f5c6a);
                border: none;
                border-radius: 2px;
                margin: 0.6em 0 1.2em 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              h1, h2, h3 {
                font-weight: bold;
                margin-top: 1em;
                margin-bottom: 0.5em;
              }
              .bilan-date {
                text-align: right;
                font-size: 10pt;
                color: #555;
                font-family: Arial, Helvetica, sans-serif;
                margin-bottom: -0.5em;
              }
              h1 { font-size: 16pt; text-align: center; }
              h2 { font-size: 14pt; }
              h3 { font-size: 12pt; }
              p, li {
                margin-bottom: 0.5em;
                text-align: justify;
              }
              strong { font-weight: bold; }
              u { text-decoration: underline; font-weight: 600; }
              em { font-style: italic; }
              hr {
                border: none;
                border-top: 1px solid #000;
                margin: 1em 0;
              }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            ${headerHTML}
            <div class="bilan-date">Le ${today}</div>
            ${formattedHTML}
          </body>
        </html>
      `);

      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);

    } catch (error) {
      console.error('Erreur génération PDF:', error);
      toast({
        title: "Erreur",
        description: 'Erreur lors de la génération du PDF',
        variant: "destructive",
      });
    }
  };

  const placeholderText = `Notez vos observations en vrac...

Ex : patient 52 ans, maçon, lombalgie chronique depuis 3 mois suite port de charge. ATCD : hernie discale L4-L5 opérée 2018. Douleur bas du dos irradiant fesse droite, EVA 5/10 repos 7/10 effort. Flexion lombaire limitée 40°, Lasègue négatif, paravertébraux contracturés...`;

  // Fonction pour convertir le markdown/HTML en HTML sécurisé
  const renderMarkdown = (text: string) => {
    const html = text
      .replace(/═+/g, '<hr class="my-2 border-gray-300" />')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
      .replace(/\n/g, '<br>');
    return DOMPurify.sanitize(html);
  };

  return (
    <AppLayout>
      {/* Header compact */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/40">
        <FileText className="text-[#3899aa] h-4 w-4 shrink-0" />
        <h2 className="text-sm font-medium text-[#3899aa]">Bilan Kiné</h2>
        <div className="relative group">
          <div className="flex items-center gap-1.5 bg-[#3899aa]/10 rounded-full px-2.5 py-0.5 cursor-default">
            <Lightbulb className="w-3 h-3 text-[#3899aa]" />
            <span className="text-xs text-foreground font-medium">Conseils</span>
          </div>
          <div className="absolute left-0 top-full mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="text-xs text-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground mb-2">Transformez vos notes en bilan structuré :</p>
                <ul className="space-y-1 pl-2">
                  <li>&bull; Notez vos observations sans vous soucier de la structure</li>
                  <li>&bull; Incluez : anamnèse, tests, mesures, observations</li>
                  <li>&bull; Plus vos notes sont détaillées, meilleur sera le bilan</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">Envoi :</p>
                <p className="text-xs">Utilisez votre messagerie cryptée pour transmettre votre bilan au médecin</p>
              </div>
            </div>
          </div>
        </div>
        <Button
          onClick={() => {
            setRawNotes('');
            setMotifConsultation('');
            setStructuredBilan('');
            setBilanHtml('');
            setShowBilan(false);
            setIsPreviewResult(false);
            if (bilanRef.current) bilanRef.current.innerHTML = '';
          }}
          disabled={isGenerating}
          size="sm"
          className="h-7 px-3 text-xs btn-teal rounded-full"
        >
          <FilePlus2 className="h-3 w-3 mr-1.5" />
          Nouveau Bilan
        </Button>
      </div>

      {/* Zone centrale unique */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 sm:p-6">

        {/* Vue Notes */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${showBilan ? 'opacity-0 absolute pointer-events-none' : 'opacity-100'}`}>
          {/* Motif de consultation */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <Search className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
            <span className="text-xs font-medium text-[#3899aa] shrink-0">Motif</span>
            <Input
              value={motifConsultation}
              onChange={(e) => setMotifConsultation(e.target.value)}
              placeholder="Ex : Lombalgie chronique, rééducation post-opératoire..."
              className="border-0 border-b border-border/60 rounded-none bg-transparent text-sm h-8 px-2 focus-visible:ring-0 focus-visible:border-[#3899aa]/60"
              disabled={isGenerating}
            />
          </div>

          <Textarea
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            placeholder={placeholderText}
            className="flex-1 min-h-[300px] sm:min-h-[400px] text-sm leading-relaxed text-foreground resize-none rounded-xl border-2 border-border/60 bg-white dark:bg-card p-4 focus-visible:ring-[#3899aa]/50 focus-visible:border-[#3899aa]/60 transition-all"
            disabled={isGenerating}
          />

          <div className="flex flex-col items-end gap-1 mt-3">
            <Button
              onClick={handleGenerateBilan}
              disabled={isGenerating || !rawNotes.trim()}
              className="btn-teal rounded-full px-6 h-10"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Générer le bilan
                </>
              )}
            </Button>
            <p className="text-[11px] text-red-400">L&apos;IA peut faire des erreurs. Vérifiez les informations importantes.</p>
          </div>
        </div>

        {/* Vue Bilan */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${showBilan ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}`}>
          {/* Barre d'actions */}
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToNotes}
              className="text-muted-foreground hover:text-foreground h-8 px-3"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Revenir aux notes
            </Button>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCopyBilan} className="btn-teal h-8 rounded-full px-3">
                <Copy className="h-3 w-3 sm:mr-1.5" />
                <span className="hidden sm:inline">Copier</span>
              </Button>
              <Button size="sm" onClick={handleSendEmail} className="btn-teal h-8 rounded-full px-3">
                <Mail className="h-3 w-3 sm:mr-1.5" />
                <span className="hidden sm:inline">Mail</span>
              </Button>
              <Button size="sm" onClick={handleDownloadPDF} className="btn-teal h-8 rounded-full px-3">
                <Download className="h-3 w-3 sm:mr-1.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </div>
          </div>

          {/* Bilan contentEditable */}
          <div className="relative flex-1">
            <div
              ref={bilanRef}
              contentEditable={!isPreviewResult}
              suppressContentEditableWarning
              className="min-h-[300px] sm:min-h-[400px] overflow-y-auto text-sm leading-relaxed text-foreground p-4 rounded-xl border-2 border-border/60 bg-white dark:bg-card focus:outline-none focus:border-[#3899aa]/60 transition-all"
              style={isPreviewResult ? {
                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
              } : undefined}
            />
            {isPreviewResult && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <Button
                  onClick={() => setIsPaywallOpen(true)}
                  className="btn-teal rounded-full text-sm h-9 px-4 shadow-lg"
                >
                  <Lock className="h-3.5 w-3.5 mr-2" />
                  Débloquer le bilan complet
                </Button>
              </div>
            )}
          </div>

          {!isPreviewResult && (
            <p className="text-[11px] text-muted-foreground mt-2 text-right">
              Vous pouvez modifier le bilan directement avant export
            </p>
          )}
        </div>

      </div>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        subscription={subscription}
      />
    </AppLayout>
  );
}
