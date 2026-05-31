'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { DEPARTEMENTS_FR } from '@/app/dashboard/kine/contrats/data/departements-fr';

type Civilite = 'M.' | 'MME';
type DestinataireRole = 'TITULAIRE' | 'REMPLACANT_OU_ASSISTANT';
type ContractType = 'REMPLACEMENT_LIBERAL' | 'ASSISTANAT_LIBERAL';

export interface DestinataireProfileData {
  firstName?: string | null;
  lastName?: string | null;
  civilite?: Civilite | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  departementOrdre?: string | null;
  numeroOrdinal?: string | null;
  numeroUrssaf?: string | null;
  adresseCabinet?: string | null;
  adresseDomicile?: string | null;
}

type QuestionKey =
  | 'IDENTITY_CONFIRM'
  | 'CIVILITE'
  | 'BIRTH_DATE'
  | 'BIRTH_PLACE'
  | 'DEPT_ORDRE'
  | 'NUM_ORDINAL'
  | 'NUM_URSSAF'
  | 'ADRESSE';

// Normalise un nom en majuscules sans accents (Müller → MULLER, Mélina → MELINA).
// On retire les marques diacritiques (combining marks U+0300–U+036F) avant l'uppercasing.
function toUpperNoAccent(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

interface Props {
  destinataireRole: DestinataireRole;
  contractType: ContractType;
  isGuest: boolean;
  initialProfile: DestinataireProfileData;
  initialFirstName?: string;
  initialLastName?: string;
  submitting: boolean;
  onComplete: (profile: DestinataireProfileData) => void;
  onBackToIdentify?: () => void;
}

export default function DestinataireProfileWizard({
  destinataireRole, contractType, isGuest, initialProfile, initialFirstName, initialLastName,
  submitting, onComplete, onBackToIdentify
}: Props) {
  const [profile, setProfile] = useState<DestinataireProfileData>({
    ...initialProfile,
    firstName: initialFirstName ?? initialProfile.firstName ?? '',
    // Le nom est toujours en MAJUSCULES sans accents — peu importe ce que l'initiateur a saisi.
    lastName: toUpperNoAccent(initialLastName ?? initialProfile.lastName ?? ''),
  });
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  // L'étape de confirmation d'identité n'est utile qu'en mode invité (le compte Kine est la source
  // de vérité dans les autres modes). Le numéro URSSAF n'est demandé que pour l'assistanat libéral
  // (sans utilité pour un simple remplacement).
  const QUESTIONS: QuestionKey[] = useMemo(() => {
    const base: QuestionKey[] = ['CIVILITE', 'BIRTH_DATE', 'BIRTH_PLACE', 'DEPT_ORDRE', 'NUM_ORDINAL'];
    if (contractType === 'ASSISTANAT_LIBERAL') base.push('NUM_URSSAF');
    base.push('ADRESSE');
    return isGuest ? ['IDENTITY_CONFIRM', ...base] : base;
  }, [isGuest, contractType]);

  const [currentKey, setCurrentKey] = useState<QuestionKey>(QUESTIONS[0]);

  const currentIdx = Math.max(0, QUESTIONS.indexOf(currentKey));
  const current: QuestionKey = QUESTIONS[currentIdx] ?? QUESTIONS[0];

  const adresseField: 'adresseCabinet' | 'adresseDomicile' =
    destinataireRole === 'TITULAIRE' ? 'adresseCabinet' : 'adresseDomicile';
  const adresseLabel =
    destinataireRole === 'TITULAIRE' ? 'Adresse de votre cabinet' : 'Adresse de votre domicile';

  const canAdvance = useMemo(() => {
    switch (current) {
      case 'IDENTITY_CONFIRM': return !!profile.firstName?.trim() && !!profile.lastName?.trim();
      case 'CIVILITE': return !!profile.civilite;
      case 'BIRTH_DATE': return !!profile.birthDate;
      case 'BIRTH_PLACE': return !!profile.birthPlace?.trim();
      case 'DEPT_ORDRE': return !!profile.departementOrdre;
      case 'NUM_ORDINAL': return !!profile.numeroOrdinal?.trim();
      case 'NUM_URSSAF': return true; // facultatif
      case 'ADRESSE': return !!profile[adresseField]?.trim();
      default: return false;
    }
  }, [current, profile, adresseField]);

  const isAutoAdvance = useMemo(
    () => ['CIVILITE', 'DEPT_ORDRE'].includes(current),
    [current]
  );

  const nextKeyFrom = useCallback((key: QuestionKey): QuestionKey | null => {
    const idx = QUESTIONS.indexOf(key);
    if (idx === -1 || idx >= QUESTIONS.length - 1) return null;
    return QUESTIONS[idx + 1];
  }, [QUESTIONS]);

  const prevKeyFrom = useCallback((key: QuestionKey): QuestionKey | null => {
    const idx = QUESTIONS.indexOf(key);
    if (idx <= 0) return null;
    return QUESTIONS[idx - 1];
  }, [QUESTIONS]);

  const advance = useCallback(() => {
    if (!canAdvance || submitting) return;
    if (current === 'ADRESSE') {
      onComplete(profile);
      return;
    }
    const next = nextKeyFrom(current);
    if (!next) return;
    setDirection('forward');
    setCurrentKey(next);
  }, [canAdvance, submitting, current, nextKeyFrom, onComplete, profile]);

  const goBack = useCallback(() => {
    if (submitting) return;
    const prev = prevKeyFrom(current);
    if (!prev) return;
    setDirection('backward');
    setCurrentKey(prev);
  }, [current, submitting, prevKeyFrom]);

  const autoNext = useCallback(() => {
    const next = nextKeyFrom(current);
    if (!next) return;
    setDirection('forward');
    setTimeout(() => setCurrentKey(next), 120);
  }, [current, nextKeyFrom]);

  const pickCivilite = (c: Civilite) => {
    setProfile(p => ({ ...p, civilite: c }));
    autoNext();
  };
  const pickDeptOrdre = (v: string) => {
    setProfile(p => ({ ...p, departementOrdre: v }));
    autoNext();
  };

  // Auto-focus à l'arrivée sur chaque question
  const inputRef = useRef<HTMLInputElement | null>(null);
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const lastNameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (current === 'IDENTITY_CONFIRM') {
        firstNameRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 180);
    return () => clearTimeout(t);
  }, [current]);

  // Enter pour avancer (sauf champs select et radio gérés au clic)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Si un onKeyDown interne (ex: focus next input dans IDENTITY_CONFIRM) a déjà géré l'évènement,
      // on ne déclenche pas advance() une seconde fois.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Enter' && !e.shiftKey && !isAutoAdvance && canAdvance && !submitting) {
        e.preventDefault();
        advance();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canAdvance, isAutoAdvance, submitting, advance]);

  const progress = ((currentIdx + 1) / QUESTIONS.length) * 100;
  const animClass = direction === 'forward'
    ? 'animate-in slide-in-from-right-6 fade-in duration-200'
    : 'animate-in slide-in-from-left-6 fade-in duration-200';

  return (
    <div className="card-hover rounded-2xl overflow-hidden flex flex-col h-[640px] max-h-[calc(100vh-160px)] w-full max-w-2xl mx-auto">
      {/* Header : titre + barre de progression */}
      <div className="px-6 pt-5 pb-3 border-b">
        <div className="flex items-center gap-2 mb-3">
          {currentIdx > 0 ? (
            <button
              onClick={goBack}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground transition-colors -ml-1"
              aria-label="Retour"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : onBackToIdentify ? (
            <button
              onClick={onBackToIdentify}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground transition-colors -ml-1"
              aria-label="Revenir au choix d'accès"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div className="text-sm font-medium text-[#3899aa]">
            Complétez vos informations
          </div>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3899aa] transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Zone question : taille fixe, contenu animé */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div key={current} className={animClass}>
          {/* ===================== IDENTITY_CONFIRM (mode invité) ===================== */}
          {current === 'IDENTITY_CONFIRM' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Vos informations sont elles correctes ?</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="dest-first-name" className="block text-center text-base font-semibold text-foreground">Prénom</label>
                  <Input
                    id="dest-first-name"
                    ref={firstNameRef}
                    placeholder="Prénom"
                    value={profile.firstName || ''}
                    onChange={e => setProfile({ ...profile, firstName: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        lastNameRef.current?.focus();
                      }
                    }}
                    className="text-center text-lg h-12"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="dest-last-name" className="block text-center text-base font-semibold text-foreground">Nom</label>
                  <Input
                    id="dest-last-name"
                    ref={lastNameRef}
                    placeholder="NOM"
                    value={profile.lastName || ''}
                    onChange={e => setProfile({ ...profile, lastName: toUpperNoAccent(e.target.value) })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canAdvance) {
                        e.preventDefault();
                        advance();
                      }
                    }}
                    autoCapitalize="characters"
                    className="text-center text-lg h-12 tracking-wide"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================== CIVILITE ===================== */}
          {current === 'CIVILITE' && (
            <div className="space-y-6 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Quelle est votre civilité ?</h2>
              <div className="grid grid-cols-2 gap-3">
                {(['M.', 'MME'] as Civilite[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pickCivilite(c)}
                    className={`p-6 rounded-xl border-2 text-center transition-all hover:scale-[1.02] ${profile.civilite === c ? 'border-[#3899aa] bg-[#3899aa]/5' : 'border-border hover:border-[#3899aa]/40'}`}
                  >
                    <div className="font-semibold text-lg">{c === 'M.' ? 'Monsieur' : 'Madame'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ===================== BIRTH_DATE ===================== */}
          {current === 'BIRTH_DATE' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Quelle est votre date de naissance ?</h2>
              <Input
                ref={inputRef}
                type="date"
                value={profile.birthDate || ''}
                onChange={e => setProfile({ ...profile, birthDate: e.target.value })}
                className="text-center text-lg h-12"
              />
            </div>
          )}

          {/* ===================== BIRTH_PLACE ===================== */}
          {current === 'BIRTH_PLACE' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Quel est votre lieu de naissance ?</h2>
              <Input
                ref={inputRef}
                placeholder="Ville"
                value={profile.birthPlace || ''}
                onChange={e => setProfile({ ...profile, birthPlace: e.target.value })}
                className="text-center text-lg h-12"
              />
            </div>
          )}

          {/* ===================== DEPT_ORDRE ===================== */}
          {current === 'DEPT_ORDRE' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Département d'affiliation à l'Ordre ?</h2>
              <Select value={profile.departementOrdre || ''} onValueChange={pickDeptOrdre}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Sélectionner un département..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {DEPARTEMENTS_FR.map(d => (
                    <SelectItem key={d.code} value={d.code}>{d.code} — {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ===================== NUM_ORDINAL ===================== */}
          {current === 'NUM_ORDINAL' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Quel est votre numéro ordinal ?</h2>
              <Input
                ref={inputRef}
                placeholder="Ex : 12345"
                value={profile.numeroOrdinal || ''}
                onChange={e => setProfile({ ...profile, numeroOrdinal: e.target.value })}
                className="text-center text-lg h-12"
              />
            </div>
          )}

          {/* ===================== NUM_URSSAF ===================== */}
          {current === 'NUM_URSSAF' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">Votre numéro URSSAF ?</h2>
              <p className="text-xs text-muted-foreground text-center">Facultatif — vous pouvez passer cette étape.</p>
              <Input
                ref={inputRef}
                placeholder="Numéro URSSAF (facultatif)"
                value={profile.numeroUrssaf || ''}
                onChange={e => setProfile({ ...profile, numeroUrssaf: e.target.value })}
                className="text-center text-lg h-12"
              />
            </div>
          )}

          {/* ===================== ADRESSE ===================== */}
          {current === 'ADRESSE' && (
            <div className="space-y-5 max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-center">{adresseLabel} ?</h2>
              <Input
                ref={inputRef}
                placeholder="Adresse complète"
                value={profile[adresseField] || ''}
                onChange={e => setProfile({ ...profile, [adresseField]: e.target.value })}
                className="text-center text-lg h-12"
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer adaptatif : caché si l'étape s'auto-advance */}
      {!isAutoAdvance && (
        <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-muted/30">
          <span className="text-xs text-muted-foreground hidden sm:inline">Appuyez sur ↵</span>
          <Button
            onClick={advance}
            disabled={!canAdvance || submitting}
            className="btn-teal"
          >
            {submitting && current === 'ADRESSE'
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sauvegarde...</>
              : current === 'ADRESSE' ? 'Valider' : 'Continuer'}
          </Button>
        </div>
      )}
    </div>
  );
}
