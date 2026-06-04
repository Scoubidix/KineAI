'use client';

// Hook du chat unifié : envoi d'un message + parsing du flux SSE.
// Events backend : conversation_created, token, done, error. 429 = quota épuisé.
import { useCallback, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface DonePayload {
  conversationId: number;
  messageId: number;
  iaType: 'basique' | 'biblio' | 'clinique';
  ragUsed: boolean;
  sources: Array<{ title?: string; [key: string]: unknown }>;
  confidence: number | null;
  usage: { total_tokens?: number } | null;
  model: string;
  provider: string;
}

interface SendMessageParams {
  message: string;
  conversationId: number | null;
  onConversationCreated: (conversationId: number) => void;
  onToken: (delta: string) => void;
  onDone: (payload: DonePayload) => void;
  onError: (error: string) => void;
  onQuotaExceeded: (usage: { tokensUsed: number; limit: number }) => void;
}

export function useChatStream() {
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(
    async ({
      message,
      conversationId,
      onConversationCreated,
      onToken,
      onDone,
      onError,
      onQuotaExceeded,
    }: SendMessageParams) => {
      setIsSending(true);
      setIsStreaming(false);

      try {
        const auth = getAuth(app);
        const token = await auth.currentUser?.getIdToken();

        const res = await fetch(`${API_BASE}/api/chat/kine/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message,
            ...(conversationId ? { conversationId } : {}),
          }),
        });

        if (!res.ok) {
          // Erreur avant ouverture du stream (400/401/404/429/500 en JSON)
          const data = await res.json().catch(() => ({}));
          if (res.status === 429 && data.code === 'QUOTA_EXCEEDED') {
            onQuotaExceeded(data.usage);
          } else {
            onError(data.error || 'Erreur lors de la génération de la réponse');
          }
          return;
        }

        // Parsing SSE (même pattern que les pages chat existantes)
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventType = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const payload = JSON.parse(line.slice(6));

                if (eventType === 'conversation_created') {
                  onConversationCreated(payload.conversationId);
                } else if (eventType === 'token') {
                  setIsStreaming(true);
                  onToken(payload.content);
                } else if (eventType === 'done') {
                  onDone(payload as DonePayload);
                } else if (eventType === 'error') {
                  onError(payload.error || 'Erreur lors de la génération de la réponse');
                }
              } catch {
                // Ligne JSON invalide : ignorer
              }
              eventType = '';
            }
          }
        }
      } catch (error) {
        console.error('Erreur envoi message:', error);
        onError("Erreur lors de l'appel à l'assistant.");
      } finally {
        setIsSending(false);
        setIsStreaming(false);
      }
    },
    []
  );

  return { sendMessage, isSending, isStreaming };
}
