'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { isMobileFR } from '@/lib/phone';

interface QuickContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Champ à compléter */
  field: 'email' | 'phone';
  /** Pour le canal WhatsApp : impose un mobile FR (06/07) */
  requireMobileFR?: boolean;
  initialValue?: string;
  /** Titre / description contextuels (sinon valeurs par défaut selon field) */
  title?: string;
  description?: string;
  /**
   * Fournie par l'appelant : persiste la valeur ET reprend l'action initiale.
   * Si elle rejette → message inline, la modal reste ouverte.
   * Si elle résout → la modal se ferme.
   */
  onSave: (value: string) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mini-modal "compléter le contact manquant" : l'utilisateur saisit l'email ou le
 * téléphone absent, on enregistre, et l'action initiale (envoi WhatsApp, canal visio,
 * courrier…) reprend automatiquement. Composant pur : la persistance vit dans `onSave`.
 */
export default function QuickContactModal({
  open,
  onOpenChange,
  field,
  requireMobileFR = false,
  initialValue,
  title,
  description,
  onSave,
}: QuickContactModalProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Réinitialiser à chaque ouverture
  useEffect(() => {
    if (open) {
      setValue(initialValue ?? '');
      setError(null);
      setSaving(false);
    }
  }, [open, initialValue]);

  const isEmail = field === 'email';
  const trimmed = value.trim();

  const isValid = isEmail
    ? EMAIL_RE.test(trimmed)
    : requireMobileFR
      ? isMobileFR(trimmed)
      : trimmed.length > 0;

  const defaultTitle = isEmail ? 'Ajouter un email' : 'Ajouter un numéro de téléphone';
  const defaultDescription = isEmail
    ? "Ce patient n'a pas d'adresse email. Renseigne-la pour continuer l'envoi."
    : requireMobileFR
      ? "Ce patient n'a pas de mobile valide (06/07). Renseigne-le pour l'envoi WhatsApp."
      : "Ce patient n'a pas de numéro de téléphone. Renseigne-le pour continuer.";

  const invalidMsg = isEmail
    ? 'Saisis une adresse email valide.'
    : 'Saisis un numéro de mobile français (06 ou 07).';

  const handleSave = async () => {
    if (!isValid) {
      setError(invalidMsg);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(trimmed);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? defaultTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">{description ?? defaultDescription}</p>
          <Input
            type={isEmail ? 'email' : 'text'}
            inputMode={isEmail ? 'email' : 'tel'}
            value={value}
            onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && isValid && !saving) handleSave(); }}
            placeholder={isEmail ? 'patient@email.fr' : '06 12 34 56 78'}
            autoFocus
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button className="btn-teal" onClick={handleSave} disabled={!isValid || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer et continuer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
