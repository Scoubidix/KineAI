'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, PenLine, Check } from 'lucide-react';

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expectedName: string; // ex: "Valentin JEAN" — la saisie doit matcher (insensible à casse/espaces)
  title?: string;
  description?: string;
  onConfirm: (signatureText: string, mention: string) => Promise<void> | void;
  submitting?: boolean;
}

const MENTION_DEFAULT = 'Lu et approuvé';

function normalize(s: string) {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

export default function SignatureDialog({
  open, onOpenChange, expectedName, title, description, onConfirm, submitting
}: SignatureDialogProps) {
  const [text, setText] = useState('');
  const [mentionChecked, setMentionChecked] = useState(false);
  const [honorChecked, setHonorChecked] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setMentionChecked(false);
      setHonorChecked(false);
    }
  }, [open]);

  const matches = useMemo(() => normalize(text) === normalize(expectedName) && expectedName.trim().length > 0, [text, expectedName]);
  const canSubmit = matches && mentionChecked && honorChecked && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    await onConfirm(text.trim(), MENTION_DEFAULT);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <PenLine className="h-5 w-5" />
            {title || 'Signer le contrat'}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="sig-text">Signez en écrivant votre nom complet</Label>
            <div className="text-xs text-muted-foreground mb-2">
              Saisissez exactement : <strong className="text-foreground">{expectedName}</strong>
            </div>
            <Input
              id="sig-text"
              name="contract-signature-fullname"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={expectedName}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              className={text.length > 0 && !matches ? 'border-red-400 focus-visible:ring-red-200' : matches ? 'border-green-500 focus-visible:ring-green-200' : ''}
            />
            {text.length > 0 && !matches && (
              <p className="text-xs text-red-600 mt-1">Le texte saisi ne correspond pas à votre nom complet.</p>
            )}
            {matches && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> Signature valide</p>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <Checkbox checked={mentionChecked} onCheckedChange={(c) => setMentionChecked(!!c)} className="mt-0.5" />
            <span>
              Je déclare avoir lu et approuvé l'intégralité du contrat. La mention <strong>« {MENTION_DEFAULT} »</strong> sera apposée avec ma signature.
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <Checkbox checked={honorChecked} onCheckedChange={(c) => setHonorChecked(!!c)} className="mt-0.5" />
            <span>
              Je certifie sur l'honneur être la personne nommée et signer en mon nom propre.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit} className="btn-teal">
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Signature...</> : <><PenLine className="h-4 w-4 mr-1" /> Signer</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
