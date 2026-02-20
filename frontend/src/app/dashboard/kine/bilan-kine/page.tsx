'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, CheckCircle, Copy, Sparkles, Mail, Download, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { ChatUpgradeHeader, ChatDisabledOverlay } from '@/components/ChatUpgradeHeader';
import { usePaywall } from '@/hooks/usePaywall';
import { useToast } from '@/hooks/use-toast';

export default function BilanKinePage() {
  const [rawNotes, setRawNotes] = useState('');
  const [motifConsultation, setMotifConsultation] = useState('');
  const [structuredBilan, setStructuredBilan] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Hook paywall pour vérifier les permissions
  const { isLoading: paywallLoading, canAccessFeature, subscription } = usePaywall();

  // Hook toast pour les notifications
  const { toast } = useToast();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  const getAuthToken = async () => {
    const auth = getAuth(app);
    return await auth.currentUser?.getIdToken();
  };

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
      } else {
        toast({
          title: "❌ Erreur",
          description: data.error || 'Erreur lors de la génération du bilan',
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Erreur génération bilan:', error);
      toast({
        title: "❌ Erreur technique",
        description: 'Une erreur est survenue lors de la génération',
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyBilan = async () => {
    if (!structuredBilan) return;

    try {
      await navigator.clipboard.writeText(structuredBilan);
      toast({
        title: "📋 Copié !",
        description: "Le bilan a été copié dans le presse-papiers",
        variant: "default",
      });
    } catch (error) {
      console.error('Erreur copie:', error);
      toast({
        title: "❌ Erreur",
        description: 'Impossible de copier le bilan',
        variant: "destructive",
      });
    }
  };


  const handleSendEmail = () => {
    if (!structuredBilan) return;

    try {
      // Créer le lien mailto avec le bilan dans le corps
      const subject = encodeURIComponent('Bilan Kinésithérapique');
      const body = encodeURIComponent(structuredBilan);
      const mailto = `mailto:?subject=${subject}&body=${body}`;

      window.location.href = mailto;

      toast({
        title: "✉️ Client mail ouvert",
        description: "Le bilan a été pré-rempli dans votre client mail",
        variant: "default",
        duration: 4000,
      });
    } catch (error) {
      console.error('Erreur ouverture client mail:', error);
      toast({
        title: "❌ Erreur",
        description: 'Erreur lors de l\'ouverture du client mail',
        variant: "destructive",
      });
    }
  };

  const handleDownloadPDF = () => {
    if (!structuredBilan) return;

    try {
      // Créer une fenêtre d'impression avec le bilan formaté
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({
          title: "❌ Erreur",
          description: 'Veuillez autoriser les fenêtres pop-up pour télécharger le PDF',
          variant: "destructive",
        });
        return;
      }

      // Convertir le markdown en HTML formaté pour l'impression
      const formattedHTML = renderMarkdown(structuredBilan);

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
              h1, h2, h3 {
                font-weight: bold;
                margin-top: 1em;
                margin-bottom: 0.5em;
              }
              h1 { font-size: 16pt; text-align: center; }
              h2 { font-size: 14pt; }
              h3 { font-size: 12pt; }
              p, li {
                margin-bottom: 0.5em;
                text-align: justify;
              }
              strong {
                font-weight: bold;
              }
              em {
                font-style: italic;
              }
              hr {
                border: none;
                border-top: 1px solid #000;
                margin: 1em 0;
              }
              @media print {
                body {
                  padding: 0;
                }
              }
            </style>
          </head>
          <body>
            ${formattedHTML}
          </body>
        </html>
      `);

      printWindow.document.close();

      // Attendre que le contenu soit chargé puis ouvrir la boîte de dialogue d'impression
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);

    } catch (error) {
      console.error('Erreur génération PDF:', error);
      toast({
        title: "❌ Erreur",
        description: 'Erreur lors de la génération du PDF',
        variant: "destructive",
      });
    }
  };

  const placeholderText = `Exemple de notes en vrac :

patient 52 ans, maçon, lombalgie chronique depuis 3 mois suite port de charge. ATCD : hernie discale L4-L5 opérée 2018. Douleur bas du dos irradiant fesse droite, EVA 5/10 repos 7/10 effort. Flexion lombaire limitée 40°, Lasègue négatif, paravertébraux contracturés. Difficulté à se pencher, ne peut plus porter charges >10kg. Objectif : retour au travail. Traitement prévu : massages décontracturants, McKenzie, renforcement, 2x/semaine 6 semaines.`;

  // Fonction pour convertir le markdown en HTML
  const renderMarkdown = (text: string) => {
    return text
      .replace(/═+/g, '<hr class="my-2 border-gray-300" />')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
      .replace(/\n/g, '<br>');
  };

  // Attendre la fin du chargement des permissions avant d'afficher la page
  if (paywallLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Vérification de vos permissions...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 overflow-hidden">

        {/* Header Upgrade si pas d'accès */}
        <ChatUpgradeHeader
          assistantType="ADMINISTRATIF"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        />

        {/* Header */}
        <div className="card-hover rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="text-[#3899aa] h-7 w-7 shrink-0" />
              <div>
                <h2 className="text-xl font-semibold text-[#3899aa]">Bilan Kiné</h2>
                <p className="text-foreground text-sm">Transformez vos notes cliniques en vrac en un bilan structuré professionnel</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#3899aa]/10 rounded-full px-3 py-1 self-start sm:self-auto">
              <CheckCircle className="w-4 h-4 text-[#3899aa]" />
              <span className="text-sm text-foreground font-medium">IA Active</span>
            </div>
          </div>
        </div>

        {/* Zone principale */}
        <ChatDisabledOverlay
          assistantType="ADMINISTRATIF"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        >
          {/* Ligne Motif + Conseils */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Motif de consultation */}
            <div className="card-hover flex items-stretch h-full px-5 py-3 bg-gradient-to-r from-[#eef7f6] to-[#e4f1f3] dark:from-[#0f1c1b] dark:to-[#132221] rounded-lg">
              <div className="flex items-center gap-3 w-full">
                <Search className="h-4 w-4 text-[#3899aa] shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#3899aa] mb-1">Motif de consultation</p>
                  <Input
                    value={motifConsultation}
                    onChange={(e) => setMotifConsultation(e.target.value)}
                    placeholder="Ex : Lombalgie chronique, rééducation post-opératoire..."
                    className="border-0 bg-white/60 dark:bg-gray-800/60 text-sm h-9 focus-visible:ring-[#3899aa]"
                    disabled={isGenerating}
                  />
                </div>
              </div>
            </div>

            {/* Conseils */}
            <div className="card-hover text-xs rounded-lg p-4">
              <p className="font-medium text-[#3899aa] mb-1">💡 Conseils :</p>
              <ul className="space-y-1 text-foreground">
                <li>• Notez vos observations sans vous soucier de la structure</li>
                <li>• Incluez : anamnèse, tests, mesures, observations</li>
                <li>• L'IA organisera tout selon la structure professionnelle</li>
                <li>• Plus vos notes sont détaillées, meilleur sera le bilan</li>
                <li>• Utilisez votre messagerie cryptée pour transmettre votre bilan au médecin</li>
              </ul>
            </div>
          </div>

          {/* Grille Notes + Bilan */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Colonne gauche: Saisie des notes */}
            <div>
              <Card className="card-hover h-full">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                    <Sparkles className="h-5 w-5 text-[#3899aa]" />
                    Notes cliniques en vrac
                  </CardTitle>
                  <CardDescription className="text-foreground">
                    Entrez vos observations, mesures, tests... L'IA structurera le tout
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                  <Textarea
                    value={rawNotes}
                    onChange={(e) => setRawNotes(e.target.value)}
                    placeholder={placeholderText}
                    className="bubble-ai min-h-[250px] sm:min-h-[500px] font-mono text-sm text-foreground"
                    disabled={isGenerating}
                  />

                  <div className="flex justify-end">
                    <Button
                      onClick={handleGenerateBilan}
                      disabled={isGenerating || !rawNotes.trim()}
                      size="lg"
                      className="btn-teal w-full sm:w-auto"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Génération en cours...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Générer le bilan structuré
                        </>
                      )}
                    </Button>
                  </div>

                </CardContent>
              </Card>
            </div>

            {/* Colonne droite: Résultat structuré */}
            <div>
              <Card className="card-hover h-full">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 text-foreground">
                      <FileText className="h-5 w-5 text-[#3899aa]" />
                      Bilan structuré
                    </div>
                    {structuredBilan && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={handleCopyBilan}
                          className="btn-teal h-8"
                        >
                          <Copy className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Copier</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSendEmail}
                          className="btn-teal h-8"
                        >
                          <Mail className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Envoyer par mail</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleDownloadPDF}
                          className="btn-teal h-8"
                        >
                          <Download className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Télécharger PDF</span>
                        </Button>
                      </div>
                    )}
                  </CardTitle>
                  <CardDescription className="text-foreground">
                    Votre bilan professionnel prêt à l'emploi
                  </CardDescription>
                </CardHeader>
                <CardContent>

                  {!structuredBilan ? (
                    <div className="flex items-center justify-center min-h-[200px] sm:min-h-[500px] text-center">
                      <div>
                        <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                        <p className="text-muted-foreground mb-2">
                          Votre bilan structuré apparaîtra ici
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Entrez vos notes et cliquez sur "Générer"
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Bilan éditable */}
                      <Textarea
                        value={structuredBilan}
                        onChange={(e) => setStructuredBilan(e.target.value)}
                        className="bubble-ai min-h-[250px] sm:min-h-[500px] max-h-[400px] sm:max-h-[600px] text-sm leading-relaxed text-foreground"
                        placeholder="Le bilan structuré apparaîtra ici..."
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Vous pouvez modifier le bilan directement avant de l'envoyer ou le télécharger
                      </p>
                    </div>
                  )}

                </CardContent>
              </Card>
            </div>

          </div>
        </ChatDisabledOverlay>

        {/* Avertissement */}
        <div className="mt-6">
          <Card className="bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700">
            <CardContent className="p-4">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                ⚠️ L'IA peut faire des erreurs. Vérifiez et complétez le bilan avant utilisation. Ce bilan est généré automatiquement et doit être relu par le kinésithérapeute.
              </p>
            </CardContent>
          </Card>
        </div>

      </div>
    </AppLayout>
  );
}
