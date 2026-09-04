'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, MoreVertical, Pencil, Reply, Trash2, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import MessageBody from './MessageBody';
import type { PionnierMessage } from '@/hooks/usePionniersChat';

interface Props {
  message: PionnierMessage;
  /** L'auteur du message est-il le lecteur ? Seul lui peut modifier. */
  isOwn: boolean;
  canDelete: boolean;
  onReply: (message: PionnierMessage) => void;
  onEdit: (id: number, body: string, image: File | null, removeImage: boolean) => Promise<boolean>;
  onDelete: (id: number) => void;
  onZoom: (url: string) => void;
  /** Re-signe les medias du message : les URLs GCS expirent au bout d'une heure. */
  onRefreshMedia: (id: number) => void;
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/**
 * Horodatage facon Discord : l'heure seule pour un message du jour, la date seule
 * (JJ/MM/AAAA) sinon. Le salon a une retention illimitee — sans ca, un message
 * d'il y a trois semaines afficherait « 14:32 ».
 */
function formatTimestamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return sameDay
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function MessageItem({
  message, isOwn, canDelete, onReply, onEdit, onDelete, onZoom, onRefreshMedia,
}: Props) {
  const time = formatTimestamp(message.createdAt);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Image affichee pendant l'edition : la nouvelle si choisie, l'ancienne sinon,
  // rien si elle a ete retiree.
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  useEffect(() => {
    if (!newImage) { setNewImagePreview(null); return; }
    const url = URL.createObjectURL(newImage);
    setNewImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newImage]);

  const openEdit = () => {
    setDraft(message.body);
    setNewImage(null);
    setRemoveImage(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setNewImage(null);
    setRemoveImage(false);
    if (editFileRef.current) editFileRef.current.value = '';
  };

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  const keepsImage = Boolean(message.imageUrl) && !removeImage && !newImage;
  const hasAnyImage = keepsImage || Boolean(newImage);

  const save = async () => {
    const trimmed = draft.trim();
    if ((!trimmed && !hasAnyImage) || saving) return;

    setSaving(true);
    const ok = await onEdit(message.id, trimmed, newImage, removeImage);
    setSaving(false);
    if (ok) cancelEdit();
  };

  return (
    // data-message-id : sert d'ancre de scroll au separateur « Nouveaux messages »
    <article data-message-id={message.id} className="group flex gap-3 px-4 py-2 hover:bg-muted/40">
      {message.author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.author.avatarUrl}
          alt=""
          onError={() => onRefreshMedia(message.id)}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3899aa]/15 text-xs font-semibold text-[#3899aa]">
          {initialsOf(message.author.displayName)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-semibold ${message.author.isAdmin ? 'text-[#3899aa]' : 'text-foreground'}`}>
            {message.author.displayName}
          </span>
          {message.author.isAdmin && (
            <span className="rounded-full bg-[#3899aa]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#3899aa]">
              Équipe
            </span>
          )}
          <time className="text-[11px] text-muted-foreground" dateTime={message.createdAt}>{time}</time>
          {message.editedAt && (
            <span className="text-[11px] text-muted-foreground" title="Message modifié">(modifié)</span>
          )}
          {!editing && (
            // Repondre : action la plus frequente, donc directement accessible a
            // cote de l'heure plutot qu'enfouie dans le menu.
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label={`Répondre à ${message.author.displayName}`}
              title="Répondre"
              className="rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-[#3899aa] focus:outline-none focus:ring-2 focus:ring-[#3899aa]/40 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {message.replyTo && (
          <div className="mt-1 border-l-2 border-[#3899aa]/40 pl-2 text-xs text-muted-foreground">
            <span className="font-medium">{message.replyTo.displayName}</span> · {message.replyTo.excerpt}
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              ref={editInputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  save();
                }
              }}
              maxLength={4000}
              rows={2}
              aria-label="Modifier le message"
              className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3899aa]/40"
            />

            {(keepsImage || newImagePreview) && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={newImagePreview ?? (message.imageUrl as string)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {newImage ? newImage.name : 'Image actuelle'}
                </span>
                <button
                  type="button"
                  onClick={() => editFileRef.current?.click()}
                  aria-label="Remplacer l'image"
                  title="Remplacer"
                  className="rounded p-1 hover:bg-background"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewImage(null);
                    setRemoveImage(true);
                    if (editFileRef.current) editFileRef.current.value = '';
                  }}
                  aria-label="Retirer l'image"
                  title="Retirer"
                  className="rounded p-1 hover:bg-background"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {!keepsImage && !newImagePreview && (
              <button
                type="button"
                onClick={() => { setRemoveImage(false); editFileRef.current?.click(); }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <ImagePlus className="h-3.5 w-3.5" /> Ajouter une image
              </button>
            )}

            <input
              ref={editFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file) { setNewImage(file); setRemoveImage(false); }
              }}
            />

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || (!draft.trim() && !hasAnyImage)}
                className="rounded-md bg-[#3899aa] px-3 py-1 text-xs font-medium text-white hover:bg-[#2d7a88] disabled:opacity-40"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Annuler
              </button>
              <span className="text-[11px] text-muted-foreground">Échap pour annuler</span>
            </div>
          </div>
        ) : (
          <>
            {message.body && <MessageBody body={message.body} />}

            {message.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.imageUrl}
                alt="Pièce jointe"
                loading="lazy"
                onClick={() => onZoom(message.imageUrl as string)}
                // Une URL signee expiree renvoie 403 : on en redemande une fraiche
                // plutot que de laisser une icone cassee.
                onError={() => onRefreshMedia(message.id)}
                className="mt-2 max-h-72 cursor-zoom-in rounded-lg border border-border object-contain"
              />
            )}
          </>
        )}
      </div>

      {/* Menu : modifier (auteur seul) et supprimer (auteur ou admin). « Repondre »
          vit a cote de l'heure. Radix fournit clic exterieur, Echap, focus et ARIA. */}
      {!editing && (isOwn || canDelete) && (
        <div className="shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Actions sur le message"
              className="rounded p-1 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-[#3899aa]/40"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {isOwn && (
                <DropdownMenuItem onSelect={openEdit}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onSelect={() => onDelete(message.id)} className="text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </article>
  );
}
