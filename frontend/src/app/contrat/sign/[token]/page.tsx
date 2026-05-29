'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth } from '@/lib/firebase/config';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ArrowLeft, ArrowRight,
  Loader2, AlertCircle, Eye, Check, PenLine, Download, ExternalLink, Maximize2, FileText
} from 'lucide-react';
import DestinataireProfileWizard, { DestinataireProfileData } from './components/DestinataireProfileWizard';
import IdentifyWelcome from './components/IdentifyWelcome';

type Step = 'LOADING' | 'ERROR' | 'IDENTIFY' | 'GUEST_TERMS' | 'LOGIN' | 'SIGNUP' | 'PROFILE' | 'PREVIEW' | 'SIGN' | 'DONE';
type Mode = 'EXISTING_KINE' | 'NEW_KINE' | 'GUEST';

interface PublicInfo {
  contractId: number;
  type: 'REMPLACEMENT_LIBERAL' | 'ASSISTANAT_LIBERAL';
  destinataireRole: 'TITULAIRE' | 'REMPLACANT_OU_ASSISTANT';
  initiator: { firstName: string; lastName: string };
  destinataireFirstName: string;
  destinataireEmail: string;
  hasExistingAccount: boolean;
  expiresAt: string;
}

interface DestProfile {
  firstName?: string; lastName?: string; email?: string;
  civilite?: 'M.' | 'MME' | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  departementOrdre?: string | null;
  numeroOrdinal?: string | null;
  numeroUrssaf?: string | null;
  adresseCabinet?: string | null;
  adresseDomicile?: string | null;
}

interface SessionContext {
  mode: Mode;
  contract: {
    id: number;
    type: string;
    roleInitiateur: string;
    status: string;
    data: Record<string, unknown>;
    destinataireFirstName: string;
    destinataireLastName: string;
    destinataireEmail: string;
    completedAt: string | null;
    initiatorSigned: boolean;
    destinataireSigned: boolean;
  };
  initiator: { firstName: string; lastName: string; email: string };
  destinataireProfile: DestProfile | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function normalize(s: string) {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

function profileIsComplete(p: DestProfile | null | undefined): boolean {
  if (!p) return false;
  const required: (keyof DestProfile)[] = ['civilite', 'birthDate', 'birthPlace', 'departementOrdre', 'numeroOrdinal'];
  // adresseCabinet OU adresseDomicile selon rôle, on demande les deux pour simplifier
  return required.every(k => !!p[k]);
}

export default function ContractSignPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>('LOADING');
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [publicInfo, setPublicInfo] = useState<PublicInfo | null>(null);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [context, setContext] = useState<SessionContext | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Acceptation CGU/PC en mode invité
  const [guestLegalAccepted, setGuestLegalAccepted] = useState(false);

  // Identifiants login/signup
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Profile form
  const [profile, setProfile] = useState<DestProfile>({});

  // Signature
  const [sigText, setSigText] = useState('');
  const [sigMention, setSigMention] = useState(false);
  const [sigHonor, setSigHonor] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Done
  const [completed, setCompleted] = useState(false);
  const [finalPdfUrl, setFinalPdfUrl] = useState<string | null>(null);
  const [finalPdfLoading, setFinalPdfLoading] = useState(false);
  const [finalPdfError, setFinalPdfError] = useState<string | null>(null);

  // Fetch public info au montage
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/contract-access/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error || 'Lien invalide ou expiré');
          setStep('ERROR');
          return;
        }
        setPublicInfo(data.info);
        setStep('IDENTIFY');
      } catch {
        setErrorMessage('Erreur réseau');
        setStep('ERROR');
      }
    })();
  }, [token]);

  // Cleanup blob url
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // Helper fetch avec session
  const sessionFetch = useCallback(async (path: string, init?: RequestInit) => {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
    });
  }, [sessionToken]);

  const loadContext = useCallback(async (tok: string) => {
    const res = await fetch(`${API_BASE}/api/contract-access/me/context`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMessage(data.error || 'Erreur chargement contrat');
      setStep('ERROR');
      return null;
    }
    setContext(data);
    // Pré-remplir le form profil avec les données actuelles
    if (data.destinataireProfile) {
      setProfile({
        ...data.destinataireProfile,
        birthDate: data.destinataireProfile.birthDate
          ? String(data.destinataireProfile.birthDate).slice(0, 10)
          : '',
      });
    }
    return data as SessionContext;
  }, []);

  // Identification finale → ouvre une session backend, route vers PROFILE ou PREVIEW
  const completeIdentify = useCallback(async (mode: Mode, firebaseIdToken?: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/contract-access/${encodeURIComponent(token)}/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, firebaseIdToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Identification impossible');
        return;
      }
      setSessionToken(data.sessionToken);
      const ctx = await loadContext(data.sessionToken);
      if (!ctx) return;
      // Décider du step suivant
      if (mode === 'GUEST' && !profileIsComplete(ctx.destinataireProfile)) {
        setStep('PROFILE');
      } else if ((mode === 'EXISTING_KINE' || mode === 'NEW_KINE') && !profileIsComplete(ctx.destinataireProfile)) {
        setStep('PROFILE');
      } else {
        setStep('PREVIEW');
      }
    } catch {
      setAuthError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }, [token, loadContext]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, publicInfo?.destinataireEmail || '', authPassword);
      const idToken = await cred.user.getIdToken();
      await completeIdentify('EXISTING_KINE', idToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connexion impossible';
      setAuthError(msg.replace('Firebase: ', ''));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authPassword.length < 8) {
      setAuthError('Mot de passe : 8 caractères minimum');
      return;
    }
    if (authPassword !== authPasswordConfirm) {
      setAuthError('Les mots de passe ne correspondent pas');
      return;
    }
    setAuthSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, publicInfo?.destinataireEmail || '', authPassword);
      const idToken = await cred.user.getIdToken();
      await completeIdentify('NEW_KINE', idToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Création de compte impossible';
      setAuthError(msg.replace('Firebase: ', ''));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSaveProfile = async (overrideProfile?: DestinataireProfileData) => {
    setSubmitting(true);
    try {
      const p = overrideProfile ? { ...profile, ...overrideProfile } : profile;
      if (overrideProfile) setProfile(p);
      // Strip uniquement les champs attendus par le backend, on convertit null → '' pour rester schema-safe.
      // firstName/lastName ne sont utilisés côté backend qu'en mode GUEST (correction d'une erreur de
      // saisie de l'initiateur). En modes EXISTING_KINE/NEW_KINE ils sont ignorés.
      const payload = {
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        civilite: p.civilite || null,
        birthDate: p.birthDate || '',
        birthPlace: p.birthPlace || '',
        departementOrdre: p.departementOrdre || '',
        numeroOrdinal: p.numeroOrdinal || '',
        numeroUrssaf: p.numeroUrssaf || '',
        adresseCabinet: p.adresseCabinet || '',
        adresseDomicile: p.adresseDomicile || '',
      };
      const res = await sessionFetch('/api/contract-access/me/profile', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.details) && data.details.length > 0
          ? data.details.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join(' · ')
          : (data.error || 'Sauvegarde impossible');
        toast({ title: 'Données invalides', description: details, variant: 'destructive' });
        return;
      }
      await loadContext(sessionToken);
      setStep('PREVIEW');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    try {
      const res = await sessionFetch('/api/contract-access/me/preview-pdf');
      if (!res.ok) {
        if (res.status === 503) {
          setPreviewError('Aperçu PDF indisponible sur cet environnement.');
        } else {
          const data = await res.json().catch(() => ({}));
          setPreviewError(data.error || 'Erreur génération aperçu');
        }
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewError('Erreur réseau');
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl, sessionFetch]);

  // Auto-load preview quand on arrive sur l'étape
  useEffect(() => {
    if (step === 'PREVIEW' && sessionToken && !previewUrl && !previewLoading) {
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionToken]);

  const expectedSignName = useMemo(() => {
    if (!context) return '';
    return `${context.contract.destinataireFirstName} ${context.contract.destinataireLastName}`.trim();
  }, [context]);

  const sigMatches = useMemo(
    () => normalize(sigText) === normalize(expectedSignName) && expectedSignName.length > 0,
    [sigText, expectedSignName]
  );

  const handleSign = async () => {
    if (!sigMatches || !sigMention || !sigHonor) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        signatureText: sigText.trim(),
        mention: 'Lu et approuvé',
      };
      if (context?.mode === 'GUEST') {
        // Présence de l'objet legalAcceptance = signal d'acceptation. Les versions
        // sont remplies côté backend depuis legalVersions.js (source unique de vérité).
        payload.legalAcceptance = {};
      }
      const res = await sessionFetch('/api/contract-access/me/sign', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Signature impossible', variant: 'destructive' });
        return;
      }
      setCompleted(!!data.completed);
      setStep('DONE');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchFinalPdfUrl = useCallback(async () => {
    setFinalPdfLoading(true);
    setFinalPdfError(null);
    try {
      const res = await sessionFetch('/api/contract-access/me/final-pdf');
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'PDF_NOT_READY') {
          setFinalPdfError('Le PDF final est en cours de génération. Réessayez dans quelques secondes.');
        } else {
          setFinalPdfError(data.error || 'Erreur récupération PDF');
        }
        return;
      }
      setFinalPdfUrl(data.url);
    } catch {
      setFinalPdfError('Erreur réseau');
    } finally {
      setFinalPdfLoading(false);
    }
  }, [sessionFetch]);

  // Auto-fetch final URL quand on arrive sur DONE (si signé par les 2)
  useEffect(() => {
    if (step === 'DONE' && completed && !finalPdfUrl && !finalPdfLoading) {
      fetchFinalPdfUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, completed]);

  const handleDownloadFinal = async () => {
    if (finalPdfUrl) {
      window.open(finalPdfUrl, '_blank');
      return;
    }
    await fetchFinalPdfUrl();
  };

  const goToDashboard = () => {
    if (!context) return;
    if (context.mode === 'EXISTING_KINE' || context.mode === 'NEW_KINE') {
      router.push(`/dashboard/kine/home?welcome=contract&id=${context.contract.id}`);
    }
  };

  // ============================ RENDU ============================
  return (
    <div className="min-h-screen bg-white dark:bg-[#141414] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="Mon Assistant Kiné"
            width={44}
            height={44}
            className="rounded-full shrink-0 bg-white/15 p-0.5"
          />
          <div>
            <div className="font-bold text-white text-sm">Mon Assistant Kiné</div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col">
        {/* LOADING */}
        {step === 'LOADING' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#3899aa] mb-3" />
            <p className="text-sm text-muted-foreground">Vérification du lien...</p>
          </div>
        )}

        {/* ERROR */}
        {step === 'ERROR' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
            <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
            <h1 className="text-xl font-semibold mb-2">Lien invalide</h1>
            <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
            <p className="text-xs text-muted-foreground">
              Si vous pensez qu'il s'agit d'une erreur, demandez à l'initiateur du contrat de vous renvoyer un nouveau lien.
            </p>
          </div>
        )}

        {/* IDENTIFY */}
        {step === 'IDENTIFY' && publicInfo && (
          <IdentifyWelcome
            publicInfo={publicInfo}
            onPrimary={() => {
              setAuthError('');
              setStep(publicInfo.hasExistingAccount ? 'LOGIN' : 'SIGNUP');
            }}
            onGuest={() => {
              setGuestLegalAccepted(false);
              setStep('GUEST_TERMS');
            }}
          />
        )}

        {/* GUEST_TERMS */}
        {step === 'GUEST_TERMS' && publicInfo && (
          <div className="max-w-md mx-auto w-full space-y-4 card-hover rounded-2xl p-6">
            <Button variant="ghost" size="sm" type="button" onClick={() => setStep('IDENTIFY')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour
            </Button>
            <h2 className="font-semibold text-base">Avant de continuer</h2>
            <p className="text-sm text-muted-foreground">
              Pour signer ce contrat en tant qu'invité, vous devez accepter nos conditions applicables au périmètre de la signature et de la conservation du contrat.
            </p>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/40 transition-colors">
              <Checkbox
                checked={guestLegalAccepted}
                onCheckedChange={(c) => setGuestLegalAccepted(c === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                J'accepte les{' '}
                <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer" className="text-[#3899aa] underline">
                  Conditions Générales d'Utilisation
                </a>{' '}
                et la{' '}
                <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="text-[#3899aa] underline">
                  Politique de Confidentialité
                </a>
                .
              </span>
            </label>
            <Button
              onClick={() => completeIdentify('GUEST')}
              disabled={!guestLegalAccepted || submitting}
              className="w-full btn-teal"
            >
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Chargement...</> : 'Continuer'}
            </Button>
          </div>
        )}

        {/* LOGIN */}
        {step === 'LOGIN' && publicInfo && (
          <form onSubmit={handleLogin} className="max-w-md mx-auto w-full space-y-4 card-hover rounded-2xl p-6">
            <Button variant="ghost" size="sm" type="button" onClick={() => setStep('IDENTIFY')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour
            </Button>
            <h2 className="font-semibold text-base">Connexion à votre compte</h2>
            <div>
              <Label>Email</Label>
              <Input value={publicInfo.destinataireEmail} disabled />
            </div>
            <div>
              <Label htmlFor="login-pwd">Mot de passe</Label>
              <Input id="login-pwd" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
            </div>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <Button type="submit" disabled={authSubmitting || !authPassword} className="w-full btn-teal">
              {authSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Connexion...</> : 'Se connecter'}
            </Button>
          </form>
        )}

        {/* SIGNUP */}
        {step === 'SIGNUP' && publicInfo && (
          <form onSubmit={handleSignup} className="max-w-md mx-auto w-full space-y-4 card-hover rounded-2xl p-6">
            <Button variant="ghost" size="sm" type="button" onClick={() => setStep('IDENTIFY')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour
            </Button>
            <h2 className="font-semibold text-base">Créer votre compte gratuit</h2>
            <p className="text-xs text-muted-foreground">Votre email est vérifié automatiquement via ce lien.</p>
            <div>
              <Label>Email (verrouillé)</Label>
              <Input value={publicInfo.destinataireEmail} disabled />
            </div>
            <div>
              <Label htmlFor="signup-pwd">Mot de passe (8 caractères minimum)</Label>
              <Input id="signup-pwd" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="signup-pwd2">Confirmer le mot de passe</Label>
              <Input id="signup-pwd2" type="password" value={authPasswordConfirm} onChange={(e) => setAuthPasswordConfirm(e.target.value)} required />
            </div>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <Button type="submit" disabled={authSubmitting || !authPassword || !authPasswordConfirm} className="w-full btn-teal">
              {authSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Création...</> : 'Créer mon compte'}
            </Button>
          </form>
        )}

        {/* PROFILE */}
        {step === 'PROFILE' && context && publicInfo && (
          <DestinataireProfileWizard
            destinataireRole={publicInfo.destinataireRole}
            contractType={publicInfo.type}
            isGuest={context.mode === 'GUEST'}
            initialProfile={profile}
            initialFirstName={context.contract.destinataireFirstName}
            initialLastName={context.contract.destinataireLastName}
            submitting={submitting}
            onComplete={(p) => { handleSaveProfile(p); }}
            onBackToIdentify={() => {
              setAuthError('');
              setSessionToken('');
              setContext(null);
              setStep('IDENTIFY');
            }}
          />
        )}

        {/* PREVIEW */}
        {step === 'PREVIEW' && context && (
          <div className="card-hover rounded-2xl p-6 space-y-4 flex flex-col h-[calc(100vh-180px)] min-h-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-[#3899aa]" /> Aperçu du contrat
              </h2>
              <div className="flex items-center gap-2">
                {previewUrl && !isMobile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewFullscreen(true)}
                    className="h-8"
                  >
                    <Maximize2 className="h-3.5 w-3.5 mr-1" /> Plein écran
                  </Button>
                )}
              </div>
            </div>

            {previewLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#3899aa] mb-2" />
                <p className="text-sm text-muted-foreground">Génération de l'aperçu...</p>
              </div>
            )}
            {previewError && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-900 dark:text-amber-100">{previewError}</div>
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
                <iframe src={previewUrl} title="Aperçu contrat" className="w-full flex-1 min-h-[400px] border rounded-lg" />
              )
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('PROFILE')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Modifier mes infos
              </Button>
              <Button onClick={() => setStep('SIGN')} className="btn-teal" disabled={!previewUrl && !previewError}>
                <PenLine className="h-4 w-4 mr-1" /> Signer
              </Button>
            </div>
          </div>
        )}

        {/* SIGN */}
        {step === 'SIGN' && context && (
          <div className="max-w-md mx-auto w-full space-y-4 card-hover rounded-2xl p-6">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <PenLine className="h-4 w-4 text-[#3899aa]" /> Signature électronique
            </h2>
            <p className="text-sm text-muted-foreground">
              Saisissez exactement votre prénom et nom pour signer ce contrat.
            </p>
            <div>
              <Label htmlFor="sig">Votre signature</Label>
              <div className="text-xs text-muted-foreground mb-1">
                Attendu : <strong className="text-foreground">{expectedSignName}</strong>
              </div>
              <Input
                id="sig"
                value={sigText}
                onChange={(e) => setSigText(e.target.value)}
                placeholder={expectedSignName}
                autoComplete="off"
                className={sigText.length > 0 && !sigMatches ? 'border-red-400' : sigMatches ? 'border-green-500' : ''}
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <Checkbox checked={sigMention} onCheckedChange={(c) => setSigMention(!!c)} className="mt-0.5" />
              <span>Je déclare avoir lu et approuvé l'intégralité du contrat. La mention <strong>« Lu et approuvé »</strong> sera apposée.</span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <Checkbox checked={sigHonor} onCheckedChange={(c) => setSigHonor(!!c)} className="mt-0.5" />
              <span>Je certifie sur l'honneur être la personne nommée et signer en mon nom propre.</span>
            </label>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('PREVIEW')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour
              </Button>
              <Button onClick={handleSign} disabled={!sigMatches || !sigMention || !sigHonor || submitting} className="btn-teal">
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Signature...</> : <>Signer <Check className="h-4 w-4 ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* DONE */}
        {step === 'DONE' && context && (
          <>
            <div className="max-w-lg mx-auto w-full card-hover rounded-2xl p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center mx-auto">
                <Check className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold">Contrat signé !</h2>
              <p className="text-sm text-muted-foreground">
                {completed
                  ? 'Télécharger le contrat final ci-dessous'
                  : 'Votre signature est enregistrée. Le contrat sera complet une fois la deuxième signature apposée.'}
              </p>

              <div className="flex flex-col gap-2 mt-4">
                <Button onClick={handleDownloadFinal} className="btn-teal" disabled={finalPdfLoading || (!completed && !finalPdfUrl)}>
                  {finalPdfLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Chargement...</> : <><Download className="h-4 w-4 mr-1" /> Télécharger le PDF</>}
                </Button>
                {finalPdfError && (
                  <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 rounded p-2 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div>
                      {finalPdfError}
                      <button className="ml-2 underline" onClick={fetchFinalPdfUrl}>Réessayer</button>
                    </div>
                  </div>
                )}
                {(context.mode === 'EXISTING_KINE' || context.mode === 'NEW_KINE') && (
                  <Button variant="outline" onClick={goToDashboard}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Accéder à mon espace Mon Assistant Kiné
                  </Button>
                )}
              </div>

              {(context.mode === 'EXISTING_KINE' || context.mode === 'NEW_KINE') && (
                <p className="text-xs text-muted-foreground pt-2">
                  Vous retrouverez ce contrat dans <strong>Mes Contrats → Reçus</strong>.
                </p>
              )}
              {context.mode === 'GUEST' && (
                <p className="text-xs text-muted-foreground pt-2">
                  Vous avez signé en tant qu'invité. Conservez ce PDF, c'est votre seul exemplaire personnel.
                </p>
              )}
            </div>

            {/* Encart pub — invités uniquement */}
            {context.mode === 'GUEST' && (
              <div className="max-w-2xl mx-auto w-full mt-6 rounded-2xl border-2 border-[#3899aa]/30 bg-gradient-to-br from-[#3899aa]/5 to-transparent p-6 sm:p-8 space-y-5">
                <div className="flex items-start gap-4">
                  <Image
                    src="/logo.jpg"
                    alt="Mon Assistant Kiné"
                    width={48}
                    height={48}
                    className="rounded-full shrink-0 bg-white p-0.5"
                  />
                  <div>
                    <h3 className="font-semibold text-base sm:text-lg leading-tight">🎉 Tu viens de signer en 2 minutes</h3>
                    <p className="text-sm text-muted-foreground mt-1">ce qui prend habituellement 1h en méthode papier.</p>
                  </div>
                </div>

                <p className="text-sm font-medium">Mon Assistant Kiné, c'est aussi :</p>

                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#3899aa] shrink-0" />
                    <span>Bilans cliniques en 3 min — conformes NGAP</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#3899aa] shrink-0" />
                    <span>Aide à la décision clinique grâce à l'IA et 56 000+ études scientifiques</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#3899aa] shrink-0" />
                    <span>Création de programmes patients et suivi avec l'IA</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#3899aa] shrink-0" />
                    <span>Module administratif qui fait gagner du temps sur les tâches répétitives (courriers, démarches…)</span>
                  </li>
                </ul>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  +2h par semaine dégagées. 100h/an récupérées.<br />
                  Conçu par 2 kinés libéraux, pour des kinés.
                </p>

                <div className="rounded-lg bg-[#3899aa]/10 border border-[#3899aa]/30 px-3 py-2.5 text-xs text-[#1f5c6a] dark:text-[#4db3c5]">
                  <strong>Offre Pionnier</strong> — réservée aux 100 premiers inscrits.
                </div>

                <Button asChild className="btn-teal w-full sm:w-auto">
                  <a
                    href="https://www.monassistantkine.fr/?utm_source=contract&utm_medium=guest_signed&utm_campaign=destinataire_ad"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Découvrir Mon Assistant Kiné <ExternalLink className="h-4 w-4 ml-1" />
                  </a>
                </Button>
              </div>
            )}
          </>
        )}
      </main>

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
    </div>
  );
}
