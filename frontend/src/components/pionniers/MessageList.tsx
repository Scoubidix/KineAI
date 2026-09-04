'use client';

import React from 'react';
import MessageItem from './MessageItem';
import type { PionnierMessage } from '@/hooks/usePionniersChat';

interface Props {
  messages: PionnierMessage[];
  firstUnreadId: number | null;
  currentKineId: number | null;
  isAdmin: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  onReply: (message: PionnierMessage) => void;
  onDelete: (id: number) => void;
  onZoom: (url: string) => void;
  onRefreshMedia: (id: number) => void;
  onEdit: (id: number, body: string, image: File | null, removeImage: boolean) => Promise<boolean>;
}

export default function MessageList({
  messages, firstUnreadId, currentKineId, isAdmin, hasMore,
  onLoadOlder, onReply, onDelete, onZoom, onRefreshMedia, onEdit,
}: Props) {
  return (
    <div className="flex flex-col">
      {hasMore && (
        <button
          type="button"
          onClick={onLoadOlder}
          className="mx-auto my-3 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Charger les messages plus anciens
        </button>
      )}

      {messages.map((message) => (
        <React.Fragment key={message.id}>
          {message.id === firstUnreadId && (
            <div className="my-2 flex items-center gap-2 px-4" aria-label="Nouveaux messages">
              <span className="h-px flex-1 bg-[#3899aa]/50" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#3899aa]">
                Nouveaux messages
              </span>
              <span className="h-px flex-1 bg-[#3899aa]/50" />
            </div>
          )}
          <MessageItem
            message={message}
            isOwn={message.author.id === currentKineId}
            canDelete={isAdmin || message.author.id === currentKineId}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onZoom={onZoom}
            onRefreshMedia={onRefreshMedia}
          />
        </React.Fragment>
      ))}
    </div>
  );
}
