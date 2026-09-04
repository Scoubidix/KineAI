'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, X, Loader2 } from 'lucide-react';
import type { PionnierMessage } from '@/hooks/usePionniersChat';

interface Props {
  replyTo: PionnierMessage | null;
  onCancelReply: () => void;
  onSend: (body: string, image: File | null, replyToId: number | null) => Promise<boolean>;
}

const MAX_BODY_LENGTH = 4000;

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
    <div className="border-t border-border bg-background p-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Réponse à <span className="font-medium">{replyTo.author.displayName}</span> · {replyTo.body.slice(0, 80)}
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Annuler la réponse">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {image && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
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

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Joindre une image"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          <ImagePlus className="h-5 w-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />

        <textarea
          value={body}
          aria-label="Message à envoyer au Groupe Pionniers"
          maxLength={MAX_BODY_LENGTH}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          placeholder="Écris aux autres Pionniers — sans donnée identifiant un patient"
          className="max-h-40 min-h-[38px] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3899aa]/40"
        />

        <button
          type="button"
          onClick={submit}
          disabled={sending || (!body.trim() && !image)}
          aria-label="Envoyer"
          className="rounded-md bg-[#3899aa] p-2 text-white transition-colors hover:bg-[#2d7a88] disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
