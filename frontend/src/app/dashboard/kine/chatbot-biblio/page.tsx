'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { BookOpen, History, Trash2, Send, Loader2, CheckCircle, Search, X } from 'lucide-react';
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

export default function KineChatbotBiblioPage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<HistoryMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [phase, setPhase] = useState<'initial' | 'conversation'>('initial');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [researchQuery, setResearchQuery] = useState('');

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

  const handleAsk = async () => {
    if (!message.trim() || isSending) return;
    
    const userMessage: HistoryMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    const currentMessage = message;
    setMessage('');
    setIsSending(true);

    try {
      const token = await getAuthToken();
      
      // Follow-ups via ia-followup (conversationnel sans RAG, sauvegarde dans table biblio)
      const res = await fetch(`${API_BASE}/api/chat/kine/ia-followup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: currentMessage,
          conversationHistory: chatMessages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          sourceIa: 'biblio'
        })
      });

      const data = await res.json();
      
      if (data.success) {
        setIsSending(false);
        
        const assistantMessage: HistoryMessage = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),

          enhanced: data.metadata?.enhanced,
          confidence: data.confidence
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        setTimeout(() => {
          scrollToBotMessage();
        }, 100);
        
        const token = await getAuthToken();
        const res = await fetch(`${API_BASE}/api/chat/kine/history-biblio?days=5`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const historyData = await res.json();
        if (historyData.success) {
          setHistory(historyData.history);
        }
      } else {
        setIsSending(false);
        
        const errorMessage: HistoryMessage = {
          role: 'assistant',
          content: data.error || 'Erreur lors de la génération de la réponse',
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, errorMessage]);
        
        setTimeout(() => {
          scrollToBotMessage();
        }, 100);
      }
    } catch (error) {
      console.error('Erreur envoi message:', error);
      setIsSending(false);
      
      const errorMessage: HistoryMessage = {
        role: 'assistant',
        content: "Erreur lors de l'appel à l'assistant.",
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
      
      setTimeout(() => {
        scrollToBotMessage();
      }, 100);
    }
  };

  const handleResearch = async () => {
    if (!researchQuery.trim() || isSending) return;

    // Effacer l'historique precedent si existant (nouvelle recherche)
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
      setChatMessages([]);
    }

    const userMessage: HistoryMessage = {
      role: 'user',
      content: researchQuery.trim(),
      timestamp: new Date().toISOString()
    };

    setChatMessages([userMessage]);
    const currentQuery = researchQuery;
    setResearchQuery('');
    setIsModalOpen(false);
    setPhase('conversation');
    setIsSending(true);

    try {
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/chat/kine/ia-biblio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: currentQuery,
          conversationHistory: []
        })
      });

      const data = await res.json();

      if (data.success) {
        setIsSending(false);

        const assistantMessage: HistoryMessage = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),

          enhanced: data.metadata?.enhanced,
          confidence: data.confidence
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        setTimeout(() => {
          scrollToBotMessage();
        }, 100);

        const token2 = await getAuthToken();
        const histRes = await fetch(`${API_BASE}/api/chat/kine/history-biblio?days=5`, {
          headers: { Authorization: `Bearer ${token2}` }
        });
        const historyData = await histRes.json();
        if (historyData.success) {
          setHistory(historyData.history);
        }
      } else {
        setIsSending(false);
        const errorMessage: HistoryMessage = {
          role: 'assistant',
          content: data.error || 'Erreur lors de la génération de la réponse',
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, errorMessage]);
        setTimeout(() => { scrollToBotMessage(); }, 100);
      }
    } catch (error) {
      console.error('Erreur recherche biblio:', error);
      setIsSending(false);
      const errorMessage: HistoryMessage = {
        role: 'assistant',
        content: "Erreur lors de l'appel à l'assistant bibliographique.",
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
      setTimeout(() => { scrollToBotMessage(); }, 100);
    }
  };

  const handleNewResearch = () => {
    if (isSending) return;
    setResearchQuery('');
    setIsModalOpen(true);
  };

  const clearHistory = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tout l\'historique ?')) {
      return;
    }

    try {
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/chat/kine/history-biblio`, {
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

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
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
      <div className="max-w-6xl mx-auto p-4">
        
        {/* Header Upgrade si pas d'accès */}
        <ChatUpgradeHeader 
          assistantType="BIBLIOTHEQUE"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        />
        
        {/* Header */}
        <div className="card-hover rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="text-[#3899aa] h-7 w-7" />
              <div>
                <h2 className="text-xl font-semibold text-[#3899aa]">IA Bibliographique</h2>
                <p className="text-foreground text-sm">Spécialisée dans la recherche et l'analyse bibliographique - Références scientifiques et publications</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#3899aa]/10 rounded-full px-3 py-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-foreground font-medium">Connecté</span>
            </div>
          </div>
        </div>

        {/* Zone de chat principale */}
        <ChatDisabledOverlay
          assistantType="BIBLIOTHEQUE"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
        >
          {/* Header row - Recherche en cours + Bouton */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-4">
            <div className="lg:col-span-3">
              <div className="card-hover flex items-stretch h-full px-5 py-3 bg-gradient-to-r from-[#eef7f6] to-[#e4f1f3] dark:from-[#0f1c1b] dark:to-[#132221] rounded-lg">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#3899aa] shrink-0" />
                  {phase === 'conversation' && chatMessages.length > 0 ? (
                    <div>
                      <p className="text-sm font-bold text-[#3899aa]">Recherche en cours</p>
                      <p className="text-sm text-foreground leading-snug font-semibold">
                        {chatMessages.find(m => m.role === 'user')?.content || ''}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/50">Aucune recherche en cours</p>
                  )}
                </div>
              </div>
            </div>
            <div className="lg:col-span-1 flex">
              <Button
                onClick={handleNewResearch}
                disabled={isSending}
                size="lg"
                className="w-full h-full btn-teal"
              >
                <Search className="h-5 w-5 mr-2" />
                {phase === 'conversation' ? 'Nouvelle recherche' : 'Lancer une recherche'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* Chat */}
            <div className="lg:col-span-3">
            <Card className={`card-hover min-h-[60vh] max-h-[75vh] flex flex-col ${phase === 'initial' ? 'opacity-50 pointer-events-none' : ''}`}>

              <CardContent
                ref={messagesContainerRef}
                className="flex-1 p-6 overflow-y-auto scroll-smooth"
                style={{ 
                  scrollBehavior: 'smooth',
                  overflowAnchor: 'none'
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
                  <div className="space-y-4">
                    {chatMessages.map((msg, index) => {
                      // Masquer le 1er message user (déjà affiché dans le header "Recherche en cours")
                      if (index === 0 && msg.role === 'user') return null;

                      const isLastBotMessage = msg.role === 'assistant' &&
                        index === chatMessages.length - 1;

                      return (
                        <div
                          key={index}
                          ref={isLastBotMessage ? lastBotMessageRef : undefined}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] py-4 pl-4 pr-10 rounded-2xl ${
                              msg.role === 'user'
                                ? 'bubble-user rounded-br-md'
                                : 'bubble-ai text-foreground rounded-bl-md'
                            }`}
                          >
                            <div className="prose prose-sm max-w-none text-justify">
                              <div
                                className="whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{
                                  __html: DOMPurify.sanitize(msg.content
                                    .replace(/^### (.*$)/gim, '<strong class="text-base">$1</strong>') // ### -> heading
                                    .replace(/^## (.*$)/gim, '<strong class="text-base">$1</strong>') // ## -> heading
                                    .replace(/^# (.*$)/gim, '<strong class="text-lg">$1</strong>') // # -> heading
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **texte** -> gras
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>') // *texte* -> italique
                                    .replace(/^- (.*$)/gim, '• $1') // - -> •
                                    .replace(/^\d+\.\s+(.*$)/gim, '<strong>$1</strong>') // 1. -> gras
                                    .replace(/\n/g, '<br>')) // retours à la ligne
                                }}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between mt-2">
                              <p className={`text-xs ${
                                msg.role === 'user' ? 'text-white/70' : 'text-muted-foreground'
                              }`}>
                                {formatTime(msg.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {isSending && (
                      <div className="flex justify-start">
                        <div className="bg-muted p-4 rounded-2xl rounded-bl-md">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-muted-foreground">
                              {chatMessages.length <= 1
                                ? 'Recherche dans les références scientifiques...'
                                : 'Réflexion en cours...'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} className="h-1" />
                  </div>
                )}
              </CardContent>

              {phase === 'conversation' && (
                <div className="border-t p-4 bg-white dark:bg-card">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="Question de suivi sur les résultats..."
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

                  <div className="mt-3 mb-2">
                    <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded px-3 py-2">
                      L'IA peut faire des erreurs, vérifiez les informations importantes.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-foreground">
                      Entrée pour envoyer - Questions de suivi en mode conversationnel
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {/* Bouton Proposer une étude */}
            <Button
              asChild
              className="flex items-center gap-2 w-full mt-3 btn-teal"
            >
              <a
                href="https://tally.so/r/mV25VJ"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen className="h-4 w-4" />
                Proposer une étude
              </a>
            </Button>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">

            {/* Conseils d'utilisation */}
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">💡 Conseils Biblio</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs text-foreground space-y-3">
                  <div>
                    <p className="font-medium mb-1">Questions bibliographiques :</p>
                    <ul className="space-y-1 pl-2">
                      <li>• Recherche d'études scientifiques</li>
                      <li>• Méta-analyses et revues systématiques</li>
                      <li>• Recommandations basées sur l'évidence</li>
                      <li>• Références et citations pertinentes</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Optimisation :</p>
                    <ul className="space-y-1 pl-2">
                      <li>• Utilisez des termes techniques précis</li>
                      <li>• Mentionnez la pathologie étudiée</li>
                      <li>• Spécifiez le type d'étude recherché</li>
                      <li>• L'IA analyse les meilleures sources</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-2">📝 Exemple optimisé :</p>
                    <p className="text-xs italic bg-muted/50 p-2 rounded border">
                      "Quelles sont les dernières études sur l'efficacité du renforcement excentrique dans la tendinopathie rotulienne chez le sportif ?"
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            </div>
          </div>
        </ChatDisabledOverlay>
      </div>

      {/* Modal de recherche bibliographique */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card-hover rounded-lg w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold">Nouvelle recherche bibliographique</h3>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setResearchQuery('');
                }}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Posez votre question de recherche bibliographique. L'IA analysera les publications et références scientifiques disponibles.
            </p>

            <Textarea
              placeholder="Ex: Quelles sont les dernières études sur l'efficacité du renforcement excentrique dans la tendinopathie rotulienne ?"
              value={researchQuery}
              onChange={(e) => setResearchQuery(e.target.value)}
              className="min-h-[120px] mb-4 resize-none"
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleResearch();
                }
              }}
              autoFocus
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Entrée pour envoyer - Shift+Entrée pour retour à la ligne
              </p>
              <Button
                onClick={handleResearch}
                disabled={!researchQuery.trim() || isSending}
                className="min-w-[140px] btn-teal"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Recherche...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Rechercher
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}