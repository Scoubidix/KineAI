'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { getAuth } from 'firebase/auth';
import { ArrowLeft, Loader2, User, Check, Mail, Phone, Video, AlertCircle, Search, Calendar } from 'lucide-react';
import { createSeance, VisioChannel, VisioSeance } from '@/lib/visioApi';
import VisioDateTimePicker from './VisioDateTimePicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PatientOption {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

interface NouveauVisioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  existingSeances?: VisioSeance[];
}

type StepKey = 'PATIENT' | 'SCHEDULE' | 'CHANNEL' | 'PREREQS' | 'CONFIRM';

// ---------------------------------------------------------------------------
// Helper : validation mobile français (même règle que le backend)
// ---------------------------------------------------------------------------
function isMobileFR(phone: string | null | undefined): boolean {
  if (!phone) return false;
  // Supprimer espaces, points, tirets
  let n = phone.replace(/[\s.\-]/g, '');
  // Normaliser +33 → 0 et 0033 → 0
  if (n.startsWith('+33')) n = '0' + n.slice(3);
  if (n.startsWith('0033')) n = '0' + n.slice(4);
  return /^0[67]\d{8}$/.test(n);
}

// ---------------------------------------------------------------------------
// Les 5 conditions préalables
// ---------------------------------------------------------------------------
const PREREQ_ITEMS = [
  'Consultation physique préalable réalisée avec le patient',
  'Prescription médicale valide présente au dossier',
  'Séance compatible avec le télésoin (acte/motif éligible, pas de contre-indication à la distance)',
  'Patient équipé (matériel de vidéotransmission + connexion)',
  'Accord de principe du patient pour une séance à distance',
];

const STEPS: StepKey[] = ['PATIENT', 'SCHEDULE', 'CHANNEL', 'PREREQS', 'CONFIRM'];

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------
export default function NouveauVisioModal({ open, onOpenChange, onCreated, existingSeances = [] }: NouveauVisioModalProps) {
  const { toast } = useToast();

  // ----- Navigation stepper -----
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [currentKey, setCurrentKey] = useState<StepKey>('PATIENT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ----- Étape PATIENT -----
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);

  // ----- Étape SCHEDULE -----
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // ----- Étape CHANNEL -----
  const [channel, setChannel] = useState<VisioChannel | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  // ----- Étape PREREQS -----
  const [prereqsChecked, setPrereqsChecked] = useState(false);

  // ----- Refs -----
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scheduleRef = useRef<HTMLInputElement | null>(null);

  // ----- Index courant -----
  const currentIdx = STEPS.indexOf(currentKey);

  // ----- Reset à l'ouverture -----
  useEffect(() => {
    if (!open) return;
    setDirection('forward');
    setCurrentKey('PATIENT');
    setIsSubmitting(false);
    setSubmitError(null);
    setPatients([]);
    setPatientSearch('');
    setSelectedPatient(null);
    setScheduledAt('');
    setScheduleError(null);
    setChannel(null);
    setChannelError(null);
    setPrereqsChecked(false);
  }, [open]);

  // ----- Charger patients à l'ouverture -----
  useEffect(() => {
    if (!open) return;
    setLoadingPatients(true);
    (async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/kine/${user.uid}`);
        if (!res.ok) return;
        const data = await res.json();
        setPatients(Array.isArray(data) ? data : []);
      } catch {/* silent */}
      finally { setLoadingPatients(false); }
    })();
  }, [open]);

  // ----- Auto-focus -----
  useEffect(() => {
    const t = setTimeout(() => {
      if (currentKey === 'PATIENT') searchRef.current?.focus();
      else if (currentKey === 'SCHEDULE') scheduleRef.current?.focus();
    }, 180);
    return () => clearTimeout(t);
  }, [currentKey]);

  // ----- Validation par étape -----
  const canAdvance = useMemo(() => {
    switch (currentKey) {
      case 'PATIENT': return selectedPatient !== null;
      case 'SCHEDULE': return !!scheduledAt && !scheduleError;
      case 'CHANNEL': return channel !== null && !channelError;
      case 'PREREQS': return prereqsChecked;
      case 'CONFIRM': return true;
      default: return false;
    }
  }, [currentKey, selectedPatient, scheduledAt, scheduleError, channel, channelError, prereqsChecked]);

  // ----- Validation SCHEDULE -----
  const validateSchedule = useCallback((value: string) => {
    if (!value) { setScheduleError(null); return; }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) { setScheduleError('Date invalide'); return; }
    if (d <= new Date()) { setScheduleError('La date et l\'heure doivent être dans le futur'); return; }
    setScheduleError(null);
  }, []);

  // ----- Validation CHANNEL (feedback immédiat) -----
  const getChannelError = useCallback((ch: VisioChannel | null): string | null => {
    if (!ch || !selectedPatient) return null;
    if (ch === 'EMAIL') {
      if (!selectedPatient.email) return 'Ce patient n\'a pas d\'adresse email enregistrée. Ajoutez-en une depuis sa fiche.';
      return null;
    }
    if (ch === 'WHATSAPP') {
      if (!isMobileFR(selectedPatient.phone)) return 'Le numéro de téléphone du patient n\'est pas un mobile français (06 ou 07). Vérifiez sa fiche.';
      return null;
    }
    return null;
  }, [selectedPatient]);

  // Avance directement vers une étape (utilisé pour l'auto-avance au clic)
  const goForwardTo = useCallback((key: StepKey) => {
    setDirection('forward');
    setCurrentKey(key);
  }, []);

  const pickChannel = useCallback((ch: VisioChannel) => {
    setChannel(ch);
    const err = getChannelError(ch);
    setChannelError(err);
    // Canal valide → on avance direct (sinon on reste pour afficher l'erreur)
    if (!err) goForwardTo('PREREQS');
  }, [getChannelError, goForwardTo]);

  // Sélection d'un patient → passe directement à l'étape suivante (évite un clic)
  const handlePickPatient = useCallback((p: PatientOption) => {
    setSelectedPatient(p);
    goForwardTo('SCHEDULE');
  }, [goForwardTo]);

  // ----- Navigation -----
  const advance = useCallback(async () => {
    if (!canAdvance || isSubmitting) return;

    if (currentKey === 'CONFIRM') {
      // Soumission finale
      if (!selectedPatient || !scheduledAt || !channel) return;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        // Convertir datetime-local en ISO
        const iso = new Date(scheduledAt).toISOString();
        await createSeance({
          patientId: selectedPatient.id,
          scheduledAt: iso,
          deliveryChannel: channel,
          prereqsAttested: true,
        });
        const channelLabel = channel === 'EMAIL' ? 'email' : 'WhatsApp';
        toast({ title: `Lien envoyé par ${channelLabel}`, description: `Séance créée pour ${selectedPatient.firstName} ${selectedPatient.lastName}` });
        onCreated?.();
        onOpenChange(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Une erreur est survenue';
        setSubmitError(msg);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const nextIdx = currentIdx + 1;
    if (nextIdx >= STEPS.length) return;
    setDirection('forward');
    setCurrentKey(STEPS[nextIdx]);
  }, [canAdvance, isSubmitting, currentKey, currentIdx, selectedPatient, scheduledAt, channel, toast, onCreated, onOpenChange]);

  const goBack = useCallback(() => {
    if (isSubmitting) return;
    const prevIdx = currentIdx - 1;
    if (prevIdx < 0) return;
    setDirection('backward');
    setCurrentKey(STEPS[prevIdx]);
  }, [isSubmitting, currentIdx]);

  // Enter pour avancer
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Enter' && !e.shiftKey && canAdvance && !isSubmitting) {
        e.preventDefault();
        advance();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, canAdvance, isSubmitting, advance]);

  // ----- Patients filtrés -----
  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(p =>
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q)
    );
  }, [patients, patientSearch]);

  // ----- Doublon même patient / même jour (avertissement non bloquant) -----
  const duplicateSeance = useMemo(() => {
    if (!selectedPatient || !scheduledAt) return null;
    const d = new Date(scheduledAt);
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return (
      existingSeances.find((s) => {
        if (s.patient?.id !== selectedPatient.id) return false;
        if (s.status !== 'SCHEDULED' && s.status !== 'LIVE') return false;
        const sd = new Date(s.scheduledAt);
        return new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()).getTime() === key;
      }) ?? null
    );
  }, [selectedPatient, scheduledAt, existingSeances]);

  // ----- UI helpers -----
  const progress = ((currentIdx + 1) / STEPS.length) * 100;

  const animClass = direction === 'forward'
    ? 'animate-in slide-in-from-right-6 fade-in duration-200'
    : 'animate-in slide-in-from-left-6 fade-in duration-200';

  const stepLabels: Record<StepKey, string> = {
    PATIENT: 'Patient',
    SCHEDULE: 'Date et heure',
    CHANNEL: 'Canal d\'envoi',
    PREREQS: 'Conditions préalables',
    CONFIRM: 'Confirmation',
  };

  // Formater la datetime-local pour affichage
  const formatScheduledAt = (val: string) => {
    if (!val) return '';
    try {
      return new Date(val).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    } catch { return val; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl !h-[640px] !w-[95vw] !max-h-[90vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2 mb-3">
            {currentIdx > 0 && (
              <button
                onClick={goBack}
                disabled={isSubmitting}
                className="text-muted-foreground hover:text-foreground transition-colors -ml-1"
                aria-label="Retour"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="text-sm font-medium text-[#3899aa]">
              Nouveau rendez-vous de télésoin — {stepLabels[currentKey]}
            </div>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3899aa] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Zone de contenu animée */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
          <div key={currentKey} className={animClass}>

            {/* ===================== PATIENT ===================== */}
            {currentKey === 'PATIENT' && (
              <div className="space-y-5 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold text-center">Quel patient ?</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    placeholder="Rechercher un patient..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                {loadingPatients ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {filteredPatients.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucun patient trouvé</p>
                    ) : (
                      filteredPatients.map(p => (
                        <div
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handlePickPatient(p)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePickPatient(p); } }}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            selectedPatient?.id === p.id
                              ? 'border-[#3899aa] bg-[#3899aa]/5'
                              : 'border-border hover:border-[#3899aa]/40'
                          }`}
                        >
                          <User className="h-5 w-5 text-[#3899aa] shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{p.firstName} {p.lastName}</div>
                            <div className="text-xs text-muted-foreground flex gap-3">
                              {p.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>}
                              {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                            </div>
                          </div>
                          {selectedPatient?.id === p.id && <Check className="h-4 w-4 text-[#3899aa] shrink-0" />}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ===================== SCHEDULE ===================== */}
            {currentKey === 'SCHEDULE' && (
              <div className="space-y-5 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Date et heure de la séance ?</h2>
                <VisioDateTimePicker
                  initialValue={scheduledAt}
                  onChange={(v) => {
                    setScheduledAt(v);
                    validateSchedule(v);
                    // Créneau valide choisi → on avance direct vers le canal
                    if (v && new Date(v).getTime() > Date.now()) goForwardTo('CHANNEL');
                  }}
                />
                {scheduleError && (
                  <div className="flex items-center justify-center gap-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {scheduleError}
                  </div>
                )}
              </div>
            )}

            {/* ===================== CHANNEL ===================== */}
            {currentKey === 'CHANNEL' && (
              <div className="space-y-6 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold text-center">Par quel canal envoyer le lien ?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => pickChannel('EMAIL')}
                    className={`p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                      channel === 'EMAIL'
                        ? 'border-[#3899aa] bg-[#3899aa]/5'
                        : 'border-border hover:border-[#3899aa]/40'
                    }`}
                  >
                    <Mail className="h-5 w-5 text-[#3899aa] mb-2" />
                    <div className="font-semibold">Email</div>
                    {selectedPatient?.email
                      ? <p className="text-xs text-muted-foreground mt-1 truncate">{selectedPatient.email}</p>
                      : <p className="text-xs text-amber-600 mt-1">Pas d'email renseigné</p>
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => pickChannel('WHATSAPP')}
                    className={`p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                      channel === 'WHATSAPP'
                        ? 'border-[#3899aa] bg-[#3899aa]/5'
                        : 'border-border hover:border-[#3899aa]/40'
                    }`}
                  >
                    <Phone className="h-5 w-5 text-[#3899aa] mb-2" />
                    <div className="font-semibold">WhatsApp</div>
                    {selectedPatient?.phone
                      ? <p className="text-xs text-muted-foreground mt-1">{selectedPatient.phone}</p>
                      : <p className="text-xs text-amber-600 mt-1">Pas de téléphone renseigné</p>
                    }
                  </button>
                </div>
                {channelError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {channelError}
                  </div>
                )}
              </div>
            )}

            {/* ===================== PREREQS ===================== */}
            {currentKey === 'PREREQS' && (
              <div className="space-y-6 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold text-center">Conditions préalables au télésoin</h2>
                <ol className="space-y-3">
                  {PREREQ_ITEMS.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3899aa]/10 text-[#3899aa] text-xs font-semibold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-foreground leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ol>
                <div className="border-t pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <Checkbox
                      id="prereqs-attest"
                      checked={prereqsChecked}
                      onCheckedChange={(checked) => setPrereqsChecked(checked === true)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-sm font-medium group-hover:text-[#3899aa] transition-colors leading-relaxed">
                      J'atteste que les conditions préalables au télésoin sont réunies
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ===================== CONFIRM ===================== */}
            {currentKey === 'CONFIRM' && (
              <div className="space-y-6 max-w-md mx-auto">
                <h2 className="text-xl font-semibold text-center">Récapitulatif</h2>
                <div className="rounded-xl border bg-muted/30 divide-y">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <User className="h-4 w-4 text-[#3899aa] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Patient</div>
                      <div className="text-sm font-medium">
                        {selectedPatient?.firstName} {selectedPatient?.lastName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Calendar className="h-4 w-4 text-[#3899aa] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Date et heure</div>
                      <div className="text-sm font-medium">{formatScheduledAt(scheduledAt)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {channel === 'EMAIL'
                      ? <Mail className="h-4 w-4 text-[#3899aa] shrink-0" />
                      : <Phone className="h-4 w-4 text-[#3899aa] shrink-0" />
                    }
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Canal</div>
                      <div className="text-sm font-medium">
                        {channel === 'EMAIL' ? `Email — ${selectedPatient?.email}` : `WhatsApp — ${selectedPatient?.phone}`}
                      </div>
                    </div>
                  </div>
                </div>
                {duplicateSeance && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Ce patient a déjà une séance prévue le {formatScheduledAt(duplicateSeance.scheduledAt)}. Créer quand même&nbsp;?
                    </span>
                  </div>
                )}
                {submitError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {submitError}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-muted/30">
          <span className="text-xs text-muted-foreground hidden sm:inline">Appuie sur ↵</span>
          <Button
            onClick={advance}
            disabled={!canAdvance || isSubmitting}
            className="btn-teal"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Création...</>
            ) : currentKey === 'CONFIRM' ? (
              <><Video className="h-4 w-4 mr-1" /> Créer et envoyer le lien</>
            ) : (
              'Continuer'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
