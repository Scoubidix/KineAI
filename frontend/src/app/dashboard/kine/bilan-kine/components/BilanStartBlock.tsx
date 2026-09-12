'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, PenLine, Mic, Disc } from 'lucide-react';
import { PaywallModal } from '@/components/PaywallModal';
import { usePaywall } from '@/hooks/usePaywall';
import { useToast } from '@/hooks/use-toast';
import PatientCombobox from './PatientCombobox';
import { createBilan, ApiError } from '@/utils/bilanApi';
import { BILAN_TYPE_LABELS, type BilanRecord, type BilanType, type PatientSummary } from '@/types/bilan';

type StartMode = 'write' | 'dictation' | 'session';

interface BilanStartBlockProps {
  onStarted: (bilan: BilanRecord, mode: StartMode) => void;
}

const TYPES: BilanType[] = ['INITIAL', 'INTERMEDIAIRE', 'FINAL'];
const GATED_PLANS = ['FREE', 'DECLIC'];
// Drapeau d'activation de l'enregistrement de séance (levé une fois le run de référence validé)
const SESSION_ENABLED = process.env.NEXT_PUBLIC_SESSION_ENABLED === '1';

// Bloc de démarrage : patient (optionnel), type, mode de saisie, puis création du brouillon
export default function BilanStartBlock({ onStarted }: BilanStartBlockProps) {
  // usePaywall (JS non typé) infère subscription en `null` côté TS ; caste minimale locale
  // (même limitation préexistante que dans AppLayout.tsx, non traitée ici — hors périmètre).
  const { subscription } = usePaywall() as { subscription: { planType: string } | null };
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [type, setType] = useState<BilanType>('INITIAL');
  const [mode, setMode] = useState<StartMode>('write');
  const [creating, setCreating] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const handleStart = async () => {
    if (subscription && GATED_PLANS.includes(subscription.planType)) { setPaywallOpen(true); return; }
    setCreating(true);
    try {
      const bilan = await createBilan({ type, patientId: patient?.id ?? null });
      onStarted(bilan, mode);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PLAN_REQUIRED') setPaywallOpen(true);
      else toast({ title: 'Erreur', description: (e as Error).message || 'Impossible de créer le bilan', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const modeChip = (value: StartMode, icon: React.ReactNode, label: string, enabled: boolean) => (
    // `aria-disabled` plutôt que `disabled` : un bouton désactivé n'affiche pas son info-bulle native
    <button type="button" role="radio" aria-checked={mode === value} aria-disabled={!enabled} tabIndex={enabled ? 0 : -1} title={enabled ? undefined : 'Bientôt disponible'} onClick={() => { if (enabled) setMode(value); }}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${mode === value ? 'bg-[#3899aa] text-white border-[#3899aa]' : enabled ? 'bg-background text-foreground border-border hover:border-[#3899aa]/60' : 'bg-muted text-muted-foreground border-transparent opacity-60 cursor-not-allowed'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="rounded-xl border border-[#3899aa]/40 bg-gradient-to-b from-[#3899aa]/5 to-transparent p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-base text-[#3899aa] flex items-center gap-2"><Sparkles className="h-4 w-4" />Nouveau bilan</h3>
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-3">
        <span className="text-xs font-semibold text-muted-foreground">Patient</span>
        <PatientCombobox value={patient} onChange={setPatient} placeholder="Rechercher un patient (ou laisser vide)" />
        <span className="text-xs font-semibold text-muted-foreground">Type</span>
        <div className="inline-flex rounded-lg bg-muted p-1 gap-1 w-fit" role="radiogroup" aria-label="Type de bilan">
          {TYPES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${type === t ? 'bg-background text-[#3899aa] shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {BILAN_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">Mode</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode de saisie">
          {modeChip('write', <PenLine className="h-3.5 w-3.5" />, 'Écrire', true)}
          {modeChip('dictation', <Mic className="h-3.5 w-3.5" />, 'Dicter', true)}
          {modeChip('session', <Disc className="h-3.5 w-3.5" />, 'Enregistrer la séance', SESSION_ENABLED)}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleStart} disabled={creating} className="btn-teal rounded-full px-6 h-10">
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {mode === 'dictation' ? 'Dicter →' : mode === 'session' ? 'Enregistrer →' : 'Commencer →'}
        </Button>
      </div>
      <PaywallModal isOpen={paywallOpen} onClose={() => setPaywallOpen(false)} subscription={subscription} />
    </div>
  );
}
