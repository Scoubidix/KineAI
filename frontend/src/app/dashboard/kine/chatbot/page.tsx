'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, History, Trash2, Send, Loader2, CheckCircle, Target, BookOpen } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { ChatUpgradeHeader, ChatDisabledOverlay } from '@/components/ChatUpgradeHeader';
import { usePaywall } from '@/hooks/usePaywall';

interface ChatMessage {
  id: number;
  message: string;
  response: string;
  createdAt: string;
}

interface Source {
  title: string;
  category: string;
  similarity: string;
  confidence: number;
  relevanceLevel: string;
  rank: number;
  preview?: string;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Source[];
  enhanced?: boolean;
  confidence?: number;
}

export default function KineChatbotPage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
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

  const areSourcesRelevant = (sources: Source[], userQuestion: string) => {
    if (!sources || sources.length === 0) return false;
    
    const questionLower = userQuestion.toLowerCase();
    
    const anatomicalKeywords = [
      'épaule', 'epaule', 'shoulder',
      'genou', 'knee', 
      'cheville', 'ankle', 
      'dos', 'back', 'lombalgie', 'lombaire',
      'cervical', 'cou', 'neck',
      'coude', 'elbow',
      'poignet', 'wrist',
      'hanche', 'hip',
      'achille', 'tendon',
      'main', 'hand',
      'pied', 'foot'
    ];
    
    const questionAnatomy = anatomicalKeywords.filter(keyword => 
      questionLower.includes(keyword)
    );
    
    if (questionAnatomy.length === 0) {
      const MIN_CONFIDENCE_THRESHOLD = 85;
      return sources.some(source => source.confidence >= MIN_CONFIDENCE_THRESHOLD);
    }
    
    const relevantSources = sources.filter(source => {
      const sourceText = (source.title + ' ' + source.category).toLowerCase();
      
      const hasAnatomicalMatch = questionAnatomy.some(anatomy => 
        sourceText.includes(anatomy)
      );
      
      const hasDecentScore = source.confidence >= 70;
      
      return hasAnatomicalMatch && hasDecentScore;
    });
    
    return relevantSources.length > 0;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600 bg-green-50';
    if (confidence >= 80) return 'text-blue-600 bg-blue-50';
    if (confidence >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 90) return <Target className="w-3 h-3" />;
    if (confidence >= 80) return <CheckCircle className="w-3 h-3" />;
    if (confidence >= 70) return <BookOpen className="w-3 h-3" />;
    return <Wand2 className="w-3 h-3" />;
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
    
    setChatMessages(prev => [...prev, userMessage]);
    const currentMessage = message;
    setMessage('');
    setIsSending(true);

    try {
      const token = await getAuthToken();
      
      const res = await fetch(`${API_BASE}/api/chat/kine/ia-basique`, {
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

      const data = await res.json();
      
      if (data.success) {
        setIsSending(false);
        
        const assistantMessage: HistoryMessage = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),
          sources: data.sources && areSourcesRelevant(data.sources, currentMessage) ? data.sources : [],
          enhanced: data.metadata?.enhanced,
          confidence: data.confidence
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        setTimeout(() => {
          scrollToBotMessage();
        }, 100);
        
        const token = await getAuthToken();
        const res = await fetch(`${API_BASE}/api/chat/kine/history-basique?days=5`, {
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
          assistantType="CONVERSATIONNEL"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
          subscription={subscription}
        />
        
        {/* Header */}
        <div className="mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wand2 className="text-white h-7 w-7" />
                <div>
                  <h2 className="text-xl font-semibold text-white">Assistant IA Personnel</h2>
                  <p className="text-blue-100 text-sm">Assistant IA avec base de connaissances spécialisée - Historique conservé 5 jours</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-sm text-white font-medium">Connecté</span>
              </div>
            </div>
          </div>
        </div>

        {/* Zone de chat principale */}
        <ChatDisabledOverlay 
          assistantType="CONVERSATIONNEL"
          canAccessFeature={canAccessFeature}
          isLoading={paywallLoading}
        >
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Chat */}
            <div className="lg:col-span-3">
            <Card className="shadow-md min-h-[60vh] max-h-[75vh] flex flex-col">
              
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
                  <div className="space-y-4">
                    {chatMessages.map((msg, index) => {
                      const isLastBotMessage = msg.role === 'assistant' && 
                        index === chatMessages.length - 1;
                      
                      return (
                        <div
                          key={index}
                          ref={isLastBotMessage ? lastBotMessageRef : undefined}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-4 rounded-2xl ${
                              msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-br-md'
                                : 'bg-muted text-foreground rounded-bl-md'
                            }`}
                          >
                            <div className="prose prose-sm max-w-none">
                              <div 
                                className="whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{
                                  __html: msg.content
                                    .replace(/^### (.*$)/gim, '<strong class="text-base">$1</strong>') // ### -> heading
                                    .replace(/^## (.*$)/gim, '<strong class="text-base">$1</strong>') // ## -> heading
                                    .replace(/^# (.*$)/gim, '<strong class="text-lg">$1</strong>') // # -> heading
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **texte** -> gras
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>') // *texte* -> italique
                                    .replace(/^- (.*$)/gim, '• $1') // - -> •
                                    .replace(/^\d+\.\s+(.*$)/gim, '<strong>$1</strong>') // 1. -> gras
                                    .replace(/\n/g, '<br>') // retours à la ligne
                                }}
                              />
                            </div>
                            
                            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-muted-foreground/20">
                                <div className="flex items-center gap-2 mb-3">
                                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm font-medium text-muted-foreground">
                                    Sources consultées ({(() => {
                                      const grouped = msg.sources.reduce((acc, source) => {
                                        const baseTitle = source.title.replace(/ - Partie \d+\/\d+$/, '');
                                        if (!acc[baseTitle]) {
                                          acc[baseTitle] = [];
                                        }
                                        acc[baseTitle].push(source);
                                        return acc;
                                      }, {} as Record<string, Source[]>);
                                      return Object.keys(grouped).length;
                                    })()} documents) :
                                  </span>
                                  {msg.confidence && (
                                    <Badge variant="outline" className="text-xs">
                                      Confiance: {Math.round(msg.confidence * 100)}%
                                    </Badge>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  {(() => {
                                    const grouped = msg.sources.reduce((acc, source) => {
                                      const baseTitle = source.title.replace(/ - Partie \d+\/\d+$/, '');
                                      if (!acc[baseTitle]) {
                                        acc[baseTitle] = [];
                                      }
                                      acc[baseTitle].push(source);
                                      return acc;
                                    }, {} as Record<string, Source[]>);

                                    const sortedGroups = Object.entries(grouped)
                                      .map(([baseTitle, sources]) => ({
                                        baseTitle,
                                        sources,
                                        bestConfidence: Math.max(...sources.map(s => s.confidence))
                                      }))
                                      .sort((a, b) => b.bestConfidence - a.bestConfidence)
                                      .slice(0, 3);

                                    return sortedGroups.map(({ baseTitle, sources }, i) => {
                                      const bestSource = sources.reduce((best, current) => 
                                        current.confidence > best.confidence ? current : best
                                      );
                                      
                                      return (
                                        <div key={i} className="text-sm bg-background/50 rounded-lg p-3 border">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                              <Badge 
                                                variant="outline" 
                                                className={`text-xs ${getConfidenceColor(bestSource.confidence)}`}
                                              >
                                                {getConfidenceIcon(bestSource.confidence)}
                                                {bestSource.similarity}
                                              </Badge>
                                              <span className="font-medium text-foreground">{baseTitle}</span>
                                            </div>
                                            <Badge variant="secondary" className="text-xs">
                                              #{i + 1}
                                            </Badge>
                                          </div>
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">• {bestSource.category}</span>
                                            <span className="text-muted-foreground">{bestSource.relevanceLevel}</span>
                                          </div>
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center justify-between mt-2">
                              <p className={`text-xs ${
                                msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
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
                            <span className="text-muted-foreground">Recherche dans la base de connaissances...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} className="h-1" />
                  </div>
                )}
              </CardContent>

              <div className="border-t p-4 bg-background">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Votre question (l'IA consultera vos documents spécialisés)..."
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
                    className="min-h-[44px] min-w-[44px]"
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
                    ⚠️ L'IA peut faire des erreurs, vérifiez les informations importantes.
                  </p>
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">
                    Appuyez sur Entrée pour envoyer • Conversation sécurisée • Base documentaire active
                  </p>
                  {chatMessages.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {Math.floor(chatMessages.length / 2)} questions posées
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">

            {/* Conseils d'utilisation */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">💡 Assistant Conversationnel</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs text-muted-foreground space-y-3">
                  <div>
                    <p className="font-medium text-foreground mb-2">🎯 Idéal pour les questions simples et pratiques</p>
                    <p className="mb-2">Réponses courtes et directes pour votre pratique quotidienne.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-2">📝 Exemples de questions :</p>
                    <ul className="space-y-2 pl-2">
                      <li className="text-xs italic">• "Comment expliquer ce qu'est une tendinopathie à un patient ?"</li>
                      <li className="text-xs italic">• "Quels exercices simples pour renforcer le psoas ?"</li>
                      <li className="text-xs italic">• "Comment organiser une séance de rééducation d'épaule ?"</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions rapides */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Actions
                  </div>
                  {history.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearHistory}
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>📊 <strong>{history.length}</strong> conversations sauvegardées</p>
                  <p>📅 Historique sur <strong>5 jours</strong></p>
                  <p>🔐 Données <strong>sécurisées</strong></p>
                  <p>📚 Base de connaissances <strong>active</strong></p>
                </div>
              </CardContent>
            </Card>

            </div>
          </div>
        </ChatDisabledOverlay>
      </div>
    </AppLayout>
  );
}