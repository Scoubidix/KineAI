'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Search, Loader2, CheckCircle, Mail, MessageSquare, AlertCircle, User } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { ChatUpgradeHeader, ChatDisabledOverlay } from '@/components/ChatUpgradeHeader';
import { usePaywall } from '@/hooks/usePaywall';
import { useToast } from '@/hooks/use-toast';

interface Template {
  id: number;
  title: string;
  category: string;
  subject: string | null;
  body: string;
  tags: string[];
  usageCount: number;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  emailConsent: boolean;
  whatsappConsent: boolean;
}

interface PersonalizedTemplate {
  template: {
    id: number;
    title: string;
    category: string;
    originalBody: string;
    originalSubject: string | null;
  };
  personalizedBody: string;
  personalizedSubject: string;
  autoFilledVariables: Array<{ variable: string; value: string; replaced: boolean }>;
  remainingVariables: string[];
  patient: Patient;
}

export default function KineChatbotAdminPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [personalizedData, setPersonalizedData] = useState<PersonalizedTemplate | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Hook paywall pour vérifier les permissions
  const { isLoading: paywallLoading, canAccessFeature, subscription } = usePaywall();

  // Hook toast pour les notifications
  const { toast } = useToast();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await loadData();
      } else {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [searchQuery, selectedCategory, templates]);

  useEffect(() => {
    filterPatients();
  }, [patientSearch, patients]);

  const getAuthToken = async () => {
    const auth = getAuth(app);
    return await auth.currentUser?.getIdToken();
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const token = await getAuthToken();
      const auth = getAuth(app);
      const user = auth.currentUser;

      if (!user) {
        console.error('Utilisateur non authentifié');
        return;
      }

      // Charger les templates
      const templatesRes = await fetch(`${API_BASE}/api/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const templatesData = await templatesRes.json();
      if (templatesData.success) {
        setTemplates(templatesData.templates);
      }

      // Charger les catégories
      const categoriesRes = await fetch(`${API_BASE}/api/templates/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const categoriesData = await categoriesRes.json();
      if (categoriesData.success) {
        setCategories(categoriesData.categories);
      }

      // Charger les patients (même route que la page patients)
      const patientsRes = await fetch(`${API_BASE}/patients/kine/${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (patientsRes.ok) {
        const patientsData = await patientsRes.json();
        setPatients(patientsData);
        setFilteredPatients(patientsData);
      }

    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterTemplates = () => {
    let filtered = templates;

    // Filtrer par catégorie
    if (selectedCategory) {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }

    // Filtrer par recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.body.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredTemplates(filtered);
  };

  const filterPatients = () => {
    if (!patientSearch.trim()) {
      setFilteredPatients(patients);
      return;
    }

    const query = patientSearch.toLowerCase();
    const filtered = patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(query) ||
      p.email.toLowerCase().includes(query) ||
      (p.phone && p.phone.includes(query))
    );

    setFilteredPatients(filtered);
  };

  const handleTemplateSelect = async (template: Template) => {
    setSelectedTemplate(template);
    setPersonalizedData(null);

    // Si un patient est déjà sélectionné, personnaliser automatiquement
    if (selectedPatient) {
      await personalizeTemplate(template.id, selectedPatient.id);
    } else {
      // Initialiser avec le template brut
      setEditedSubject(template.subject || '');
      setEditedBody(template.body);
    }
  };

  const handlePatientSelect = async (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientSearch(''); // Réinitialiser la recherche
    setFilteredPatients(patients); // Réafficher tous les patients

    // Si un template est déjà sélectionné, personnaliser automatiquement
    if (selectedTemplate) {
      await personalizeTemplate(selectedTemplate.id, patient.id);
    }
  };

  const personalizeTemplate = async (templateId: number, patientId: number) => {
    try {
      setIsPersonalizing(true);
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/templates/personalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ templateId, patientId })
      });

      const data = await res.json();

      if (data.success) {
        setPersonalizedData(data);
        setEditedSubject(data.personalizedSubject || '');
        setEditedBody(data.personalizedBody);
      } else {
        alert('Erreur lors de la personnalisation du template');
      }

    } catch (error) {
      console.error('Erreur personnalisation:', error);
      alert('Erreur lors de la personnalisation du template');
    } finally {
      setIsPersonalizing(false);
    }
  };

  const highlightVariables = (text: string) => {
    if (!text) return text;

    // Remplacer les variables [xxx] par du texte surligné en jaune
    return text.replace(/\[([^\]]+)\]/g, '<mark class="bg-yellow-300 text-black px-1 rounded">[$1]</mark>');
  };

  const canSendWhatsApp = () => {
    if (!selectedTemplate || !selectedPatient) return false;

    // WhatsApp uniquement pour "Communications Patients"
    if (selectedTemplate.category !== 'Communications Patients') return false;

    // Patient doit avoir donné son consentement WhatsApp
    return selectedPatient.whatsappConsent && selectedPatient.phone;
  };

  const canSendEmail = () => {
    // Si "Communications Patients" → patient obligatoire
    if (selectedTemplate?.category === 'Communications Patients') {
      if (!selectedPatient) return false;
      return selectedPatient.emailConsent && selectedPatient.email;
    }

    // Autres templates → email toujours possible
    return true;
  };

  const handleSendEmail = async () => {
    if (!selectedTemplate) return;

    if (!canSendEmail()) {
      toast({
        title: "Envoi email impossible",
        description: "Le patient n'a pas donné son consentement pour les emails ou n'a pas d'email renseigné",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSending(true);

      // CAS 1: Envoi avec patient (personnalisé)
      if (selectedPatient && personalizedData) {
        // Créer le lien mailto: avec les champs pré-remplis
        const mailto = `mailto:${encodeURIComponent(selectedPatient.email)}?subject=${encodeURIComponent(editedSubject)}&body=${encodeURIComponent(editedBody)}`;
        window.location.href = mailto;

        // Sauvegarder dans l'historique
        const token = await getAuthToken();
        await fetch(`${API_BASE}/api/templates/history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            patientId: selectedPatient.id,
            templateId: selectedTemplate.id,
            templateTitle: selectedTemplate.title,
            subject: editedSubject,
            body: editedBody,
            method: 'EMAIL'
          })
        });

        toast({
          title: "✉️ Client mail ouvert",
          description: `Email pré-rempli pour ${selectedPatient.firstName} ${selectedPatient.lastName}`,
          variant: "default",
          duration: 4000,
        });
      }
      // CAS 2: Envoi sans patient (template générique)
      else {
        const mailto = `mailto:?subject=${encodeURIComponent(editedSubject)}&body=${encodeURIComponent(editedBody)}`;
        window.location.href = mailto;

        toast({
          title: "✉️ Client mail ouvert",
          description: "Template générique prêt à être envoyé",
          variant: "default",
          duration: 4000,
        });
      }

      // Réinitialiser après un court délai
      setTimeout(() => {
        setSelectedTemplate(null);
        setSelectedPatient(null);
        setPersonalizedData(null);
        setEditedSubject('');
        setEditedBody('');
      }, 500);

    } catch (error) {
      console.error('Erreur ouverture client mail:', error);
      toast({
        title: "❌ Erreur",
        description: 'Erreur lors de l\'ouverture du client mail',
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedTemplate || !selectedPatient || !personalizedData) {
      toast({
        title: "Sélection incomplète",
        description: "Veuillez sélectionner un template et un patient",
        variant: "destructive",
      });
      return;
    }

    if (!canSendWhatsApp()) {
      toast({
        title: "Envoi WhatsApp impossible",
        description: "Le patient n'a pas donné son consentement WhatsApp, n'a pas de téléphone renseigné, ou le template n'est pas dans la catégorie \"Communications Patients\"",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSending(true);
      const token = await getAuthToken();

      // Envoyer via WhatsApp Business API
      const res = await fetch(`${API_BASE}/api/templates/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          templateId: selectedTemplate.id,
          templateTitle: selectedTemplate.title,
          subject: editedSubject,
          body: editedBody
        })
      });

      const data = await res.json();

      // Gestion des erreurs de rate limiting (429)
      if (res.status === 429) {
        const retryMinutes = data.retryAfter ? Math.ceil(data.retryAfter / 60) : 60;
        toast({
          title: "⏱️ Limite d'envoi atteinte",
          description: data.details || `Vous avez atteint la limite d'envoi WhatsApp. Veuillez patienter ${retryMinutes} minutes avant de réessayer.`,
          variant: "destructive",
          duration: 8000, // 8 secondes pour laisser le temps de lire
        });
        return;
      }

      if (data.success) {
        toast({
          title: "✅ Message envoyé !",
          description: `Message WhatsApp envoyé avec succès à ${selectedPatient.firstName} ${selectedPatient.lastName}`,
          variant: "default",
          duration: 5000,
        });

        // Réinitialiser le formulaire
        setSelectedTemplate(null);
        setSelectedPatient(null);
        setPersonalizedData(null);
        setEditedSubject('');
        setEditedBody('');
      } else {
        toast({
          title: "❌ Erreur d'envoi",
          description: data.error || 'Erreur lors de l\'envoi WhatsApp',
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Erreur envoi WhatsApp:', error);
      toast({
        title: "❌ Erreur technique",
        description: 'Une erreur est survenue lors de l\'envoi WhatsApp',
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Attendre la fin du chargement des permissions avant d'afficher la page
  if (paywallLoading || isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">
              {paywallLoading ? 'Vérification de vos permissions...' : 'Chargement des templates...'}
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4">

        {/* Header Upgrade si pas d'accès */}
        <ChatUpgradeHeader
          assistantType="TEMPLATES_ADMIN"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        />

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-white h-7 w-7" />
              <div>
                <h2 className="text-xl font-semibold text-white">IA Administrative</h2>
                <p className="text-blue-100 text-sm">Sélectionnez un template, choisissez un patient, personnalisez et envoyez par email ou WhatsApp</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <CheckCircle className="w-4 h-4 text-green-300" />
              <span className="text-sm text-white font-medium">Système actif</span>
            </div>
          </div>
        </div>

        {/* Zone principale */}
        <ChatDisabledOverlay
          assistantType="TEMPLATES_ADMIN"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Sidebar gauche: Patient + Templates */}
            <div className="lg:col-span-1 space-y-4">

              {/* Recherche patient - EN HAUT */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Sélectionner un patient
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Patient sélectionné */}
                  {selectedPatient ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-primary/10 border border-primary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-sm">
                            {selectedPatient.firstName} {selectedPatient.lastName}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedPatient(null);
                              setPersonalizedData(null);
                              setEditedSubject('');
                              setEditedBody('');
                            }}
                            className="h-6 px-2 text-xs"
                          >
                            Changer
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{selectedPatient.email}</p>

                        {/* Consentements */}
                        <div className="flex items-center gap-2">
                          {selectedPatient.emailConsent ? (
                            <Badge variant="default" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />
                              Email OK
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />
                              Email refusé
                            </Badge>
                          )}
                          {selectedPatient.whatsappConsent ? (
                            <Badge variant="default" className="text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              WhatsApp OK
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              WhatsApp refusé
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Barre de recherche */}
                      <Input
                        placeholder="Rechercher un patient (nom, email, téléphone)..."
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="w-full"
                      />

                      {/* Liste des résultats filtrés */}
                      {patientSearch && (
                        <div className="max-h-[250px] overflow-y-auto space-y-1 border rounded-md p-2 bg-background">
                          {filteredPatients.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-3">
                              Aucun patient trouvé
                            </p>
                          ) : (
                            filteredPatients.map(patient => (
                              <div
                                key={patient.id}
                                className="p-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                                onClick={() => handlePatientSelect(patient)}
                              >
                                <p className="font-medium text-sm">
                                  {patient.firstName} {patient.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground">{patient.email}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Recherche et filtres */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Rechercher un template
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Rechercher..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />

                  {/* Filtres par catégorie */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Catégories</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={selectedCategory === '' ? 'default' : 'outline'}
                        className="cursor-pointer hover:bg-primary/80"
                        onClick={() => setSelectedCategory('')}
                      >
                        Toutes ({templates.length})
                      </Badge>
                      {categories.map(cat => (
                        <Badge
                          key={cat.name}
                          variant={selectedCategory === cat.name ? 'default' : 'outline'}
                          className="cursor-pointer hover:bg-primary/80"
                          onClick={() => setSelectedCategory(cat.name)}
                        >
                          {cat.name} ({cat.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Liste des templates - HAUTEUR OPTIMISÉE */}
              <Card className="shadow-sm flex-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Templates ({filteredTemplates.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[calc(100vh-600px)] min-h-[300px] overflow-y-auto space-y-2">
                  {filteredTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun template trouvé
                    </p>
                  ) : (
                    filteredTemplates.map(template => (
                      <div
                        key={template.id}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedTemplate?.id === template.id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-muted border-border'
                        }`}
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <p className="font-medium text-sm mb-1">{template.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {template.category}
                          </Badge>
                          {template.usageCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {template.usageCount}x
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Zone principale: Aperçu et édition */}
            <div className="lg:col-span-2">
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {selectedTemplate ? selectedTemplate.title : 'Sélectionnez un template'}
                  </CardTitle>
                  {selectedTemplate && (
                    <CardDescription>
                      Catégorie: {selectedTemplate.category}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">

                  {!selectedTemplate ? (
                    <div className="flex items-center justify-center h-[50vh] text-center">
                      <div>
                        <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">
                          Sélectionnez un template à gauche
                        </p>
                      </div>
                    </div>
                  ) : !selectedPatient ? (
                    <>
                      {/* Alerte template non personnalisé */}
                      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-blue-800">
                            Template générique (non personnalisé)
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            Vous pouvez modifier et envoyer ce template. Pour personnaliser les variables [...], sélectionnez un patient.
                          </p>
                        </div>
                      </div>

                      {/* Objet éditable */}
                      {editedSubject && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Objet</label>
                          <Input
                            value={editedSubject}
                            onChange={(e) => setEditedSubject(e.target.value)}
                            className="w-full"
                            placeholder="Objet du message"
                          />
                        </div>
                      )}

                      {/* Corps du message éditable */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Message</label>

                        {/* Aperçu avec variables surlignées */}
                        <div
                          className="p-4 bg-muted rounded-lg border text-sm whitespace-pre-wrap mb-2"
                          dangerouslySetInnerHTML={{ __html: highlightVariables(editedBody) }}
                        />

                        {/* Zone d'édition */}
                        <Textarea
                          value={editedBody}
                          onChange={(e) => setEditedBody(e.target.value)}
                          className="min-h-[300px] font-mono text-sm"
                          placeholder="Personnalisez le message..."
                        />
                      </div>

                      {/* Boutons d'envoi */}
                      <div className="flex items-center gap-3 pt-4 border-t">
                        <Button
                          onClick={handleSendEmail}
                          disabled={!canSendEmail() || isSending}
                          className="flex-1"
                          variant={canSendEmail() ? 'default' : 'secondary'}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Envoi...
                            </>
                          ) : (
                            <>
                              <Mail className="h-4 w-4 mr-2" />
                              Envoyer par Email
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={handleSendWhatsApp}
                          disabled={!canSendWhatsApp() || isSending}
                          className="flex-1"
                          variant={canSendWhatsApp() ? 'default' : 'secondary'}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Envoi...
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Envoyer par WhatsApp
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Message pour "Communications Patients" */}
                      {selectedTemplate.category === 'Communications Patients' && (
                        <div className="text-xs text-orange-600 text-center pt-2">
                          ⚠️ Template "Communications Patients" : sélectionnez un patient pour activer l'envoi
                        </div>
                      )}
                    </>
                  ) : isPersonalizing ? (
                    <div className="flex items-center justify-center h-[50vh]">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                        <p className="text-muted-foreground">Personnalisation en cours...</p>
                      </div>
                    </div>
                  ) : personalizedData ? (
                    <>
                      {/* Alertes */}
                      {personalizedData.remainingVariables.length > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-yellow-800">
                              Variables à compléter manuellement
                            </p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Les variables surlignées en jaune doivent être complétées avant l'envoi
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {personalizedData.remainingVariables.map((variable, index) => (
                                <Badge key={index} variant="outline" className="bg-yellow-100 border-yellow-300">
                                  {variable}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Objet */}
                      {editedSubject && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Objet</label>
                          <Input
                            value={editedSubject}
                            onChange={(e) => setEditedSubject(e.target.value)}
                            className="w-full"
                            placeholder="Objet du message"
                          />
                        </div>
                      )}

                      {/* Corps du message */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Message</label>

                        {/* Aperçu avec variables surlignées */}
                        <div
                          className="p-4 bg-muted rounded-lg border text-sm whitespace-pre-wrap mb-2"
                          dangerouslySetInnerHTML={{ __html: highlightVariables(editedBody) }}
                        />

                        {/* Zone d'édition */}
                        <Textarea
                          value={editedBody}
                          onChange={(e) => setEditedBody(e.target.value)}
                          className="min-h-[300px] font-mono text-sm"
                          placeholder="Personnalisez le message..."
                        />
                      </div>

                      {/* Boutons d'envoi */}
                      <div className="flex items-center gap-3 pt-4 border-t">
                        <Button
                          onClick={handleSendEmail}
                          disabled={!canSendEmail() || isSending}
                          className="flex-1"
                          variant={canSendEmail() ? 'default' : 'secondary'}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Envoi...
                            </>
                          ) : (
                            <>
                              <Mail className="h-4 w-4 mr-2" />
                              Envoyer par Email
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={handleSendWhatsApp}
                          disabled={!canSendWhatsApp() || isSending}
                          className="flex-1"
                          variant={canSendWhatsApp() ? 'default' : 'secondary'}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Envoi...
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Envoyer par WhatsApp
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Infos consentement */}
                      <div className="text-xs text-muted-foreground space-y-1 pt-2">
                        {!canSendEmail() && (
                          <p className="text-orange-600">
                            ⚠️ Email non disponible: patient n'a pas donné son consentement ou email manquant
                          </p>
                        )}
                        {!canSendWhatsApp() && selectedTemplate.category === 'Communications Patients' && (
                          <p className="text-orange-600">
                            ⚠️ WhatsApp non disponible: patient n'a pas donné son consentement ou téléphone manquant
                          </p>
                        )}
                        {selectedTemplate.category !== 'Communications Patients' && (
                          <p className="text-muted-foreground">
                            ℹ️ WhatsApp uniquement disponible pour la catégorie "Communications Patients"
                          </p>
                        )}
                      </div>
                    </>
                  ) : null}

                </CardContent>
              </Card>
            </div>
          </div>
        </ChatDisabledOverlay>
      </div>
    </AppLayout>
  );
}
