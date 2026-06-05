'use client';

// Panneau interne de conversations du chat unifié (en PLUS de la sidebar AppLayout).
// Dépliable/refermable façon ChatGPT/Claude : liste, nouvelle conversation, renommer, supprimer.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import type { ConversationSummary } from '@/hooks/useConversations';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  isLoading: boolean;
  activeConversationId: number | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: number) => void;
  onNewConversation: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}

export function ConversationSidebar({
  conversations,
  isLoading,
  activeConversationId,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  onNewConversation,
  onRename,
  onDelete,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const startEditing = (conversation: ConversationSummary) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title || '');
  };

  const confirmEditing = () => {
    if (editingId !== null && editingTitle.trim()) {
      onRename(editingId, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: number) => {
    if (confirm('Supprimer cette conversation ?')) {
      onDelete(id);
    }
  };

  return (
    <div
      className={`flex flex-col border-r border-border/40 shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
        isCollapsed ? 'w-11' : 'w-60 sm:w-64 bg-muted/20'
      }`}
    >
      {isCollapsed ? (
        // Mode replié : colonne de boutons
        <div className="flex flex-col items-center gap-2 px-1.5 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8 text-muted-foreground"
            title="Ouvrir les conversations"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewConversation}
            className="h-8 w-8 text-muted-foreground"
            title="Nouvelle conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        // Mode déplié : largeur interne fixe pour éviter le reflow pendant la transition
        <div className="w-60 sm:w-64 flex flex-col flex-1 min-h-0">
          {/* Nouvelle conversation + replier */}
          <div className="flex items-center gap-1.5 px-2 pt-2">
            <Button
              variant="outline"
              onClick={onNewConversation}
              className="flex-1 justify-start h-9 text-sm rounded-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle conversation
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 shrink-0 text-muted-foreground"
              title="Replier"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-hide">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">
            Aucune conversation. Posez votre première question !
          </p>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                conversation.id === activeConversationId
                  ? 'bg-[#3899aa]/10 text-foreground'
                  : 'hover:bg-muted/60 text-muted-foreground'
              }`}
              onClick={() => editingId !== conversation.id && onSelect(conversation.id)}
            >
              {editingId === conversation.id ? (
                <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmEditing();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    maxLength={100}
                    autoFocus
                    className="h-7 text-xs px-2"
                  />
                  <Button variant="ghost" size="icon" onClick={confirmEditing} className="h-6 w-6 shrink-0">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(null)} className="h-6 w-6 shrink-0">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="flex-1 text-xs truncate" title={conversation.title || 'Nouvelle conversation'}>
                    {conversation.title || 'Nouvelle conversation'}
                  </span>
                  <div
                    className="hidden group-hover:flex items-center shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEditing(conversation)}
                      className="h-6 w-6 text-muted-foreground"
                      title="Renommer"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(conversation.id)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
          </div>
        </div>
      )}
    </div>
  );
}
