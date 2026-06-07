'use client';

// Bulle de message du chat unifié : rendu markdown léger sanitizé.
// Les URLs du texte sont cliquables (références biblio dans la réponse), comme sur
// l'ancienne page biblio. Les références/sources vivent dans le texte de la réponse.
import React from 'react';
import DOMPurify from 'dompurify';

export interface ChatUIMessage {
  role: 'user' | 'assistant';
  content: string;
  iaType?: 'basique' | 'biblio' | 'clinique' | null;
}

const renderMarkdown = (content: string) =>
  DOMPurify.sanitize(
    content
      .replace(/^### (.*$)/gim, '<strong class="text-base">$1</strong>')
      .replace(/^## (.*$)/gim, '<strong class="text-base">$1</strong>')
      .replace(/^# (.*$)/gim, '<strong class="text-lg">$1</strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*$)/gim, '• $1')
      .replace(/^\d+\.\s+(.*$)/gim, '<strong>$1</strong>')
      .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline hover:text-teal-800">$1</a>')
      .replace(/\n/g, '<br>'),
    { ADD_ATTR: ['target'] }
  );

export function MessageBubble({ message }: { message: ChatUIMessage }) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[95%] sm:max-w-[80%] rounded-2xl ${
          message.role === 'user' ? 'bubble-ai p-4 rounded-br-md' : 'px-4 py-2 text-foreground'
        }`}
      >
        <div className="prose prose-sm max-w-none">
          <div
            className="whitespace-pre-wrap text-justify pr-4 sm:pr-10"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        </div>
      </div>
    </div>
  );
}
