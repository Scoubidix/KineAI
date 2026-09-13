'use client';

import React, { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, ChevronDown, Check } from 'lucide-react';
import { PaywallModal } from '@/components/PaywallModal';
import { usePaywall } from '@/hooks/usePaywall';
import { useToast } from '@/hooks/use-toast';
import PatientCombobox from './PatientCombobox';
import { createBilan, ApiError } from '@/utils/bilanApi';
import { BILAN_TYPE_COLORS, BILAN_TYPE_LABELS, type BilanRecord, type BilanType, type PatientSummary } from '@/types/bilan';

type StartMode = 'write' | 'dictation' | 'session';

interface BilanStartBlockProps {
  onStarted: (bilan: BilanRecord, mode: StartMode) => void;
}

const TYPES: BilanType[] = ['INITIAL', 'INTERMEDIAIRE', 'FINAL'];
const GATED_PLANS = ['FREE', 'DECLIC'];
// Drapeau d'activation de l'enregistrement de séance (levé une fois le run de référence validé)
const SESSION_ENABLED = process.env.NEXT_PUBLIC_SESSION_ENABLED === '1';

interface ModeDef {
  value: StartMode;
  emoji: string;
  title: string;
  subtitle: string;
  ariaLabel: string;
  /** Pastille carrée pastel, même facture que les actions rapides de l'accueil */
  badgeClass: string;
  badgeStyle?: React.CSSProperties;
  hoverClass: string;
  enabled: boolean;
}

const MODES: ModeDef[] = [
  {
    value: 'write',
    emoji: '✍️',
    title: 'Écrire',
    subtitle: 'Saisie guidée',
    ariaLabel: 'Rédiger le bilan en saisie guidée',
    badgeClass: 'bg-[#ecfdf5]',
    hoverClass: 'hover:border-[#3899aa]/60 hover:bg-[#3899aa]/5',
    enabled: true,
  },
  {
    value: 'dictation',
    emoji: '🎙️',
    title: 'Dicter',
    subtitle: 'L’IA rédige à ta voix',
    ariaLabel: 'Rédiger le bilan en dictée',
    // Dégradé du Copilote IA de l'accueil : c'est le mode où l'IA rédige
    badgeClass: '',
    badgeStyle: { background: 'linear-gradient(135deg, #dbeafe, #c4b5fd)' },
    hoverClass: 'hover:border-indigo-500/60 hover:bg-indigo-500/5',
    enabled: true,
  },
  {
    value: 'session',
    emoji: '🩺',
    title: 'Enregistrer la séance',
    subtitle: 'Bientôt disponible',
    ariaLabel: 'Enregistrer la séance (bientôt disponible)',
    badgeClass: 'bg-[#fffbeb]',
    hoverClass: 'hover:border-amber-500/60 hover:bg-amber-500/5',
    enabled: SESSION_ENABLED,
  },
];

// Composeur de bilan : réglages en pastilles (patient, type) puis les 3 modes de saisie,
// dans un seul panneau. Le clic sur un mode crée le brouillon.
export default function BilanStartBlock({ onStarted }: BilanStartBlockProps) {
  // usePaywall (JS non typé) infère subscription en `null` côté TS ; caste minimale locale
  // (même limitation préexistante que dans AppLayout.tsx, non traitée ici — hors périmètre).
  const { subscription } = usePaywall() as { subscription: { planType: string } | null };
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [type, setType] = useState<BilanType>('INITIAL');
  const [creating, setCreating] = useState<StartMode | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  // Même palette que les badges de type sur les cartes de brouillon
  const typeColor = BILAN_TYPE_COLORS[type];

  const handleStart = async (mode: StartMode) => {
    if (creating) return;
    if (subscription && GATED_PLANS.includes(subscription.planType)) { setPaywallOpen(true); return; }
    setCreating(mode);
    try {
      const bilan = await createBilan({ type, patientId: patient?.id ?? null });
      onStarted(bilan, mode);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PLAN_REQUIRED') setPaywallOpen(true);
      else toast({ title: 'Erreur', description: (e as Error).message || 'Impossible de créer le bilan', variant: 'destructive' });
      setCreating(null);
    }
    // Succès : on laisse `creating` posé, la navigation démonte le bloc
  };

  // Pas de carte autour : la pastille et son libellé forment l'élément cliquable
  const modeCard = (m: ModeDef) => {
    const busy = creating === m.value;
    const locked = !m.enabled;
    // Pendant une création, les autres modes sont neutralisés sans changer d'apparence
    const disabled = locked || (creating !== null && !busy);
    return (
      <button
        key={m.value}
        type="button"
        onClick={() => { if (!locked) handleStart(m.value); }}
        disabled={disabled}
        aria-busy={busy}
        aria-label={m.ariaLabel}
        title={locked ? 'Bientôt disponible' : undefined}
        className={`w-32 flex flex-col items-center gap-3 rounded-2xl px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3899aa] focus-visible:ring-offset-2 ${
          locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/60 disabled:opacity-60 disabled:hover:bg-transparent'
        }`}
      >
        <span
          aria-hidden="true"
          className={`w-24 h-24 shrink-0 rounded-3xl flex items-center justify-center text-5xl ${locked ? 'bg-muted grayscale' : m.badgeClass}`}
          style={locked ? undefined : m.badgeStyle}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin text-[#3899aa]" /> : m.emoji}
        </span>
        <span className="text-sm font-semibold text-center leading-tight">{busy ? 'Création…' : m.title}</span>
      </button>
    );
  };

  return (
    <div className="text-center">
      {/* Réglages en phrase : les valeurs sont les déclencheurs, pas des champs étiquetés */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-base text-muted-foreground">
        <span>Bilan</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Type de bilan : ${BILAN_TYPE_LABELS[type]}. Changer de type`}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3899aa] ${typeColor.bg} ${typeColor.text} ${typeColor.border}`}
            >
              {BILAN_TYPE_LABELS[type]}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setType(t)} className="text-sm">
                <Check className={`h-3.5 w-3.5 mr-2 ${type === t ? 'opacity-100 text-[#3899aa]' : 'opacity-0'}`} />
                {BILAN_TYPE_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span>pour</span>
        <PatientCombobox variant="inline" value={patient} onChange={setPatient} />
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-14 mt-7">
        {MODES.map(modeCard)}
      </div>

      <PaywallModal isOpen={paywallOpen} onClose={() => setPaywallOpen(false)} subscription={subscription} />
    </div>
  );
}
