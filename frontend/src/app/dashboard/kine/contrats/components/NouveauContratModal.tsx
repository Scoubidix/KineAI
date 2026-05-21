'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ArrowLeft, Loader2, UserPlus, User, Check, Eye, AlertCircle, PenLine, FileText, Building2, MapPin, Search, Pencil, Trash2, Maximize2, Mail, Send
} from 'lucide-react';
import { DEPARTEMENTS_FR } from '../data/departements-fr';
import SignatureDialog from './SignatureDialog';

interface NouveauContratModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type RoleInitiateur = 'TITULAIRE' | 'REMPLACANT_OU_ASSISTANT';
type Civilite = 'M.' | 'MME';

interface ContactKine { id: number; firstName: string; lastName: string; email: string; phone: string | null; }
interface KineProfile {
  firstName?: string; lastName?: string; email?: string;
  civilite?: Civilite | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  departementOrdre?: string | null;
  numeroOrdinal?: string | null;
  adresseDomicile?: string | null;
  adresseCabinet?: string | null;
}

type QuestionKey =
  | 'CONTRACT_TYPE'
  | 'ROLE'
  | 'DESTINATAIRE_PICK'
  | 'DESTINATAIRE_NEW'
  | 'PROFILE_CIVILITE'
  | 'PROFILE_BIRTH_DATE'
  | 'PROFILE_BIRTH_PLACE'
  | 'PROFILE_DEPT_ORDRE'
  | 'PROFILE_NUM_ORDINAL'
  | 'PROFILE_ADRESSE'
  | 'M_DATE_DEBUT'
  | 'M_DATE_FIN'
  | 'M_RETROCESSION'
  | 'M_INDEMNITES'
  | 'M_BALNEO_TOGGLE'
  | 'M_BALNEO_PERCENT'
  | 'M_NON_INSTALL'
  | 'M_LIEU_SIGN'
  | 'PREVIEW'
  | 'POST_SIGN';

// Helpers
function addDays(iso: string, days: number): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const PROFILE_REQUIRED: (keyof KineProfile)[] = [
  'civilite', 'birthDate', 'birthPlace', 'departementOrdre', 'numeroOrdinal'
];

export default function NouveauContratModal({ open, onOpenChange, onCreated }: NouveauContratModalProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ----- State principal -----
  // On stocke la CLÉ de la question (pas l'index) : la liste `questions` peut se recalculer
  // quand profileNeedsCompletion / balneoActive / newContactMode changent, et l'index dériverait alors.
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [currentKey, setCurrentKey] = useState<QuestionKey>('CONTRACT_TYPE');
  const [isPersisting, setIsPersisting] = useState(false);

  const [contractType, setContractType] = useState<'REMPLACEMENT_LIBERAL' | null>(null);
  const [roleInitiateur, setRoleInitiateur] = useState<RoleInitiateur | null>(null);

  // Destinataire
  const [contacts, setContacts] = useState<ContactKine[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [newContactMode, setNewContactMode] = useState(false);
  const [newContact, setNewContact] = useState({ firstName: '', lastName: '', email: '' });
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<number | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  // Profil
  const [profile, setProfile] = useState<KineProfile | null>(null);
  const [profileForm, setProfileForm] = useState<KineProfile>({});

  // Modalités
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [retrocession, setRetrocession] = useState<number>(70);
  const [indemnites, setIndemnites] = useState<number>(100);
  const [balneoActive, setBalneoActive] = useState(false);
  const [balneoPercent, setBalneoPercent] = useState<number>(100);
  const [nonInstall, setNonInstall] = useState<number>(5);
  const [lieuSign, setLieuSign] = useState('');

  // Aperçu / signature
  const [contractId, setContractId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [invitationSent, setInvitationSent] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  // ----- Liste dynamique des questions -----
  const profileNeedsCompletion = useMemo(() => {
    if (!profile) return false;
    // Tant que le rôle n'est pas choisi, on n'évalue pas l'adresse requise — les questions profil
    // ne s'ajouteront que si nécessaire après le choix du rôle (la liste se recalcule).
    if (!roleInitiateur) return PROFILE_REQUIRED.some(f => !profile[f]);
    const adresseRequired = roleInitiateur === 'TITULAIRE' ? 'adresseCabinet' : 'adresseDomicile';
    return PROFILE_REQUIRED.some(f => !profile[f]) || !profile[adresseRequired as keyof KineProfile];
  }, [profile, roleInitiateur]);

  const questions: QuestionKey[] = useMemo(() => {
    const list: QuestionKey[] = ['CONTRACT_TYPE', 'ROLE', 'DESTINATAIRE_PICK'];
    if (newContactMode) list.push('DESTINATAIRE_NEW');
    if (profileNeedsCompletion) {
      list.push(
        'PROFILE_CIVILITE',
        'PROFILE_BIRTH_DATE',
        'PROFILE_BIRTH_PLACE',
        'PROFILE_DEPT_ORDRE',
        'PROFILE_NUM_ORDINAL',
        'PROFILE_ADRESSE',
      );
    }
    list.push(
      'M_DATE_DEBUT',
      'M_DATE_FIN',
      'M_RETROCESSION',
      'M_INDEMNITES',
      'M_BALNEO_TOGGLE',
    );
    if (balneoActive) list.push('M_BALNEO_PERCENT');
    list.push('M_NON_INSTALL', 'M_LIEU_SIGN', 'PREVIEW', 'POST_SIGN');
    return list;
  }, [newContactMode, profileNeedsCompletion, balneoActive]);

  // Dérivés : index courant + question courante (sécurisée si la clé n'est plus dans la liste)
  const currentIdx = Math.max(0, questions.indexOf(currentKey));
  const current: QuestionKey = questions[currentIdx] ?? 'ROLE';

  // ----- Reset à l'ouverture -----
  useEffect(() => {
    if (!open) return;
    setDirection('forward');
    setCurrentKey('CONTRACT_TYPE');
    setIsPersisting(false);
    setContractType(null);
    setRoleInitiateur(null);
    setSelectedContactId(null);
    setContactSearch('');
    setNewContactMode(false);
    setNewContact({ firstName: '', lastName: '', email: '' });
    setEditingContactId(null);
    setDeleteContactId(null);
    setDeletingContact(false);
    setDateDebut('');
    setDateFin('');
    setRetrocession(70);
    setIndemnites(100);
    setBalneoActive(false);
    setBalneoPercent(100);
    setNonInstall(5);
    setLieuSign('');
    setContractId(null);
    setPreviewUrl(null);
    setPreviewError(null);
    setSigned(false);
    setSignOpen(false);
    setPreviewFullscreen(false);
    setSendingInvitation(false);
    setInvitationSent(false);
    setInvitationError(null);
  }, [open]);

  // ----- Charger profil + contacts à l'ouverture -----
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          setProfileForm({
            civilite: data.civilite || undefined,
            birthDate: data.birthDate ? String(data.birthDate).slice(0, 10) : '',
            birthPlace: data.birthPlace || '',
            departementOrdre: data.departementOrdre || '',
            numeroOrdinal: data.numeroOrdinal || '',
            adresseCabinet: data.adresseCabinet || '',
            adresseDomicile: data.adresseDomicile || '',
          });
        }
      } catch {/* silent */}
    })();
    (async () => {
      setLoadingContacts(true);
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contacts-kine`);
        if (res.ok) {
          const data = await res.json();
          setContacts(Array.isArray(data.contacts) ? data.contacts : []);
        }
      } catch {/* silent */}
      finally { setLoadingContacts(false); }
    })();
  }, [open]);

  // Pre-fill : date de fin = début + 30j
  useEffect(() => {
    if (current === 'M_DATE_FIN' && dateDebut && !dateFin) {
      setDateFin(addDays(dateDebut, 30));
    }
  }, [current, dateDebut, dateFin]);

  // Cleanup blob
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // ----- Validations par question -----
  const canAdvance = useMemo(() => {
    switch (current) {
      case 'CONTRACT_TYPE': return contractType !== null;
      case 'ROLE': return roleInitiateur !== null;
      case 'DESTINATAIRE_PICK': return selectedContactId !== null;
      case 'DESTINATAIRE_NEW':
        return newContact.firstName.trim().length > 0 && newContact.lastName.trim().length > 0 && newContact.email.trim().length > 0;
      case 'PROFILE_CIVILITE': return !!profileForm.civilite;
      case 'PROFILE_BIRTH_DATE': return !!profileForm.birthDate;
      case 'PROFILE_BIRTH_PLACE': return !!profileForm.birthPlace?.trim();
      case 'PROFILE_DEPT_ORDRE': return !!profileForm.departementOrdre;
      case 'PROFILE_NUM_ORDINAL': return !!profileForm.numeroOrdinal?.trim();
      case 'PROFILE_ADRESSE': {
        const field = roleInitiateur === 'TITULAIRE' ? 'adresseCabinet' : 'adresseDomicile';
        return !!profileForm[field]?.trim();
      }
      case 'M_DATE_DEBUT': return !!dateDebut;
      case 'M_DATE_FIN': return !!dateFin;
      case 'M_RETROCESSION': return retrocession >= 0 && retrocession <= 100;
      case 'M_INDEMNITES': return indemnites >= 0 && indemnites <= 100;
      case 'M_BALNEO_TOGGLE': return true;
      case 'M_BALNEO_PERCENT': return balneoPercent >= 0 && balneoPercent <= 100;
      case 'M_NON_INSTALL': return nonInstall >= 0;
      case 'M_LIEU_SIGN': return !!lieuSign.trim();
      case 'PREVIEW': return true;
      case 'POST_SIGN': return true;
      default: return false;
    }
  }, [current, contractType, roleInitiateur, selectedContactId, newContact, profileForm, dateDebut, dateFin, retrocession, indemnites, balneoPercent, nonInstall, lieuSign]);

  const isAutoAdvance = useMemo(() => {
    return ['CONTRACT_TYPE', 'ROLE', 'PROFILE_CIVILITE', 'PROFILE_DEPT_ORDRE', 'M_BALNEO_TOGGLE'].includes(current);
  }, [current]);

  // ----- Side effects à la transition (sauvegardes) -----
  const persistNewContact = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contacts-kine`, {
        method: 'POST',
        body: JSON.stringify({
          firstName: newContact.firstName.trim(),
          lastName: newContact.lastName.trim(),
          email: newContact.email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: data.code === 'DUPLICATE_CONTACT' ? 'Doublon' : 'Erreur',
          description: data.error || 'Création du contact impossible',
          variant: 'destructive'
        });
        return false;
      }
      setContacts(prev => [...prev, data.contact]);
      setSelectedContactId(data.contact.id);
      return true;
    } catch {
      toast({ title: 'Erreur', description: 'Création du contact impossible', variant: 'destructive' });
      return false;
    }
  }, [newContact, toast]);

  const persistEditContact = useCallback(async (): Promise<boolean> => {
    if (editingContactId === null) return false;
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contacts-kine/${editingContactId}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: newContact.firstName.trim(),
          lastName: newContact.lastName.trim(),
          email: newContact.email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: data.code === 'DUPLICATE_CONTACT' ? 'Doublon' : 'Erreur',
          description: data.error || 'Modification du contact impossible',
          variant: 'destructive'
        });
        return false;
      }
      setContacts(prev => prev.map(c => c.id === editingContactId ? data.contact : c));
      return true;
    } catch {
      toast({ title: 'Erreur', description: 'Modification du contact impossible', variant: 'destructive' });
      return false;
    }
  }, [editingContactId, newContact, toast]);

  const deleteContact = useCallback(async (id: number): Promise<void> => {
    setDeletingContact(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contacts-kine/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Erreur', description: data.error || 'Suppression impossible', variant: 'destructive' });
        return;
      }
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedContactId === id) setSelectedContactId(null);
      if (editingContactId === id) {
        setEditingContactId(null);
        setNewContactMode(false);
        setNewContact({ firstName: '', lastName: '', email: '' });
        setDirection('backward');
        setCurrentKey('DESTINATAIRE_PICK');
      }
      toast({ title: 'Contact supprimé' });
      setDeleteContactId(null);
    } catch {
      toast({ title: 'Erreur', description: 'Suppression impossible', variant: 'destructive' });
    } finally {
      setDeletingContact(false);
    }
  }, [selectedContactId, editingContactId, toast]);

  const startEditContact = useCallback((c: ContactKine) => {
    setEditingContactId(c.id);
    setNewContact({ firstName: c.firstName, lastName: c.lastName, email: c.email });
    setNewContactMode(true);
    setDirection('forward');
    setTimeout(() => setCurrentKey('DESTINATAIRE_NEW'), 120);
  }, []);

  const persistProfile = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
        method: 'PUT',
        body: JSON.stringify({
          civilite: profileForm.civilite || null,
          birthDate: profileForm.birthDate || '',
          birthPlace: profileForm.birthPlace || '',
          departementOrdre: profileForm.departementOrdre || '',
          numeroOrdinal: profileForm.numeroOrdinal || '',
          adresseCabinet: profileForm.adresseCabinet || '',
          adresseDomicile: profileForm.adresseDomicile || '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Erreur', description: data.error || 'Sauvegarde profil échouée', variant: 'destructive' });
        return false;
      }
      const updated = await res.json();
      setProfile(updated);
      return true;
    } catch {
      toast({ title: 'Erreur', description: 'Sauvegarde profil échouée', variant: 'destructive' });
      return false;
    }
  }, [profileForm, toast]);

  const persistContract = useCallback(async (): Promise<boolean> => {
    try {
      const payload = {
        type: 'REMPLACEMENT_LIBERAL' as const,
        roleInitiateur: roleInitiateur!,
        contactKineId: selectedContactId!,
        data: {
          dateDebut, dateFin,
          retrocessionPercent: retrocession,
          indemnitesDeplacementRemplacantPercent: indemnites,
          supplementsBalneoRemplacePercent: balneoActive ? balneoPercent : null,
          nonInstallationRadiusKm: nonInstall,
          departementConciliation: (profile?.departementOrdre || profileForm.departementOrdre || '').trim(),
          signatureLieu: lieuSign.trim(),
          signatureDate: todayIso,
        },
      };
      const res = contractId
        ? await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}`, {
            method: 'PUT', body: JSON.stringify({ data: payload.data }),
          })
        : await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts`, {
            method: 'POST', body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Sauvegarde du contrat échouée', variant: 'destructive' });
        return false;
      }
      setContractId(data.contract.id);
      void fetchPreview(data.contract.id);
      return true;
    } catch {
      toast({ title: 'Erreur', description: 'Sauvegarde du contrat échouée', variant: 'destructive' });
      return false;
    }
  }, [roleInitiateur, selectedContactId, dateDebut, dateFin, retrocession, indemnites, balneoActive, balneoPercent, nonInstall, profile?.departementOrdre, profileForm.departementOrdre, lieuSign, todayIso, contractId, toast]);

  const fetchPreview = async (cid: number) => {
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${cid}/preview-pdf`);
      if (!res.ok) {
        if (res.status === 503) setPreviewError('La génération PDF est désactivée sur cet environnement. Le contrat est bien sauvegardé.');
        else {
          const data = await res.json().catch(() => ({}));
          setPreviewError(data.error || 'Erreur chargement aperçu');
        }
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch { setPreviewError('Erreur réseau'); }
    finally { setPreviewLoading(false); }
  };

  // ----- Navigation -----
  // Helper : avance vers la question suivante de la liste courante (skippe les questions qui vont disparaître)
  const nextKeyFrom = useCallback((key: QuestionKey): QuestionKey | null => {
    const idx = questions.indexOf(key);
    if (idx === -1 || idx >= questions.length - 1) return null;
    return questions[idx + 1];
  }, [questions]);

  const prevKeyFrom = useCallback((key: QuestionKey): QuestionKey | null => {
    const idx = questions.indexOf(key);
    if (idx <= 0) return null;
    return questions[idx - 1];
  }, [questions]);

  const advance = useCallback(async () => {
    if (!canAdvance || isPersisting) return;

    if (current === 'DESTINATAIRE_NEW') {
      setIsPersisting(true);
      const ok = editingContactId !== null ? await persistEditContact() : await persistNewContact();
      setIsPersisting(false);
      if (!ok) return;
      // En mode édition : retour à la liste des contacts. En création : on enchaîne sur l'étape suivante.
      if (editingContactId !== null) {
        setEditingContactId(null);
        setNewContactMode(false);
        setNewContact({ firstName: '', lastName: '', email: '' });
        setDirection('backward');
        setCurrentKey('DESTINATAIRE_PICK');
        return;
      }
      setNewContactMode(false);
    }
    if (current === 'PROFILE_ADRESSE') {
      setIsPersisting(true);
      const ok = await persistProfile();
      setIsPersisting(false);
      if (!ok) return;
    }
    if (current === 'M_LIEU_SIGN') {
      setIsPersisting(true);
      const ok = await persistContract();
      setIsPersisting(false);
      if (!ok) return;
    }

    const next = nextKeyFrom(current);
    if (!next) return;
    setDirection('forward');
    setCurrentKey(next);
  }, [canAdvance, isPersisting, current, nextKeyFrom, persistNewContact, persistEditContact, editingContactId, persistProfile, persistContract]);

  const goBack = useCallback(() => {
    if (isPersisting) return;
    if (current === 'DESTINATAIRE_NEW') {
      // Annule la création/édition et revient au picker
      setEditingContactId(null);
      setNewContactMode(false);
      setNewContact({ firstName: '', lastName: '', email: '' });
      setDirection('backward');
      setCurrentKey('DESTINATAIRE_PICK');
      return;
    }
    const prev = prevKeyFrom(current);
    if (!prev) return;
    setDirection('backward');
    setCurrentKey(prev);
  }, [current, isPersisting, prevKeyFrom]);

  // Enter pour avancer (sauf champs select et radio gérés au clic)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Ne déclenche pas si on est dans un textarea ou un select
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Enter' && !e.shiftKey && !isAutoAdvance && canAdvance && !isPersisting) {
        e.preventDefault();
        advance();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, canAdvance, isAutoAdvance, isPersisting, advance]);

  // ----- Auto-advance pour les choix -----
  const autoNext = useCallback(() => {
    const next = nextKeyFrom(current);
    if (!next) return;
    setDirection('forward');
    setTimeout(() => setCurrentKey(next), 120);
  }, [current, nextKeyFrom]);

  const pickContractType = (t: 'REMPLACEMENT_LIBERAL') => { setContractType(t); autoNext(); };
  const pickRole = (r: RoleInitiateur) => { setRoleInitiateur(r); autoNext(); };
  const pickContact = (id: number) => { setSelectedContactId(id); autoNext(); };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [contacts, contactSearch]);
  const pickCivilite = (c: Civilite) => { setProfileForm(p => ({ ...p, civilite: c })); autoNext(); };
  const pickDeptOrdre = (v: string) => { setProfileForm(p => ({ ...p, departementOrdre: v })); autoNext(); };
  const pickBalneo = (active: boolean) => {
    setBalneoActive(active);
    // Important : si on désactive balneo, la question BALNEO_PERCENT disparaît.
    // Comme on calcule next à partir de la liste actuelle, on prend la question juste après le toggle.
    setDirection('forward');
    setTimeout(() => {
      // Re-derive depuis la liste à jour : sans BALNEO_PERCENT si désactivé
      if (!active) {
        setCurrentKey('M_NON_INSTALL');
      } else {
        setCurrentKey('M_BALNEO_PERCENT');
      }
    }, 120);
  };

  // ----- Refs pour focus auto + Enter chain dans DESTINATAIRE_NEW -----
  const inputRef = useRef<HTMLInputElement | null>(null);
  const newContactRefs = useRef<{ firstName: HTMLInputElement | null; lastName: HTMLInputElement | null; email: HTMLInputElement | null }>({ firstName: null, lastName: null, email: null });

  useEffect(() => {
    // Auto-focus à l'arrivée sur la question
    const t = setTimeout(() => {
      if (current === 'DESTINATAIRE_NEW') {
        newContactRefs.current.firstName?.focus();
      } else if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 180);
    return () => clearTimeout(t);
  }, [current]);

  // Signature
  const initiatorFullName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
  const destinataireContact = useMemo(() => contacts.find(c => c.id === selectedContactId) || null, [contacts, selectedContactId]);
  const destinataireFullName = destinataireContact ? `${destinataireContact.firstName} ${destinataireContact.lastName}`.trim() : '';
  const destinataireEmail = destinataireContact?.email || '';

  const handleSignConfirm = async (signatureText: string, mention: string) => {
    if (!contractId) return;
    setSigning(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/sign-initiator`, {
        method: 'POST',
        body: JSON.stringify({ signatureText, mention }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Signature impossible', variant: 'destructive' });
        return;
      }
      setSigned(true);
      setSignOpen(false);
      setDirection('forward');
      setCurrentKey('POST_SIGN');
    } finally { setSigning(false); }
  };

  const handleSendInvitation = async () => {
    if (!contractId) return;
    setSendingInvitation(true);
    setInvitationError(null);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/send-invitation`, {
        method: 'POST',
        body: JSON.stringify({ channel: 'EMAIL' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvitationError(data?.error || 'Envoi impossible. Veuillez réessayer.');
        return;
      }
      setInvitationSent(true);
    } catch {
      setInvitationError('Erreur réseau. Veuillez réessayer.');
    } finally {
      setSendingInvitation(false);
    }
  };

  const handleFinish = () => {
    if (signed && !invitationSent) {
      toast({ title: 'Contrat enregistré', description: 'Vous pouvez l\'envoyer plus tard depuis "Mes contrats".' });
    } else if (!signed) {
      toast({ title: 'Brouillon enregistré', description: 'Le contrat est disponible dans "Mes contrats".' });
    }
    onOpenChange(false);
    onCreated?.();
  };

  // ----- UI -----
  const progress = questions.length > 1 ? ((currentIdx + 1) / questions.length) * 100 : 100;

  const animClass = direction === 'forward'
    ? 'animate-in slide-in-from-right-6 fade-in duration-200'
    : 'animate-in slide-in-from-left-6 fade-in duration-200';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${current === 'PREVIEW' ? '!max-w-5xl !h-[90vh]' : '!max-w-2xl !h-[640px]'} !w-[95vw] !max-h-[90vh] p-0 flex flex-col overflow-hidden`}>
        {/* Header minimal : titre + barre de progression */}
        <div className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2 mb-3">
            {currentIdx > 0 && current !== 'PREVIEW' && current !== 'POST_SIGN' && (
              <button onClick={goBack} disabled={isPersisting} className="text-muted-foreground hover:text-foreground transition-colors -ml-1" aria-label="Retour">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="text-sm font-medium text-[#3899aa]">Nouveau contrat de remplacement libéral</div>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-[#3899aa] transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Zone question : taille fixe, contenu animé */}
        <div className={`flex-1 min-h-0 ${current === 'PREVIEW' ? 'overflow-hidden px-4 py-4 flex flex-col' : 'overflow-y-auto px-6 py-8'}`}>
          <div key={current} className={`${animClass} ${current === 'PREVIEW' ? 'h-full flex flex-col min-h-0' : ''}`}>
            {/* ===================== CONTRACT_TYPE ===================== */}
            {current === 'CONTRACT_TYPE' && (
              <div className="space-y-6 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel type de contrat souhaitez-vous créer ?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => pickContractType('REMPLACEMENT_LIBERAL')}
                    className={`p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${contractType === 'REMPLACEMENT_LIBERAL' ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                  >
                    <FileText className="h-5 w-5 text-[#3899aa] mb-2" />
                    <div className="font-semibold">Remplacement</div>
                    <p className="text-xs text-muted-foreground mt-1">Contrat de remplacement libéral entre kinésithérapeutes</p>
                  </button>
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    className="p-5 rounded-xl border-2 border-dashed border-border/60 text-left opacity-60 cursor-not-allowed relative"
                  >
                    <span className="absolute top-2 right-2 text-[10px] font-medium uppercase tracking-wide text-[#3899aa] bg-[#3899aa]/10 rounded-full px-2 py-0.5">
                      Bientôt disponible
                    </span>
                    <Building2 className="h-5 w-5 text-[#3899aa] mb-2" />
                    <div className="font-semibold">Assistanat</div>
                    <p className="text-xs text-muted-foreground mt-1">Contrat d'assistanat libéral entre kinésithérapeutes</p>
                  </button>
                </div>
              </div>
            )}

            {/* ===================== ROLE ===================== */}
            {current === 'ROLE' && (
              <div className="space-y-6 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel est votre rôle dans ce contrat ?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => pickRole('TITULAIRE')}
                    className={`p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${roleInitiateur === 'TITULAIRE' ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                  >
                    <Building2 className="h-5 w-5 text-[#3899aa] mb-2" />
                    <div className="font-semibold">Titulaire</div>
                    <p className="text-xs text-muted-foreground mt-1">Je cherche à me faire remplacer dans mon cabinet</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => pickRole('REMPLACANT_OU_ASSISTANT')}
                    className={`p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${roleInitiateur === 'REMPLACANT_OU_ASSISTANT' ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                  >
                    <MapPin className="h-5 w-5 text-[#3899aa] mb-2" />
                    <div className="font-semibold">Remplaçant</div>
                    <p className="text-xs text-muted-foreground mt-1">Je vais remplacer un titulaire dans son cabinet</p>
                  </button>
                </div>
              </div>
            )}

            {/* ===================== DESTINATAIRE_PICK ===================== */}
            {current === 'DESTINATAIRE_PICK' && (
              <div className="space-y-5 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold text-center">Avec quel kiné établissez-vous ce contrat ?</h2>
                {loadingContacts ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    {contacts.length >= 5 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Rechercher un contact..."
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          className="pl-9 h-9"
                        />
                      </div>
                    )}
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNewContactMode(true);
                          setDirection('forward');
                          // setCurrentKey direct car la liste se met à jour en parallèle et DESTINATAIRE_NEW devient visible
                          setTimeout(() => setCurrentKey('DESTINATAIRE_NEW'), 120);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed text-left hover:border-[#3899aa]/40 transition-all"
                      >
                        <UserPlus className="h-5 w-5 text-[#3899aa] shrink-0" />
                        <div className="font-medium text-sm">Ajouter un nouveau contact</div>
                      </button>
                      {filteredContacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Aucun contact trouvé</p>
                      ) : (
                        filteredContacts.map(c => (
                          <div
                            key={c.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => pickContact(c.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickContact(c.id); } }}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01] cursor-pointer ${selectedContactId === c.id ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                          >
                            <User className="h-5 w-5 text-[#3899aa] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{c.firstName} {c.lastName}</div>
                              <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                            </div>
                            {selectedContactId === c.id && <Check className="h-4 w-4 text-[#3899aa]" />}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); startEditContact(c); }}
                              aria-label="Modifier le contact"
                              className="p-1.5 rounded-md text-muted-foreground hover:text-[#3899aa] hover:bg-[#3899aa]/10 transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===================== DESTINATAIRE_NEW ===================== */}
            {current === 'DESTINATAIRE_NEW' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">
                  {editingContactId !== null ? 'Modifier le contact' : 'Qui est votre destinataire ?'}
                </h2>
                <p className="text-sm text-muted-foreground text-center">
                  {editingContactId !== null
                    ? 'Mettez à jour les informations de votre contact.'
                    : 'Il complètera lui-même ses informations à la signature.'}
                </p>
                {editingContactId !== null && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setDeleteContactId(editingContactId)}
                      className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 px-2.5 py-1 rounded-md transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer ce contact
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  <Input
                    ref={(el) => { newContactRefs.current.firstName = el; }}
                    placeholder="Prénom"
                    value={newContact.firstName}
                    onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); newContactRefs.current.lastName?.focus(); } }}
                  />
                  <Input
                    ref={(el) => { newContactRefs.current.lastName = el; }}
                    placeholder="Nom"
                    value={newContact.lastName}
                    onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); newContactRefs.current.email?.focus(); } }}
                  />
                  <Input
                    ref={(el) => { newContactRefs.current.email = el; }}
                    type="email"
                    placeholder="Email"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) { e.preventDefault(); advance(); } }}
                  />
                </div>
              </div>
            )}

            {/* ===================== PROFILE_CIVILITE ===================== */}
            {current === 'PROFILE_CIVILITE' && (
              <div className="space-y-6 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Quelle est votre civilité ?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {(['M.', 'MME'] as Civilite[]).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pickCivilite(c)}
                      className={`p-6 rounded-xl border-2 text-center transition-all hover:scale-[1.02] ${profileForm.civilite === c ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                    >
                      <div className="font-semibold text-lg">{c === 'M.' ? 'Monsieur' : 'Madame'}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ===================== PROFILE_BIRTH_DATE ===================== */}
            {current === 'PROFILE_BIRTH_DATE' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Quelle est votre date de naissance ?</h2>
                <Input
                  ref={inputRef}
                  type="date"
                  value={profileForm.birthDate || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, birthDate: e.target.value })}
                  className="text-center text-lg h-12"
                />
              </div>
            )}

            {/* ===================== PROFILE_BIRTH_PLACE ===================== */}
            {current === 'PROFILE_BIRTH_PLACE' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Où êtes-vous né(e) ?</h2>
                <Input
                  ref={inputRef}
                  placeholder="Ville de naissance"
                  value={profileForm.birthPlace || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, birthPlace: e.target.value })}
                  className="text-center text-lg h-12"
                />
              </div>
            )}

            {/* ===================== PROFILE_DEPT_ORDRE ===================== */}
            {current === 'PROFILE_DEPT_ORDRE' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel est votre département d'affiliation à l'Ordre ?</h2>
                <Select value={profileForm.departementOrdre || ''} onValueChange={pickDeptOrdre}>
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Sélectionner un département..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {DEPARTEMENTS_FR.map(d => (
                      <SelectItem key={d.code} value={d.code}>{d.code} — {d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ===================== PROFILE_NUM_ORDINAL ===================== */}
            {current === 'PROFILE_NUM_ORDINAL' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel est votre numéro ordinal ?</h2>
                <Input
                  ref={inputRef}
                  placeholder="Ex: 012345"
                  value={profileForm.numeroOrdinal || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, numeroOrdinal: e.target.value })}
                  className="text-center text-lg h-12"
                />
              </div>
            )}

            {/* ===================== PROFILE_ADRESSE ===================== */}
            {current === 'PROFILE_ADRESSE' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">
                  {roleInitiateur === 'TITULAIRE' ? 'Quelle est l\'adresse de votre cabinet ?' : 'Quelle est votre adresse de domicile ?'}
                </h2>
                <Input
                  ref={inputRef}
                  placeholder="N°, rue, code postal, ville"
                  value={(roleInitiateur === 'TITULAIRE' ? profileForm.adresseCabinet : profileForm.adresseDomicile) || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProfileForm(p => roleInitiateur === 'TITULAIRE' ? { ...p, adresseCabinet: v } : { ...p, adresseDomicile: v });
                  }}
                  className="h-12 text-base"
                />
              </div>
            )}

            {/* ===================== M_DATE_DEBUT ===================== */}
            {current === 'M_DATE_DEBUT' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Date de début du remplacement ?</h2>
                <Input
                  ref={inputRef}
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="text-center text-lg h-12"
                />
              </div>
            )}

            {/* ===================== M_DATE_FIN ===================== */}
            {current === 'M_DATE_FIN' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Date de fin du remplacement ?</h2>
                <Input
                  ref={inputRef}
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="text-center text-lg h-12"
                />
              </div>
            )}

            {/* ===================== M_RETROCESSION ===================== */}
            {current === 'M_RETROCESSION' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel % d'honoraires sera rétrocédé au remplaçant ?</h2>
                <div className="flex items-center gap-2 max-w-[200px] mx-auto">
                  <Input
                    ref={inputRef}
                    type="number"
                    min={0}
                    max={100}
                    value={retrocession}
                    onChange={(e) => setRetrocession(Number(e.target.value))}
                    className="text-center text-2xl h-14 font-semibold"
                  />
                  <span className="text-2xl font-semibold text-muted-foreground">%</span>
                </div>
              </div>
            )}

            {/* ===================== M_INDEMNITES ===================== */}
            {current === 'M_INDEMNITES' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel % des indemnités de déplacement va au remplaçant ?</h2>
                <div className="flex items-center gap-2 max-w-[200px] mx-auto">
                  <Input
                    ref={inputRef}
                    type="number"
                    min={0}
                    max={100}
                    value={indemnites}
                    onChange={(e) => setIndemnites(Number(e.target.value))}
                    className="text-center text-2xl h-14 font-semibold"
                  />
                  <span className="text-2xl font-semibold text-muted-foreground">%</span>
                </div>
              </div>
            )}

            {/* ===================== M_BALNEO_TOGGLE ===================== */}
            {current === 'M_BALNEO_TOGGLE' && (
              <div className="space-y-6 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Avez-vous une balnéothérapie ?</h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => pickBalneo(false)}
                    className={`p-5 rounded-xl border-2 text-center transition-all hover:scale-[1.02] ${!balneoActive && current === 'M_BALNEO_TOGGLE' ? 'border-border' : 'border-border hover:border-[#3899aa]/40'}`}
                  >
                    <div className="font-semibold">Non</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => pickBalneo(true)}
                    className={`p-5 rounded-xl border-2 text-center transition-all hover:scale-[1.02] ${balneoActive ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                  >
                    <div className="font-semibold">Oui</div>
                  </button>
                </div>
              </div>
            )}

            {/* ===================== M_BALNEO_PERCENT ===================== */}
            {current === 'M_BALNEO_PERCENT' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">% des suppléments balnéo au remplacé ?</h2>
                <div className="flex items-center gap-2 max-w-[200px] mx-auto">
                  <Input
                    ref={inputRef}
                    type="number"
                    min={0}
                    max={100}
                    value={balneoPercent}
                    onChange={(e) => setBalneoPercent(Number(e.target.value))}
                    className="text-center text-2xl h-14 font-semibold"
                  />
                  <span className="text-2xl font-semibold text-muted-foreground">%</span>
                </div>
              </div>
            )}

            {/* ===================== M_NON_INSTALL ===================== */}
            {current === 'M_NON_INSTALL' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Rayon de non-installation après remplacement ?</h2>
                <div className="flex items-center gap-2 max-w-[200px] mx-auto">
                  <Input
                    ref={inputRef}
                    type="number"
                    min={0}
                    value={nonInstall}
                    onChange={(e) => setNonInstall(Number(e.target.value))}
                    className="text-center text-2xl h-14 font-semibold"
                  />
                  <span className="text-2xl font-semibold text-muted-foreground">km</span>
                </div>
              </div>
            )}

            {/* ===================== M_LIEU_SIGN ===================== */}
            {current === 'M_LIEU_SIGN' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Ville de signature du contrat ?</h2>
                <Input
                  ref={inputRef}
                  placeholder="Ville"
                  value={lieuSign}
                  onChange={(e) => setLieuSign(e.target.value)}
                  className="text-center text-lg h-12"
                />
              </div>
            )}

            {/* ===================== PREVIEW ===================== */}
            {current === 'PREVIEW' && (
              <div className="space-y-3 h-full flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold flex items-center gap-2"><Eye className="h-4 w-4 text-[#3899aa]" /> Aperçu du contrat</h2>
                  <div className="flex items-center gap-2">
                    {previewUrl && !isMobile && (
                      <>
                        <span className="text-xs text-red-500 font-medium hidden md:inline">
                          L'autre kiné remplira lui-même ses informations avant signature
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewFullscreen(true)}
                          className="h-8"
                        >
                          <Maximize2 className="h-3.5 w-3.5 mr-1" /> Plein écran
                        </Button>
                      </>
                    )}
                    {signed && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300">
                        Signé par vous
                      </Badge>
                    )}
                  </div>
                </div>
                {signed && (
                  <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-2 text-xs text-green-900 dark:text-green-100">
                    <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>Signature enregistrée. Envoyez le contrat au destinataire depuis <strong>Mes contrats</strong>.</div>
                  </div>
                )}
                {previewLoading && (
                  <div className="flex flex-col items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-[#3899aa] mb-2" />
                    <p className="text-sm text-muted-foreground">Génération de l'aperçu...</p>
                  </div>
                )}
                {previewError && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-900 dark:text-amber-100">{previewError}</div>
                  </div>
                )}
                {previewUrl && (
                  isMobile ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#3899aa]/30 rounded-lg p-6 text-center">
                      <FileText className="h-10 w-10 text-[#3899aa]" />
                      <p className="text-sm text-muted-foreground">Ouvrez l'aperçu PDF en plein écran pour le relire.</p>
                      <Button type="button" onClick={() => setPreviewFullscreen(true)} className="btn-teal">
                        <Maximize2 className="h-4 w-4 mr-1" /> Ouvrir l'aperçu PDF
                      </Button>
                    </div>
                  ) : (
                    <iframe src={previewUrl} title="Aperçu PDF contrat" className="w-full flex-1 min-h-[300px] border rounded-lg" />
                  )
                )}
              </div>
            )}

            {/* ===================== POST_SIGN ===================== */}
            {current === 'POST_SIGN' && (
              <div className="space-y-6 max-w-md mx-auto text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                    <Check className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-xl font-semibold">Contrat signé !</h2>
                </div>

                {!invitationSent ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Voulez-vous l'envoyer dès maintenant à{' '}
                      <strong className="text-foreground">{destinataireFullName || 'votre destinataire'}</strong>
                      {destinataireEmail && <> (<span className="text-foreground">{destinataireEmail}</span>)</>} ?
                    </p>
                    {invitationError && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2 text-left">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-900 dark:text-amber-100">{invitationError}</div>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleFinish}
                        disabled={sendingInvitation}
                        className="w-full sm:w-auto"
                      >
                        Plus tard
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSendInvitation}
                        disabled={sendingInvitation || !destinataireEmail}
                        className="btn-teal w-full sm:w-auto"
                      >
                        {sendingInvitation
                          ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Envoi...</>
                          : <><Mail className="h-4 w-4 mr-1" /> Par mail</>}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-2 text-left">
                      <Send className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-green-900 dark:text-green-100">
                        Email envoyé à <strong>{destinataireEmail}</strong>. Le destinataire complétera ses informations et signera à son tour.
                      </div>
                    </div>
                    <Button type="button" onClick={handleFinish} className="btn-teal">Terminer</Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer adaptatif */}
        {!isAutoAdvance && current !== 'POST_SIGN' && (
          <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-muted/30">
            {current === 'PREVIEW' ? (
              signed ? (
                <Button onClick={handleFinish} className="btn-teal">Terminer</Button>
              ) : (
                <Button onClick={() => setSignOpen(true)} disabled={!previewUrl && !previewError} className="btn-teal">
                  <PenLine className="h-4 w-4 mr-1" /> Signer le contrat
                </Button>
              )
            ) : (
              <>
                <span className="text-xs text-muted-foreground hidden sm:inline">Appuyez sur ↵</span>
                <Button onClick={advance} disabled={!canAdvance || isPersisting} className="btn-teal">
                  {isPersisting
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> ...</>
                    : current === 'M_LIEU_SIGN'
                      ? <><FileText className="h-4 w-4 mr-1" /> Voir l'aperçu</>
                      : current === 'DESTINATAIRE_NEW' && editingContactId !== null
                        ? 'Enregistrer'
                        : 'Continuer'}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>

      <SignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        expectedName={initiatorFullName}
        title="Signer le contrat"
        description="Vous signez en tant qu'initiateur. Le contrat passera en statut 'Signé par vous' et pourra être envoyé au destinataire."
        onConfirm={handleSignConfirm}
        submitting={signing}
      />

      <AlertDialog open={deleteContactId !== null} onOpenChange={(o) => { if (!o && !deletingContact) setDeleteContactId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce contact ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. Le contact ne sera plus disponible lors de la création d'un nouveau contrat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingContact}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingContact}
              onClick={(e) => { e.preventDefault(); if (deleteContactId !== null) deleteContact(deleteContactId); }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deletingContact ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Suppression...</> : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewFullscreen} onOpenChange={setPreviewFullscreen}>
        <DialogContent className="!max-w-none !w-screen !h-screen !rounded-none p-0 flex flex-col gap-0 border-0">
          <div className="flex items-center px-4 py-3 border-b bg-background">
            <div className="text-sm font-medium text-[#3899aa] flex items-center gap-2">
              <Eye className="h-4 w-4" /> Aperçu du contrat
            </div>
          </div>
          {previewUrl && (
            <iframe src={previewUrl} title="Aperçu PDF contrat plein écran" className="flex-1 w-full" />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
