'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PionnierMessage } from '@/hooks/usePionniersChat';

interface Props {
  replyTo: PionnierMessage | null;
  onCancelReply: () => void;
  onSend: (body: string, image: File | null, replyToId: number | null) => Promise<boolean>;
}

const MAX_BODY_LENGTH = 4000;

/** Apercu textuel d'un message cite, y compris quand il ne porte qu'une image. */
function quotePreview(message: PionnierMessage) {
  const body = message.body.trim();
  if (body) return body.slice(0, 80);
  return message.imageUrl ? 'Image' : '';
}

export default function MessageComposer({ replyTo, onCancelReply, onSend }: Props) {
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Apercu local avant envoi. L'URL objet est revoquee au changement et au
  // demontage, sinon le blob reste en memoire tant que l'onglet est ouvert.
  useEffect(() => {
    if (!image) { setPreview(null); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const submit = async () => {
    const trimmed = body.trim();
    if ((!trimmed && !image) || sending) return;

    setSending(true);
    const ok = await onSend(trimmed, image, replyTo?.id ?? null);
    setSending(false);

    if (ok) {
      setBody('');
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
      onCancelReply();
    }
  };

  return (
    <div className="px-2 pb-2 sm:px-6">
      {replyTo && (
        <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Réponse à <span className="font-medium text-foreground">{replyTo.author.displayName}</span>
            {quotePreview(replyTo) && <> · {quotePreview(replyTo)}</>}
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Annuler la réponse">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {image && (
        <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
          )}
          <span className="min-w-0 flex-1 truncate">{image.name}</span>
          <button
            type="button"
            onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ''; }}
            aria-label="Retirer l'image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="relative flex items-center rounded-full border-2 border-border bg-white px-4 py-1 shadow-sm transition-all focus-within:border-[#3899aa]/60 focus-within:shadow-md dark:bg-card">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Joindre une image"
          className="mr-2 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />

        <Input
          aria-label="Message à envoyer au Groupe Pionniers"
          placeholder="Écris aux autres Pionniers"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // isComposing : ne pas envoyer quand Entree valide une saisie IME.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={sending}
          maxLength={MAX_BODY_LENGTH}
          className="min-h-[40px] border-0 bg-transparent px-0 shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        <Button
          onClick={submit}
          disabled={sending || (!body.trim() && !image)}
          size="icon"
          aria-label="Envoyer"
          className="btn-teal ml-2 h-8 w-8 shrink-0 rounded-full"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
