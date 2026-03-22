'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send, Search, Loader2, Mail, MessageSquare,
  User, Users, FileText, ArrowLeft, ArrowRight, CheckCircle, Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DOMPurify from 'dompurify';


interface Template {
  id: number;
  title: string;
  category: string;
  subject: string | null;
  body: string;
  tags: string[];
  isPublic: boolean;
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

interface Contact {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
}

interface NouveauCourrierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  getAuthToken: () => Promise<string | undefined>;
  defaultSearch?: string;
}

export default function NouveauCourrierModal({
  open, onOpenChange, apiBase, getAuthToken, defaultSearch
}: NouveauCourrierModalProps) {
  const { toast } = useToast();

  // Step management
  const [step, setStep] = useState(1);

  // Step 1: Recipient
  const [recipientType, setRecipientType] = useState<'patient' | 'contact'>('patient');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Step 2: Template
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [useFreetextMode, setUseFreetextMode] = useState(false);

  // Step 3: Edit & Send
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [remainingVariables, setRemainingVariables] = useState<string[]>([]);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // AI generation
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Send success feedback
  const [emailSent, setEmailSent] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  // Variable popover
  const [activeVariable, setActiveVariable] = useState<string | null>(null);
  const [variableValue, setVariableValue] = useState('');
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const popoverInputRef = useRef<HTMLInputElement>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (open) {
      resetState();
      loadData();
    }
  }, [open]);

  const resetState = () => {
    setStep(1);
    setRecipientType('patient');
    setRecipientSearch(defaultSearch || '');
    setSelectedPatient(null);
    setSelectedContact(null);
    setTemplateSearch('');
    setSelectedCategory('');
    setSelectedTemplate(null);
    setUseFreetextMode(false);
    setEditedSubject('');
    setEditedBody('');
    setRemainingVariables([]);
    setShowAiInput(false);
    setAiPrompt('');
    setIsGenerating(false);
    setEmailSent(false);
    setWhatsappSent(false);
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const token = await getAuthToken();

      const [templatesRes, categoriesRes, patientsRes, contactsRes] = await Promise.all([
        fetch(`${apiBase}/api/templates`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBase}/api/templates/categories`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBase}/patients/kine/${(await import('firebase/auth')).getAuth().currentUser?.uid}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBase}/api/contacts`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const [templatesData, categoriesData, patientsData, contactsData] = await Promise.all([
        templatesRes.json(), categoriesRes.json(), patientsRes.ok ? patientsRes.json() : [], contactsRes.json()
      ]);

      if (templatesData.success) setTemplates(templatesData.templates);
      if (categoriesData.success) setCategories(categoriesData.categories);
      if (Array.isArray(patientsData)) setPatients(patientsData);
      if (contactsData.success) setContacts(contactsData.contacts);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ContentEditable: render highlighted HTML
  const getHighlightedHtml = (text: string) => {
    if (!text) return '';
    const raw = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/\[([^\]]+)\]/g,
        '<mark class="bg-yellow-300 dark:bg-yellow-500/30 text-black dark:text-yellow-200 px-1 rounded cursor-pointer hover:bg-yellow-400 dark:hover:bg-yellow-500/50">[$1]</mark>');
    return DOMPurify.sanitize(raw, { ALLOWED_TAGS: ['mark', 'br'], ALLOWED_ATTR: ['class'] });
  };

  // Sync state → DOM only on external changes (template selection, variable replacement)
  useEffect(() => {
    if (!useFreetextMode && editableRef.current) {
      if (isInternalUpdate.current) {
        isInternalUpdate.current = false;
        return;
      }
      editableRef.current.innerHTML = getHighlightedHtml(editedBody);
    }
  }, [editedBody, useFreetextMode]);

  const handleContentInput = () => {
    if (!editableRef.current) return;
    isInternalUpdate.current = true;
    setEditedBody(editableRef.current.innerText || '');
  };

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'MARK') {
      const variable = target.textContent || '';
      if (remainingVariables.includes(variable)) {
        handleVariableClick(e, variable);
      }
    }
  };

  // Filters
  const filteredPatients = patients.filter(p => {
    if (!recipientSearch.trim()) return true;
    const q = recipientSearch.toLowerCase();
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
  });

  const filteredContacts = contacts.filter(c => {
    if (!recipientSearch.trim()) return true;
    const q = recipientSearch.toLowerCase();
    return `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q));
  });

  const filteredTemplates = templates.filter(t => {
    if (selectedCategory && t.category !== selectedCategory) return false;
    if (templateSearch.trim()) {
      const q = templateSearch.toLowerCase();
      return t.title.toLowerCase().includes(q);
    }
    return true;
  });

  // Step navigation
  const handleSelectRecipient = (patient: Patient | null, contact: Contact | null) => {
    setSelectedPatient(patient);
    setSelectedContact(contact);
    setStep(2);
  };

  const handleSelectTemplate = async (template: Template | null) => {
    setSelectedTemplate(template);

    if (!template) {
      // Freetext mode
      setUseFreetextMode(true);
      setEditedSubject('');
      setEditedBody('');
      setRemainingVariables([]);
      setStep(3);
      return;
    }

    setUseFreetextMode(false);

    // Auto-personalize if recipient selected
    const patientId = selectedPatient?.id;
    const contactId = selectedContact?.id;

    if (patientId || contactId) {
      try {
        setIsPersonalizing(true);
        const token = await getAuthToken();
        const res = await fetch(`${apiBase}/api/templates/personalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ templateId: template.id, patientId, contactId })
        });
        const data = await res.json();
        if (data.success) {
          setEditedSubject(data.personalizedSubject || '');
          setEditedBody(data.personalizedBody);
          setRemainingVariables(data.remainingVariables || []);
        } else {
          setEditedSubject(template.subject || '');
          setEditedBody(template.body);
        }
      } catch {
        setEditedSubject(template.subject || '');
        setEditedBody(template.body);
      } finally {
        setIsPersonalizing(false);
      }
    } else {
      setEditedSubject(template.subject || '');
      setEditedBody(template.body);
    }

    setStep(3);
  };

  const handleVariableClick = (e: React.MouseEvent, variable: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const bodyRect = bodyRef.current?.getBoundingClientRect();
    if (bodyRect) {
      setPopoverPos({
        top: rect.bottom - bodyRect.top + 4,
        left: rect.left - bodyRect.left
      });
    }
    setActiveVariable(variable);
    setVariableValue('');
    setTimeout(() => popoverInputRef.current?.focus(), 50);
  };

  const handleVariableReplace = () => {
    if (!activeVariable || !variableValue.trim()) return;
    const escaped = activeVariable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    setEditedBody(prev => prev.replace(new RegExp(escaped, 'g'), variableValue.trim()));
    setEditedSubject(prev => prev.replace(new RegExp(escaped, 'g'), variableValue.trim()));
    setRemainingVariables(prev => prev.filter(v => v !== activeVariable));
    setActiveVariable(null);
    setPopoverPos(null);
  };

  const renderInteractiveBody = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) => {
      if (/^\[[^\]]+\]$/.test(part)) {
        return (
          <mark
            key={i}
            className="bg-yellow-300 dark:bg-yellow-500/30 text-black dark:text-yellow-200 px-1 rounded cursor-pointer hover:bg-yellow-400 dark:hover:bg-yellow-500/50 transition-colors"
            onClick={(e) => handleVariableClick(e, part)}
          >
            {part}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || isGenerating) return;
    try {
      setIsGenerating(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/templates/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: aiPrompt.trim() })
      });

      if (res.status === 429) {
        toast({ title: 'Limite atteinte', description: 'Veuillez patienter avant de réessayer.', variant: 'destructive', duration: 8000 });
        return;
      }

      if (res.status === 403) {
        toast({ title: 'Accès restreint', description: 'Cette fonctionnalité nécessite un abonnement Pionnier ou Expert.', variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success && data.generatedMessage) {
        setSelectedTemplate(null);
        setUseFreetextMode(true);
        setEditedSubject('');
        setEditedBody(data.generatedMessage);
        setRemainingVariables([]);
        setShowAiInput(false);
        setAiPrompt('');
        setStep(3);
      } else {
        toast({ title: 'Erreur', description: data.error || 'Erreur lors de la génération', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Erreur génération IA:', error);
      toast({ title: 'Erreur', description: 'Erreur lors de la génération du message', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const recipientName = selectedPatient
    ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
    : selectedContact
    ? `${selectedContact.firstName || ''} ${selectedContact.lastName || ''}`.trim()
    : '';

  const recipientEmail = selectedPatient?.email || selectedContact?.email || '';

  const canSendEmail = () => {
    if (selectedPatient) return selectedPatient.emailConsent && !!selectedPatient.email;
    return !!selectedContact?.email;
  };

  const canSendWhatsApp = () => {
    if (!selectedPatient) return false;
    return selectedPatient.whatsappConsent && !!selectedPatient.phone;
  };

  const handleSendEmail = async () => {
    if (!canSendEmail()) return;

    try {
      setIsSending(true);
      const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(editedSubject)}&body=${encodeURIComponent(editedBody)}`;
      window.location.href = mailto;

      // Save to history
      const token = await getAuthToken();
      await fetch(`${apiBase}/api/templates/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: selectedPatient?.id || null,
          contactId: selectedContact?.id || null,
          templateId: selectedTemplate?.id || null,
          templateTitle: selectedTemplate?.title || 'Message libre',
          subject: editedSubject,
          body: editedBody,
          method: 'EMAIL',
          recipientName,
          recipientEmail
        })
      });

      setEmailSent(true);
    } catch (error) {
      console.error('Erreur envoi email:', error);
      toast({ title: 'Erreur', description: 'Erreur lors de l\'ouverture du client mail', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!canSendWhatsApp() || !selectedPatient) return;

    try {
      setIsSending(true);
      const token = await getAuthToken();

      const res = await fetch(`${apiBase}/api/templates/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          templateId: selectedTemplate?.id || null,
          templateTitle: selectedTemplate?.title || 'Message libre',
          subject: editedSubject,
          body: editedBody
        })
      });

      if (res.status === 429) {
        const data = await res.json();
        toast({ title: 'Limite atteinte', description: data.details || 'Veuillez patienter avant de réessayer.', variant: 'destructive', duration: 8000 });
        return;
      }

      const data = await res.json();
      if (data.success) {
        setWhatsappSent(true);
      } else {
        toast({ title: 'Erreur', description: data.error || 'Erreur envoi WhatsApp', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Erreur WhatsApp:', error);
      toast({ title: 'Erreur', description: 'Erreur lors de l\'envoi WhatsApp', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-[#3899aa]" />
            Nouveau courrier
          </DialogTitle>
        </DialogHeader>

        {/* Steps indicator — fixe */}
        <div className="shrink-0 flex items-center gap-2 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-[#3899aa] text-white' : step > s ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              <span className={`text-sm ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Destinataire' : s === 2 ? 'Template' : 'Rédaction'}
              </span>
              {s < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === 1 ? (
          /* ===== STEP 1: Destinataire ===== */
          <div className="space-y-4">
            <Tabs value={recipientType} onValueChange={v => { setRecipientType(v as 'patient' | 'contact'); setRecipientSearch(''); }}>
              <TabsList>
                <TabsTrigger value="patient"><User className="h-4 w-4 mr-1" /> Patient</TabsTrigger>
                <TabsTrigger value="contact"><Users className="h-4 w-4 mr-1" /> Contact</TabsTrigger>
              </TabsList>

              <div className="mt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} placeholder={recipientType === 'patient' ? 'Rechercher un patient...' : 'Rechercher un contact...'} className="pl-9" />
                </div>
              </div>

              <TabsContent value="patient" className="mt-3">
                <div className="space-y-1 overflow-y-auto">
                  {filteredPatients.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun patient trouvé</p>
                  ) : filteredPatients.map(patient => (
                    <div
                      key={patient.id}
                      className="p-3 rounded-lg border hover:bg-[#3899aa]/10 hover:border-[#3899aa]/50 cursor-pointer transition-all"
                      onClick={() => handleSelectRecipient(patient, null)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{patient.firstName} {patient.lastName}</p>
                          <p className="text-xs text-muted-foreground">{patient.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {patient.emailConsent && <Badge variant="default" className="text-xs"><Mail className="h-3 w-3 mr-1" />OK</Badge>}
                          {patient.whatsappConsent && <Badge variant="default" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />OK</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="contact" className="mt-3">
                <div className="space-y-1 overflow-y-auto">
                  {filteredContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun contact trouvé</p>
                  ) : filteredContacts.map(contact => (
                    <div
                      key={contact.id}
                      className="p-3 rounded-lg border hover:bg-[#3899aa]/10 hover:border-[#3899aa]/50 cursor-pointer transition-all"
                      onClick={() => handleSelectRecipient(null, contact)}
                    >
                      <p className="font-medium text-sm">{contact.firstName} {contact.lastName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {contact.email && <span>{contact.email}</span>}
                        {contact.type && <Badge variant="secondary" className="text-xs">{contact.type}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

          </div>
        ) : step === 2 ? (
          /* ===== STEP 2: Template ===== */
          <div className="space-y-4">
            {/* Back button + selected recipient */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour
              </Button>
              {recipientName && (
                <Badge variant="outline" className="text-sm">
                  <User className="h-3 w-3 mr-1" /> {recipientName}
                </Badge>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} placeholder="Rechercher un template..." className="pl-9" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={selectedCategory === '' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory('')}>Toutes</Badge>
              {categories.map(cat => (
                <Badge key={cat.name} variant={selectedCategory === cat.name ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory(cat.name)}>
                  {cat.name} ({cat.count})
                </Badge>
              ))}
            </div>

            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {/* Freetext option */}
              <div
                className="p-3 rounded-lg border hover:bg-[#3899aa]/10 hover:border-[#3899aa]/50 cursor-pointer transition-all border-dashed"
                onClick={() => handleSelectTemplate(null)}
              >
                <p className="font-medium text-sm">Message libre</p>
                <p className="text-xs text-muted-foreground">Rédigez votre message de zéro</p>
              </div>

              {/* AI generation option */}
              <div
                className={`p-3 rounded-lg border transition-all border-dashed ${
                  showAiInput ? 'border-teal-500 bg-teal-50/50' : 'hover:bg-teal-50/50 hover:border-teal-500/50 cursor-pointer'
                }`}
                onClick={() => !showAiInput && setShowAiInput(true)}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-teal-600" />
                  <p className="font-medium text-sm text-teal-700">Demander à l&apos;IA</p>
                </div>

                {showAiInput && (
                  <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-muted-foreground italic">
                      L&apos;IA génère un brouillon. Vérifiez et adaptez le message avant envoi.
                    </p>
                    <Textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value.slice(0, 500))}
                      placeholder="Ex: Relance de paiement pour 3 séances impayées..."
                      className="min-h-[80px] text-sm"
                      disabled={isGenerating}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{aiPrompt.length}/500</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowAiInput(false); setAiPrompt(''); }}
                          disabled={isGenerating}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          className="btn-teal"
                          onClick={handleAiGenerate}
                          disabled={!aiPrompt.trim() || isGenerating}
                        >
                          {isGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                          Générer
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="p-3 rounded-lg border hover:bg-[#3899aa]/10 hover:border-[#3899aa]/50 cursor-pointer transition-all"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <p className="font-medium text-sm">{template.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">{template.category}</Badge>
                    {!template.isPublic && <Badge variant="outline" className="text-xs">Privé</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ===== STEP 3: Rédaction & Envoi ===== */
          <div className="space-y-4">
            {/* Back + context */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour
              </Button>
              <div className="flex items-center gap-2">
                {recipientName && (
                  <Badge variant="outline" className="text-sm">
                    <User className="h-3 w-3 mr-1" /> {recipientName}
                  </Badge>
                )}
                {selectedTemplate && (
                  <Badge variant="secondary" className="text-sm">
                    <FileText className="h-3 w-3 mr-1" /> {selectedTemplate.title}
                  </Badge>
                )}
              </div>
            </div>

            {isPersonalizing ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#3899aa] mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Personnalisation en cours...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Subject */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Objet</label>
                  <Input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} placeholder="Objet du message" />
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Message</label>
                  {useFreetextMode ? (
                    <Textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Rédigez votre message..." />
                  ) : (
                    <div className="relative" ref={bodyRef}>
                      <div
                        ref={editableRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={handleContentInput}
                        onClick={handleContentClick}
                        onPaste={(e) => {
                          e.preventDefault();
                          const text = e.clipboardData.getData('text/plain');
                          document.execCommand('insertText', false, text);
                        }}
                        className="p-3 bg-white dark:bg-card rounded-lg border text-sm whitespace-pre-wrap min-h-[200px] focus:outline-none focus:ring-2 focus:ring-[#3899aa]/40 focus:border-[#3899aa]"
                      />

                      {/* Variable popover */}
                      {activeVariable && popoverPos && (
                        <div
                          className="absolute z-50 bg-white dark:bg-popover border rounded-lg shadow-lg p-2 flex items-center gap-2"
                          style={{ top: popoverPos.top, left: popoverPos.left }}
                        >
                          <Input
                            ref={popoverInputRef}
                            value={variableValue}
                            onChange={e => setVariableValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleVariableReplace();
                              if (e.key === 'Escape') { setActiveVariable(null); setPopoverPos(null); }
                            }}
                            placeholder={activeVariable}
                            className="h-8 text-sm w-48"
                          />
                          <Button size="sm" className="h-8 btn-teal" onClick={handleVariableReplace} disabled={!variableValue.trim()}>
                            OK
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setActiveVariable(null); setPopoverPos(null); }}>
                            ✕
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Send buttons */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSendEmail}
                    disabled={!canSendEmail() || isSending || !editedBody.trim()}
                    className={`flex-1 ${canSendEmail() && editedBody.trim() ? 'btn-teal' : ''}`}
                    variant={canSendEmail() && editedBody.trim() ? 'default' : 'secondary'}
                  >
                    {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    Envoyer par Email
                  </Button>

                  {selectedPatient && (
                    <Button
                      onClick={handleSendWhatsApp}
                      disabled={!canSendWhatsApp() || isSending || !editedBody.trim()}
                      className={`flex-1 ${canSendWhatsApp() && editedBody.trim() ? 'btn-teal' : ''}`}
                      variant={canSendWhatsApp() && editedBody.trim() ? 'default' : 'secondary'}
                    >
                      {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                      Envoyer par WhatsApp
                    </Button>
                  )}
                </div>

                {/* Send success feedback */}
                {emailSent && (
                  <div className="flex items-center gap-2 text-green-600 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Boîte mail ouverte</span>
                  </div>
                )}
                {whatsappSent && (
                  <div className="flex items-center gap-2 text-green-600 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Message envoyé via WhatsApp</span>
                  </div>
                )}

                {/* Consent info */}
                <div className="text-xs text-muted-foreground space-y-1">
                  {selectedPatient && !canSendEmail() && (
                    <p className="text-orange-600">Email non disponible : consentement manquant ou email absent</p>
                  )}
                  {selectedPatient && !canSendWhatsApp() && (
                    <p className="text-orange-600">WhatsApp non disponible : consentement manquant ou téléphone absent</p>
                  )}
                  {!selectedPatient && !selectedContact && (
                    <p>Aucun destinataire sélectionné — le client mail s'ouvrira sans destinataire pré-rempli</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
