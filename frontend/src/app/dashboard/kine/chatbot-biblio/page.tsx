'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { BookOpen, Trash2, Send, Loader2, Lightbulb, Search, X, Lock } from 'lucide-react';
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

export default function KineChatbotBiblioPage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<HistoryMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [phase, setPhase] = useState<'initial' | 'conversation'>('initial');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [researchQuery, setResearchQuery] = useState('');
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [showFullQuery, setShowFullQuery] = useState(false);

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
      const res = await fetch(`${API_BASE}/api/chat/kine/history-biblio?days=5`, {
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
          if (chatHistory.length > 0) {
            setPhase('conversation');
          }
        }
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  /** Helper SSE : lit un stream et met à jour le dernier message */
  const processSSEStream = async (res: Response, historyEndpoint: string) => {
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
          try {
            const payload = JSON.parse(line.slice(6));

            if (eventType === 'token') {
              setIsStreaming(true);
              accumulated += payload.content;
              const current = accumulated;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: current };
                return updated;
              });
            } else if (eventType === 'preview_end') {
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1], isPreview: true };
                return updated;
              });
            } else if (eventType === 'done') {
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
              const refreshToken = await getAuthToken();
              const histRes = await fetch(`${API_BASE}${historyEndpoint}`, {
                headers: { Authorization: `Bearer ${refreshToken}` }
              });
              const historyData = await histRes.json();
              if (historyData.success) setHistory(historyData.history);
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
          } catch { /* ignorer JSON invalide */ }
          eventType = '';
        }
      }
    }

    setIsSending(false);
    setIsStreaming(false);
    setTimeout(() => scrollToBotMessage(), 100);
  };

  /** Follow-up en streaming */
  const handleAsk = async () => {
    if (!message.trim() || isSending) return;

    const userMessage: HistoryMessage = { role: 'user', content: message.trim(), timestamp: new Date().toISOString() };
    const placeholder: HistoryMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages(prev => [...prev, userMessage, placeholder]);
    const currentMessage = message;
    setMessage('');
    setIsSending(true);
    setIsStreaming(false);

    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/ia-followup-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: currentMessage,
          conversationHistory: chatMessages.slice(-10).map(msg => ({ role: msg.role, content: msg.content })),
          sourceIa: 'biblio'
        })
      });

      if (!res.ok) {
        const data = await res.json();
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: data.error || 'Erreur' };
          return updated;
        });
        setIsSending(false);
        return;
      }

      await processSSEStream(res, '/api/chat/kine/history-biblio?days=5');
    } catch (error) {
      console.error('Erreur envoi message:', error);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: "Erreur lors de l'appel à l'assistant." };
        return updated;
      });
      setIsSending(false);
      setIsStreaming(false);
    }
  };

  /** Première recherche en streaming */
  const handleResearch = async () => {
    if (!researchQuery.trim() || isSending) return;

    // Effacer l'historique precedent
    if (chatMessages.length > 0) {
      try {
        const deleteToken = await getAuthToken();
        await fetch(`${API_BASE}/api/chat/kine/history-biblio`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${deleteToken}` }
        });
      } catch (error) {
        console.error('Erreur suppression historique:', error);
      }
      setHistory([]);
    }

    const userMessage: HistoryMessage = { role: 'user', content: researchQuery.trim(), timestamp: new Date().toISOString() };
    const placeholder: HistoryMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages([userMessage, placeholder]);
    const currentQuery = researchQuery;
    setResearchQuery('');
    setIsModalOpen(false);
    setPhase('conversation');
    setIsSending(true);
    setIsStreaming(false);

    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/ia-biblio-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: currentQuery, conversationHistory: [] })
      });

      if (!res.ok) {
        const data = await res.json();
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: data.error || 'Erreur' };
          return updated;
        });
        setIsSending(false);
        return;
      }

      await processSSEStream(res, '/api/chat/kine/history-biblio?days=5');
    } catch (error) {
      console.error('Erreur recherche biblio:', error);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: "Erreur lors de l'appel à l'assistant bibliographique." };
        return updated;
      });
      setIsSending(false);
      setIsStreaming(false);
    }
  };

  const handleNewResearch = () => {
    if (isSending) return;
    setResearchQuery('');
    setIsModalOpen(true);
  };

  const clearHistory = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tout l\'historique ?')) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/history-biblio`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { console.error('Erreur suppression:', await res.text()); return; }
      setHistory([]);
      setChatMessages([]);
      setPhase('initial');
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
      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 border-b border-border/40">
        <BookOpen className="text-[#3899aa] h-4 w-4 shrink-0" />
        <h2 className="text-sm font-medium text-[#3899aa]">IA Bibliographique</h2>
        <div className="relative group">
          <div className="flex items-center gap-1.5 bg-[#3899aa]/10 rounded-full px-2.5 py-0.5 cursor-default">
            <Lightbulb className="w-3 h-3 text-[#3899aa]" />
            <span className="text-xs text-foreground font-medium">Conseils</span>
          </div>
          <div className="absolute left-0 top-full mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="text-xs text-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground mb-2">Questions bibliographiques :</p>
                <ul className="space-y-1 pl-2">
                  <li>&bull; Recherche d&apos;études scientifiques</li>
                  <li>&bull; Méta-analyses et revues systématiques</li>
                  <li>&bull; Recommandations basées sur l&apos;évidence</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">Exemple optimisé :</p>
                <p className="text-xs italic">&quot;Quelles sont les dernières études sur l&apos;efficacité du renforcement excentrique dans la tendinopathie rotulienne chez le sportif ?&quot;</p>
              </div>
              <div className="pt-2 border-t border-border">
                <a
                  href="https://tally.so/r/mV25VJ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[#3899aa] hover:underline font-medium"
                >
                  <BookOpen className="h-3 w-3" />
                  Proposer une étude
                </a>
              </div>
            </div>
          </div>
        </div>
        <Button
          onClick={handleNewResearch}
          disabled={isSending}
          size="sm"
          className="h-7 px-3 text-xs btn-teal rounded-full"
        >
          <Search className="h-3 w-3 mr-1.5" />
          {phase === 'conversation' ? 'Nouvelle recherche' : 'Lancer une recherche'}
        </Button>
      </div>

      <div className="max-w-6xl mx-auto px-0 sm:px-4 py-0 sm:py-4 h-[calc(100vh-180px)] flex flex-col overflow-hidden">
          {/* Recherche en cours */}
          <div className="flex gap-4 mb-4 shrink-0">
            <div className="flex-1">
              <div className="card-hover flex items-stretch h-full px-5 py-3 bg-gradient-to-r from-[#eef7f6] to-[#e4f1f3] dark:from-[#0f1c1b] dark:to-[#132221] rounded-lg">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#3899aa] shrink-0" />
                  {phase === 'conversation' && chatMessages.length > 0 ? (
                    (() => {
                      const queryText = chatMessages.find(m => m.role === 'user')?.content || '';
                      const isTruncated = queryText.length > 150 && !showFullQuery;
                      return (
                        <div>
                          <p className="text-sm font-bold text-[#3899aa]">Recherche en cours</p>
                          <p className="text-sm text-foreground leading-snug font-semibold">
                            {isTruncated ? queryText.substring(0, 150) + '...' : queryText}
                          </p>
                          {queryText.length > 150 && (
                            <button
                              onClick={() => setShowFullQuery(!showFullQuery)}
                              className="text-xs text-[#3899aa] hover:underline mt-0.5"
                            >
                              {showFullQuery ? 'Réduire' : 'Voir plus'}
                            </button>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <p className="text-sm text-muted-foreground/50">Aucune recherche en cours</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`flex-1 min-h-0 flex flex-col ${phase === 'initial' ? 'opacity-50 pointer-events-none' : ''}`}>

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
                    <BookOpen className="w-16 h-16 text-muted-foreground/20 mx-auto mb-6" />
                    <h3 className="text-lg font-medium text-muted-foreground/60 mb-2">
                      Recherche Bibliographique
                    </h3>
                    <p className="text-sm text-muted-foreground/50 max-w-md">
                      Lancez une recherche ci-dessus pour accéder aux références et publications scientifiques.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {chatMessages.map((msg, index) => {
                    // Masquer le 1er message user (affiché dans le header)
                    if (index === 0 && msg.role === 'user') return null;

                    const isLastBotMessage = msg.role === 'assistant' &&
                      index === chatMessages.length - 1;

                    // Masquer le placeholder vide avant le 1er token
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
                                  .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline hover:text-teal-800">$1</a>')
                                  .replace(/\n/g, '<br>'), { ADD_ATTR: ['target'] })
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
                          <span className="text-muted-foreground">
                            {chatMessages.length <= 1 ? (
                              <>
                                <span className="hidden sm:inline">Recherche dans les références scientifiques...</span>
                                <span className="sm:hidden">Recherche...</span>
                              </>
                            ) : (
                              'Réflexion en cours...'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} className="h-1" />
                </div>
              )}
            </div>

            {phase === 'conversation' && (
              <div className="px-2 sm:px-6 pb-2 pt-0">
                <div className="relative flex items-center bg-white dark:bg-card border-2 border-border rounded-full px-4 py-1 shadow-sm focus-within:border-[#3899aa]/60 focus-within:shadow-md transition-all">
                  <Input
                    placeholder="Question de suivi sur les résultats..."
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
            )}

          </div>
      </div>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        subscription={subscription}
      />

      {/* Modal de recherche */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card-hover rounded-lg w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold">Nouvelle recherche bibliographique</h3>
              </div>
              <button
                onClick={() => { setIsModalOpen(false); setResearchQuery(''); }}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Posez votre question de recherche bibliographique. L&apos;IA analysera les publications et références scientifiques disponibles.
            </p>

            <Textarea
              placeholder="Ex: Quelles sont les dernières études sur l'efficacité du renforcement excentrique dans la tendinopathie rotulienne ?"
              value={researchQuery}
              onChange={(e) => setResearchQuery(e.target.value)}
              className="min-h-[120px] mb-4 resize-none"
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleResearch(); }
              }}
              autoFocus
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Entrée pour envoyer - Shift+Entrée pour retour à la ligne
              </p>
              <Button onClick={handleResearch} disabled={!researchQuery.trim() || isSending} className="min-w-[140px] btn-teal">
                {isSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Recherche...</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" />Rechercher</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
