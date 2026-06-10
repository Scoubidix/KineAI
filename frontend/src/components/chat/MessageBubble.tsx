'use client';

// Bulle de message du chat unifié : rendu markdown léger sanitizé.
// Les URLs du texte sont cliquables (références biblio dans la réponse), comme sur
// l'ancienne page biblio. Les références/sources vivent dans le texte de la réponse.
// Pour les réponses biblio, la section « Références » est repliée par défaut derrière
// un petit toggle pour ne pas encombrer l'écran.
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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

// Sépare la synthèse de la section « Références » des réponses biblio.
// Le prompt biblio impose le marqueur **Références** ; on tolère aussi un titre markdown
// (#, ##, ###) et l'absence d'accent. Retourne null si pas de section références détectée.
const splitReferences = (content: string): { body: string; refs: string } | null => {
  const match = content.match(/\n\s*(?:#{1,3}\s*)?\*{0,2}\s*Références?\s*\*{0,2}\s*(?:\n|$)/i);
  if (!match || match.index === undefined) return null;
  const body = content.slice(0, match.index).trimEnd();
  const refs = content.slice(match.index + match[0].length).trimStart();
  if (!refs) return null;
  return { body, refs };
};

const countReferences = (refs: string): number => (refs.match(/^\s*\(\d+\)/gm) || []).length;

// Marqueur « Références » en cours de frappe (préfixe incomplet) en fin de flux :
// permet de le masquer pendant le streaming avant que la section complète ne soit détectée.
const PARTIAL_REFS_MARKER = /\n\s*(?:#{1,3}\s*)?\*{0,2}\s*R(?:é(?:f(?:é(?:r(?:e(?:n(?:c(?:es?)?)?)?)?)?)?)?)?\s*$/i;

export function MessageBubble({ message, isStreaming = false }: { message: ChatUIMessage; isStreaming?: boolean }) {
  const [showRefs, setShowRefs] = useState(false);

  // Repli des références uniquement pour les réponses biblio de l'assistant
  const isBiblio = message.role === 'assistant' && message.iaType === 'biblio';
  const split = isBiblio ? splitReferences(message.content) : null;

  // Section complète détectée → synthèse seule. Sinon, pendant le streaming biblio,
  // on retire le marqueur « Références » en cours de frappe pour qu'il n'apparaisse pas.
  let bodyContent = split ? split.body : message.content;
  if (!split && isBiblio && isStreaming) {
    bodyContent = bodyContent.replace(PARTIAL_REFS_MARKER, '');
  }
  const refCount = split ? countReferences(split.refs) : 0;

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
            dangerouslySetInnerHTML={{ __html: renderMarkdown(bodyContent) }}
          />
        </div>

        {split && !isStreaming && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowRefs((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[#3899aa] hover:text-[#2d7a89] transition-colors"
              aria-expanded={showRefs}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showRefs ? 'rotate-180' : ''}`}
              />
              {refCount > 0 ? `Sources (${refCount})` : 'Sources'}
            </button>

            {showRefs && (
              <div className="prose prose-sm max-w-none mt-2 border-l-2 border-border/60 pl-3">
                <div
                  className="whitespace-pre-wrap text-justify text-sm text-muted-foreground pr-4 sm:pr-10"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(split.refs) }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
