'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Stethoscope, Trash2, Send, Loader2, Lightbulb, Search, X } from 'lucide-react';
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

export default function KineChatbotCliniquePage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<HistoryMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [phase, setPhase] = useState<'initial' | 'conversation'>('initial');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [researchQuery, setResearchQuery] = useState('');

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
      const res = await fetch(`${API_BASE}/api/chat/kine/history-clinique?days=5`, {
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
          sourceIa: 'clinique'
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

      await processSSEStream(res, '/api/chat/kine/history-clinique?days=5');
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

  /** Premier raisonnement en streaming */
  const handleResearch = async () => {
    if (!researchQuery.trim() || isSending) return;

    if (chatMessages.length > 0) {
      try {
        const deleteToken = await getAuthToken();
        await fetch(`${API_BASE}/api/chat/kine/history-clinique`, {
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
      const res = await fetch(`${API_BASE}/api/chat/kine/ia-clinique-stream`, {
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

      await processSSEStream(res, '/api/chat/kine/history-clinique?days=5');
    } catch (error) {
      console.error('Erreur raisonnement clinique:', error);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: "Erreur lors de l'appel à l'assistant clinique." };
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
      const res = await fetch(`${API_BASE}/api/chat/kine/history-clinique`, {
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

        <ChatUpgradeHeader
          assistantType="CLINIQUE"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        />

        {/* Header */}
        <div className="card-hover rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Stethoscope className="text-[#3899aa] h-7 w-7 shrink-0" />
              <div>
                <h2 className="text-xl font-semibold text-[#3899aa]">IA Clinique</h2>
                <p className="text-foreground text-sm">Spécialisée en raisonnement clinique et aide au diagnostic - Cas cliniques et protocoles thérapeutiques</p>
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
                    <p className="font-medium text-foreground mb-2">Questions cliniques :</p>
                    <ul className="space-y-1 pl-2">
                      <li>&bull; Aide au diagnostic différentiel</li>
                      <li>&bull; Protocoles thérapeutiques</li>
                      <li>&bull; Raisonnement clinique complexe</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-2">Exemple optimisé :</p>
                    <p className="text-xs italic">&quot;Patient 45 ans, sportif amateur. Douleur épaule antérieure depuis 3 semaines après reprise tennis. Limitation flexion active 130°, douleur nocturne.&quot;</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zone de chat */}
        <ChatDisabledOverlay
          assistantType="CLINIQUE"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        >
          {/* Raisonnement en cours + Bouton */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <div className="card-hover flex items-stretch h-full px-5 py-3 bg-gradient-to-r from-[#eef7f6] to-[#e4f1f3] dark:from-[#0f1c1b] dark:to-[#132221] rounded-lg">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-[#3899aa] shrink-0" />
                  {phase === 'conversation' && chatMessages.length > 0 ? (
                    <div>
                      <p className="text-sm font-bold text-[#3899aa]">Raisonnement en cours</p>
                      <p className="text-sm text-foreground leading-snug font-semibold">
                        {chatMessages.find(m => m.role === 'user')?.content || ''}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/50">Aucun raisonnement en cours</p>
                  )}
                </div>
              </div>
            </div>
            <Button
              onClick={handleNewResearch}
              disabled={isSending}
              size="lg"
              className="sm:w-auto btn-teal"
            >
              <Stethoscope className="h-5 w-5 mr-2" />
              {phase === 'conversation' ? 'Nouveau raisonnement' : 'Lancer un raisonnement'}
            </Button>
          </div>

          <div className={`h-[calc(100vh-320px)] flex flex-col ${phase === 'initial' ? 'opacity-50 pointer-events-none' : ''}`}>

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
                    <Stethoscope className="w-16 h-16 text-muted-foreground/20 mx-auto mb-6" />
                    <h3 className="text-lg font-medium text-muted-foreground/60 mb-2">
                      Raisonnement Clinique
                    </h3>
                    <p className="text-sm text-muted-foreground/50 max-w-md">
                      Lancez un raisonnement ci-dessus pour démarrer l&apos;analyse clinique.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {chatMessages.map((msg, index) => {
                    if (index === 0 && msg.role === 'user') return null;

                    const isLastBotMessage = msg.role === 'assistant' &&
                      index === chatMessages.length - 1;

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
                          <span className="text-muted-foreground">
                            {chatMessages.length <= 1 ? (
                              <>
                                <span className="hidden sm:inline">Analyse clinique en cours...</span>
                                <span className="sm:hidden">Analyse...</span>
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
              <div className="p-4 w-1/2 mx-auto">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Question de suivi sur le raisonnement clinique..."
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
                    Entrée pour envoyer - Questions de suivi en mode conversationnel
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
            )}
          </div>
        </ChatDisabledOverlay>
      </div>

      {/* Modal de raisonnement clinique */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card-hover rounded-lg w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-[#3899aa]" />
                <h3 className="text-lg font-semibold">Nouveau raisonnement clinique</h3>
              </div>
              <button
                onClick={() => { setIsModalOpen(false); setResearchQuery(''); }}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Décrivez votre cas clinique. L&apos;IA analysera les données et proposera un raisonnement diagnostique et thérapeutique structuré.
            </p>

            <Textarea
              placeholder="Ex: Patient 45 ans, sportif amateur. Douleur épaule antérieure apparue progressivement depuis 3 semaines après reprise tennis. Limitation flexion active 130°, douleur nocturne sur décubitus latéral côté atteint."
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
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyse...</>
                ) : (
                  <><Stethoscope className="h-4 w-4 mr-2" />Analyser</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
