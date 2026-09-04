'use client';

import React from 'react';
import { MoreVertical, Reply, Trash2 } from 'lucide-react';
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
  canDelete: boolean;
  onReply: (message: PionnierMessage) => void;
  onDelete: (id: number) => void;
  onZoom: (url: string) => void;
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default function MessageItem({ message, canDelete, onReply, onDelete, onZoom }: Props) {
  const time = new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    // data-message-id : sert d'ancre de scroll au separateur « Nouveaux messages »
    <article data-message-id={message.id} className="group flex gap-3 px-4 py-2 hover:bg-muted/40">
      {message.author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={message.author.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
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
        </div>

        {message.replyTo && (
          <div className="mt-1 border-l-2 border-[#3899aa]/40 pl-2 text-xs text-muted-foreground">
            <span className="font-medium">{message.replyTo.displayName}</span> · {message.replyTo.excerpt}
          </div>
        )}

        {message.body && <MessageBody body={message.body} />}

        {message.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.imageUrl}
            alt="Pièce jointe"
            onClick={() => onZoom(message.imageUrl as string)}
            className="mt-2 max-h-72 cursor-zoom-in rounded-lg border border-border object-contain"
          />
        )}
      </div>

      {/* Radix DropdownMenu : fermeture au clic exterieur, Echap, piege de focus et
          roles ARIA fournis par le composant maison deja present dans le projet. */}
      <div className="shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Actions sur le message"
            className="rounded p-1 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-[#3899aa]/40"
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => onReply(message)}>
              <Reply className="mr-2 h-3.5 w-3.5" /> Répondre
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem onSelect={() => onDelete(message.id)} className="text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
