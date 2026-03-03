'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wand2, Trash2, Send, Loader2, Lightbulb } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { ChatUpgradeHeader, ChatDisabledOverlay } from '@/components/ChatUpgradeHeader';
import { usePaywall } from '@/hooks/usePaywall';
import DOMPurify from 'dompurify';

interface ChatMessage {
  id: number;
  message: string;
  response: string;
  createdAt: string;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  enhanced?: boolean;
  confidence?: number;
}

export default function KineChatbotPage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<HistoryMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  // Hook paywall pour vérifier les permissions
  const { isLoading: paywallLoading, canAccessFeature, subscription } = usePaywall();
  
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastBotMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await loadHistory();
      } else {
        setIsLoadingHistory(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  useEffect(() => {
    if (isSending) {
      scrollToBottom();
    }
  }, [isSending]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
    }
  };

  const scrollToBotMessage = () => {
    if (messagesContainerRef.current && lastBotMessageRef.current) {
      lastBotMessageRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    }
  };

  const getAuthToken = async () => {
    const auth = getAuth(app);
    return await auth.currentUser?.getIdToken();
  };

  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/history-basique?days=5`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
        
        if (chatMessages.length === 0) {
          const chatHistory: HistoryMessage[] = [];
          data.history.reverse().forEach((chat: ChatMessage) => {
            chatHistory.push({
              role: 'user',
              content: chat.message,
              timestamp: chat.createdAt
            });
            chatHistory.push({
              role: 'assistant',
              content: chat.response,
              timestamp: chat.createdAt
            });
          });
          setChatMessages(chatHistory);
        }
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleAsk = async () => {
    if (!message.trim() || isSending) return;

    const userMessage: HistoryMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };

    // Ajouter le message user + placeholder assistant vide
    const placeholderAssistant: HistoryMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage, placeholderAssistant]);
    const currentMessage = message;
    setMessage('');
    setIsSending(true);
    setIsStreaming(false);

    try {
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/chat/kine/ia-basique-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: currentMessage,
          conversationHistory: chatMessages.slice(-6).map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        })
      });

      if (!res.ok) {
        // Erreur avant le stream (401, 400, 500 JSON)
        const data = await res.json();
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: data.error || 'Erreur lors de la génération de la réponse'
          };
          return updated;
        });
        setIsSending(false);
        setTimeout(() => scrollToBotMessage(), 100);
        return;
      }

      // Parse SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const payload = JSON.parse(jsonStr);

              if (eventType === 'token') {
                setIsStreaming(true);
                accumulated += payload.content;
                const current = accumulated;
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: current
                  };
                  return updated;
                });
              } else if (eventType === 'done') {
                // Finaliser avec metadata
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: payload.message,
                    enhanced: payload.metadata?.enhanced,
                    confidence: payload.confidence
                  };
                  return updated;
                });
                // Recharger l'historique
                const refreshToken = await getAuthToken();
                const histRes = await fetch(`${API_BASE}/api/chat/kine/history-basique?days=5`, {
                  headers: { Authorization: `Bearer ${refreshToken}` }
                });
                const historyData = await histRes.json();
                if (historyData.success) {
                  setHistory(historyData.history);
                }
              } else if (eventType === 'error') {
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: payload.error || 'Erreur lors de la génération de la réponse'
                  };
                  return updated;
                });
              }
            } catch {
              // Ignorer les lignes JSON invalides
            }
            eventType = '';
          }
        }
      }

      setIsSending(false);
      setIsStreaming(false);
      setTimeout(() => scrollToBotMessage(), 100);

    } catch (error) {
      console.error('Erreur envoi message:', error);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Erreur lors de l'appel à l'assistant."
        };
        return updated;
      });
      setIsSending(false);
      setIsStreaming(false);
      setTimeout(() => scrollToBotMessage(), 100);
    }
  };

  const clearHistory = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tout l\'historique ?')) {
      return;
    }

    try {
      const token = await getAuthToken();
      
      const res = await fetch(`${API_BASE}/api/chat/kine/history-basique`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        console.error('Erreur suppression:', await res.text());
        return;
      }
      
      setHistory([]);
      setChatMessages([]);
    } catch (error) {
      console.error('Erreur suppression historique:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  // ✅ Attendre la fin du chargement des permissions avant d'afficher la page
  if (paywallLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Vérification de vos permissions...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 overflow-hidden">
        
        {/* Header Upgrade si pas d'accès */}
        <ChatUpgradeHeader 
          assistantType="CONVERSATIONNEL"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        />
        
        {/* Header */}
        <div className="mb-6">
          <div className="card-hover rounded-lg p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <Wand2 className="text-[#3899aa] h-7 w-7 shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold text-[#3899aa]">Assistant IA Personnel</h2>
                  <p className="text-foreground text-sm">Assistant IA avec base de connaissances spécialisée</p>
                </div>
              </div>
              <div className="relative group self-start sm:self-auto">
                <div className="flex items-center gap-2 bg-[#3899aa]/10 rounded-full px-3 py-1 cursor-default">
                  <Lightbulb className="w-4 h-4 text-[#3899aa]" />
                  <span className="text-sm text-foreground font-medium">Conseils</span>
                </div>
                <div className="absolute right-0 top-full mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="text-xs text-foreground space-y-3">
                    <div>
                      <p className="font-medium text-foreground mb-2">Idéal pour les questions simples et pratiques</p>
                      <p className="mb-2">Réponses courtes et directes pour votre pratique quotidienne.</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-2">Exemples de questions :</p>
                      <ul className="space-y-2 pl-2">
                        <li className="text-xs italic">&bull; &quot;Comment expliquer ce qu&apos;est une tendinopathie à un patient ?&quot;</li>
                        <li className="text-xs italic">&bull; &quot;Quels exercices simples pour renforcer le psoas ?&quot;</li>
                        <li className="text-xs italic">&bull; &quot;Comment organiser une séance de rééducation d&apos;épaule ?&quot;</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zone de chat principale */}
        <ChatDisabledOverlay
          assistantType="CONVERSATIONNEL"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        >
          <div>
            <div className="h-[calc(100vh-220px)] flex flex-col">

              <div
                ref={messagesContainerRef}
                className="flex-1 p-6 overflow-y-auto scroll-smooth scrollbar-hide"
                style={{
                  scrollBehavior: 'smooth',
                  overflowAnchor: 'none',
                  maskImage: 'linear-gradient(to bottom, transparent, black 32px, black calc(100% - 32px), transparent)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 32px, black calc(100% - 32px), transparent)'
                }}
              >
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                      <p className="text-muted-foreground">Chargement de votre conversation...</p>
                    </div>
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Wand2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground mb-2">
                        Commencez une conversation
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Posez vos questions - L'IA utilisera votre base de connaissances spécialisée
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {chatMessages.map((msg, index) => {
                      const isLastBotMessage = msg.role === 'assistant' &&
                        index === chatMessages.length - 1;

                      // Masquer le placeholder vide pendant le chargement (avant le 1er token)
                      if (isLastBotMessage && !msg.content && isSending && !isStreaming) {
                        return null;
                      }

                      return (
                        <div
                          key={index}
                          ref={isLastBotMessage ? lastBotMessageRef : undefined}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl ${
                              msg.role === 'user'
                                ? 'bubble-ai p-4 rounded-br-md'
                                : 'px-4 py-2 text-foreground'
                            }`}
                          >
                            <div className="prose prose-sm max-w-none">
                              <div
                                className="whitespace-pre-wrap text-justify pr-4 sm:pr-10"
                                dangerouslySetInnerHTML={{
                                  __html: DOMPurify.sanitize(msg.content
                                    .replace(/^### (.*$)/gim, '<strong class="text-base">$1</strong>')
                                    .replace(/^## (.*$)/gim, '<strong class="text-base">$1</strong>')
                                    .replace(/^# (.*$)/gim, '<strong class="text-lg">$1</strong>')
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                    .replace(/^- (.*$)/gim, '• $1')
                                    .replace(/^\d+\.\s+(.*$)/gim, '<strong>$1</strong>')
                                    .replace(/\n/g, '<br>'))
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {isSending && !isStreaming && (
                      <div className="flex justify-start">
                        <div className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            <span className="text-muted-foreground"><span className="hidden sm:inline">Recherche dans la base de connaissances...</span><span className="sm:hidden">Recherche en cours...</span></span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} className="h-1" />
                  </div>
                )}
              </div>

              <div className="p-4 w-1/2 mx-auto">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Posez votre question ici..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={isSending}
                      className="min-h-[44px]"
                    />
                  </div>
                  <Button
                    onClick={handleAsk}
                    disabled={isSending || !message.trim()}
                    size="icon"
                    className="min-h-[44px] min-w-[44px] btn-teal"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="text-[11px] text-red-400 mt-2 text-center">
                  L&apos;IA peut faire des erreurs, vérifiez les informations importantes.
                </p>

                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-foreground hidden sm:block">
                    Appuyez sur Entrée pour envoyer
                  </p>
                  {history.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearHistory}
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Effacer l&apos;historique
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ChatDisabledOverlay>
      </div>
    </AppLayout>
  );
}