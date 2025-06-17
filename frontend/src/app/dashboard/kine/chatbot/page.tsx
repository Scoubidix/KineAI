'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, History, Trash2, Send, Loader2, CheckCircle, Database } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

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
  sources?: Array<{
    title: string;
    category: string;
    similarity: string;
  }>;
  enhanced?: boolean;
}

export default function KineChatbotPage() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<HistoryMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  // Base URL de l'API - URL relative pour utiliser automatiquement le même serveur
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  
  // Référence pour le conteneur de messages et le scroll automatique
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastBotMessageRef = useRef<HTMLDivElement>(null);

  // Charger l'historique au montage du composant
  useEffect(() => {
    loadHistory();
  }, []);

  // Scroll automatique vers le bas SEULEMENT dans la zone de chat
  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Scroll spécifique quand l'indicateur de frappe change
  useEffect(() => {
    if (isSending) {
      // Quand on commence à taper, scroll vers la fin
      scrollToBottom();
    }
  }, [isSending]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current && messagesEndRef.current) {
      // Scroll uniquement dans le conteneur des messages, pas toute la page
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
    }
  };

  const scrollToBotMessage = () => {
    if (messagesContainerRef.current && lastBotMessageRef.current) {
      // Scroll vers le début de la réponse du bot
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
      const res = await fetch(`${API_BASE}/api/chat/kine?days=5`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
        
        // Convertir l'historique en format chat SEULEMENT au chargement initial
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
    
    // Ajouter le message utilisateur immédiatement
    setChatMessages(prev => [...prev, userMessage]);
    const currentMessage = message;
    setMessage(''); // Vider le champ
    setIsSending(true);

    try {
      const token = await getAuthToken();
      
      // 🔥 CHANGEMENT : Utilise l'endpoint enhanced
      const res = await fetch(`${API_BASE}/api/chat/kine/message-enhanced`, {
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
        // Masquer immédiatement l'indicateur de frappe
        setIsSending(false);
        
        // Ajouter la réponse de l'assistant avec sources
        const assistantMessage: HistoryMessage = {
          role: 'assistant',
          content: data.message, // Note: "message" pour enhanced au lieu de "response"
          timestamp: new Date().toISOString(),
          sources: data.sources || undefined,
          enhanced: data.metadata?.enhanced
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        // Scroll vers le début de la réponse du bot après un court délai
        setTimeout(() => {
          scrollToBotMessage();
        }, 100);
        
        // Mettre à jour uniquement les statistiques d'historique en arrière-plan
        const token = await getAuthToken();
        const res = await fetch(`${API_BASE}/api/chat/kine?days=5`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const historyData = await res.json();
        if (historyData.success) {
          setHistory(historyData.history); // Juste pour les stats, pas pour l'affichage
        }
      } else {
        // Masquer l'indicateur même en cas d'erreur
        setIsSending(false);
        
        // Message d'erreur
        const errorMessage: HistoryMessage = {
          role: 'assistant',
          content: data.error || 'Erreur lors de la génération de la réponse',
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, errorMessage]);
        
        // Scroll vers le début du message d'erreur
        setTimeout(() => {
          scrollToBotMessage();
        }, 100);
      }
    } catch (error) {
      console.error('Erreur envoi message:', error);
      
      // Masquer l'indicateur en cas d'erreur
      setIsSending(false);
      
      const errorMessage: HistoryMessage = {
        role: 'assistant',
        content: "Erreur lors de l'appel à l'assistant.",
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
      
      // Scroll vers le début du message d'erreur
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
      
      // Appel vers la route Next.js (proxy) au lieu du backend direct
      const res = await fetch('/api/chat/kine?action=delete', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        console.error('Erreur suppression:', await res.text());
        return;
      }
      
      // Vider immédiatement l'affichage
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

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4">
        
        {/* Header */}
        <div className="mb-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="text-accent h-6 w-6" />
                  Assistant IA Personnel
                  <Badge variant="secondary" className="ml-2">
                    <Database className="w-3 h-3 mr-1" />
                    Enhanced
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">Connecté</span>
                </div>
              </CardTitle>
              <CardDescription>
                Assistant IA avec base de connaissances spécialisée - Historique conservé 5 jours
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Zone de chat principale */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Chat */}
          <div className="lg:col-span-3">
            <Card className="shadow-md min-h-[60vh] max-h-[75vh] flex flex-col">
              
              {/* Messages - Conteneur avec scroll isolé */}
              <CardContent 
                ref={messagesContainerRef}
                className="flex-1 p-6 overflow-y-auto scroll-smooth"
                style={{ 
                  scrollBehavior: 'smooth',
                  overflowAnchor: 'none' // Évite le scroll automatique involontaire
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
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            
                            {/* 🆕 Affichage des sources pour les réponses enhanced */}
                            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-muted-foreground/20">
                                <p className="text-xs text-muted-foreground mb-2 font-medium">
                                  📚 Sources utilisées :
                                </p>
                                <div className="space-y-1">
                                  {msg.sources.map((source, i) => (
                                    <div key={i} className="text-xs text-muted-foreground">
                                      <Badge variant="outline" className="text-xs mr-2">
                                        {source.similarity}
                                      </Badge>
                                      <span className="font-medium">{source.title}</span>
                                      <span className="text-muted-foreground/70"> • {source.category}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center justify-between mt-2">
                              <p className={`text-xs ${
                                msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              }`}>
                                {formatTime(msg.timestamp)}
                              </p>
                              {msg.role === 'assistant' && msg.enhanced && (
                                <Badge variant="secondary" className="text-xs">
                                  <Database className="w-2 h-2 mr-1" />
                                  Enhanced
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Indicateur de frappe */}
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
                    
                    {/* Élément invisible pour le scroll automatique */}
                    <div ref={messagesEndRef} className="h-1" />
                  </div>
                )}
              </CardContent>

              {/* Zone de saisie - Fixe en bas */}
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
                
                <div className="flex justify-between items-center mt-2">
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

          {/* Sidebar avec historique et conseils */}
          <div className="lg:col-span-1 space-y-4">
            
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

            {/* Conseils d'utilisation */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">💡 Conseils d'utilisation Enhanced</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground space-y-2">
                  <div>
                    <p className="font-medium mb-1">Questions spécialisées :</p>
                    <ul className="space-y-1 pl-2">
                      <li>• Questions sur les protocoles uploadés</li>
                      <li>• Détails sur les exercices référencés</li>
                      <li>• Comparaison avec vos documents</li>
                      <li>• Conseils basés sur votre base</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Astuces :</p>
                    <ul className="space-y-1 pl-2">
                      <li>• Soyez spécifique dans vos questions</li>
                      <li>• L'IA garde le contexte de la conversation</li>
                      <li>• Les sources utilisées sont affichées</li>
                      <li>• Utilisez Entrée pour envoyer rapidement</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statut */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">🔋 Statut système</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">IA Assistant</span>
                    <span className="text-green-600 font-medium">✓ Enhanced</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Historique</span>
                    <span className="text-green-600 font-medium">✓ Synchronisé</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Base docs</span>
                    <span className="text-green-600 font-medium">✓ Connectée</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sécurité</span>
                    <span className="text-green-600 font-medium">✓ Chiffré</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}