'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wand2, Trash2, Send, Loader2, Lightbulb, Lock } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { PaywallModal } from '@/components/PaywallModal';
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
  isPreview?: boolean;
}

export default function KineChatbotPage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<HistoryMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Hook paywall pour la modal upgrade
  const { subscription } = usePaywall();
  
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastBotMessageRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

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

  // Tracker si l'utilisateur est proche du bas
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll seulement si l'utilisateur est déjà en bas
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [chatMessages]);

  useEffect(() => {
    if (isSending) {
      isNearBottomRef.current = true;
      scrollToBottom();
    }
  }, [isSending]);

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  const scrollToBotMessage = () => {
    const container = messagesContainerRef.current;
    const target = lastBotMessageRef.current;
    if (container && target) {
      const offsetTop = target.offsetTop - container.offsetTop;
      container.scrollTo({ top: offsetTop, behavior: 'smooth' });
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
              } else if (eventType === 'preview_end') {
                // Mode preview : marquer le message comme tronqué
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    isPreview: true
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

  return (
    <AppLayout>
      {/* Header compact collé à gauche sous le header principal */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/40">
        <Wand2 className="text-[#3899aa] h-4 w-4 shrink-0" />
        <h2 className="text-sm font-medium text-[#3899aa]">Assistant IA Personnel</h2>
        <div className="relative group">
          <div className="flex items-center gap-1.5 bg-[#3899aa]/10 rounded-full px-2.5 py-0.5 cursor-default">
            <Lightbulb className="w-3 h-3 text-[#3899aa]" />
            <span className="text-xs text-foreground font-medium">Conseils</span>
          </div>
          <div className="absolute left-0 top-full mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
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

      <div className="max-w-6xl mx-auto px-0 sm:px-4 py-0 sm:py-4 overflow-hidden">
          <div>
            <div className="h-[calc(100vh-180px)] flex flex-col">

              <div
                ref={messagesContainerRef}
                className="flex-1 px-2 py-4 sm:p-6 overflow-y-auto scroll-smooth scrollbar-hide"
                style={{
                  scrollBehavior: 'smooth',
                  overflowAnchor: 'none',
                  maskImage: 'linear-gradient(to bottom, transparent, black 32px)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 32px)'
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
                            className={`max-w-[95%] sm:max-w-[80%] rounded-2xl ${
                              msg.role === 'user'
                                ? 'bubble-ai p-4 rounded-br-md'
                                : 'px-4 py-2 text-foreground'
                            }`}
                          >
                            <div
                              className="prose prose-sm max-w-none"
                              style={msg.isPreview ? {
                                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
                              } : undefined}
                            >
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
                            {msg.isPreview && (
                              <div className="mt-3 pt-3 border-t border-border/40">
                                <Button
                                  onClick={() => setIsPaywallOpen(true)}
                                  className="btn-teal rounded-full text-sm h-9 px-4"
                                >
                                  <Lock className="h-3.5 w-3.5 mr-2" />
                                  Débloquer la réponse complète
                                </Button>
                              </div>
                            )}
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

              <div className="px-2 sm:px-6 pb-2 pt-0">
                <div className="relative flex items-center bg-white dark:bg-card border-2 border-border rounded-full px-4 py-1 shadow-sm focus-within:border-[#3899aa]/60 focus-within:shadow-md transition-all">
                  <Input
                    placeholder="Posez votre question ici..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSending}
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[40px] px-0 placeholder:text-muted-foreground/60"
                  />
                  <Button
                    onClick={handleAsk}
                    disabled={isSending || !message.trim()}
                    size="icon"
                    className="shrink-0 h-8 w-8 rounded-full btn-teal ml-2"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="flex justify-between items-center mt-1.5 px-2">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-red-400">L&apos;IA peut faire des erreurs.</span>
                    <span className="hidden sm:inline"> — Entrée pour envoyer</span>
                  </p>
                  {history.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearHistory}
                      className="h-5 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Effacer
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
      </div>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        subscription={subscription}
      />
    </AppLayout>
  );
}