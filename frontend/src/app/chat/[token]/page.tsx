'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PatientData {
  id: number;
  nom: string;
  age: number;
}

interface ProgrammeData {
  id: number;
  titre: string;
  description: string;
  duree: number;
  dateFin: string;
  exerciceCount: number;
}

interface ValidationResponse {
  success: boolean;
  patient: PatientData;
  programme: ProgrammeData;
  tokenInfo: {
    expiresAt: string;
    issuedAt: string;
  };
}

interface WelcomeResponse {
  success: boolean;
  hasHistory: boolean;
  welcomeMessage?: string;
  chatHistory?: ChatMessage[];
  patient: PatientData;
  programme: ProgrammeData;
  timestamp: string;
  warning?: {
    message: string;
    hoursRemaining: number;
  };
}

interface ChatResponse {
  success: boolean;
  message: string;
  patient: PatientData;
  programme: ProgrammeData;
  timestamp: string;
  warning?: {
    message: string;
    hoursRemaining: number;
  };
}

export default function PatientChatPage() {
  const { token } = useParams();
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [programmeData, setProgrammeData] = useState<ProgrammeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // États du chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [chatInitialized, setChatInitialized] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  
  // Référence pour le scroll automatique
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // URL de l'API
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  // Validation du token au chargement
  useEffect(() => {
    validateToken();
  }, [token]);

  // Initialisation du chat après validation
  useEffect(() => {
    if (isValid && !chatInitialized) {
      initializeChat();
    }
  }, [isValid, chatInitialized]);

  // Scroll automatique vers le bas
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const validateToken = async () => {
    try {
      const response = await fetch(`${API_URL}/api/patient/validate/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Token invalide');
      }

      const data: ValidationResponse = await response.json();
      setIsValid(true);
      setPatientData(data.patient);
      setProgrammeData(data.programme);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de validation');
      setIsValid(false);
    } finally {
      setIsValidating(false);
    }
  };

  const initializeChat = async () => {
    setIsLoadingChat(true);
    try {
      const response = await fetch(`${API_URL}/api/patient/welcome/${token}`);
      
      if (!response.ok) {
        throw new Error('Erreur lors de l\'initialisation du chat');
      }

      const data: WelcomeResponse = await response.json();
      
      if (data.success) {
        if (data.hasHistory && data.chatHistory) {
          // Charger l'historique existant
          setMessages(data.chatHistory);
          console.log(`📝 Historique restauré: ${data.chatHistory.length} messages`);
        } else if (data.welcomeMessage) {
          // Nouveau chat avec message d'accueil
          const welcomeMsg: ChatMessage = {
            role: 'assistant',
            content: data.welcomeMessage,
            timestamp: data.timestamp
          };
          setMessages([welcomeMsg]);
          console.log('👋 Nouveau chat initialisé avec message d\'accueil');
        }

        // Gérer les warnings d'expiration
        if (data.warning) {
          setWarning(data.warning.message);
        }
      }
    } catch (err) {
      console.error('Erreur initialisation chat:', err);
      // Message d'accueil de fallback
      const fallbackMessage: ChatMessage = {
        role: 'assistant',
        content: 'Bonjour ! Je suis votre assistant kinésithérapeute virtuel. Comment puis-je vous aider aujourd\'hui ?',
        timestamp: new Date().toISOString()
      };
      setMessages([fallbackMessage]);
    } finally {
      setIsLoadingChat(false);
      setChatInitialized(true);
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || isSending) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: currentMessage.trim(),
      timestamp: new Date().toISOString()
    };

    // Ajouter le message utilisateur immédiatement
    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsSending(true);

    try {
      const response = await fetch(`${API_URL}/api/patient/chat/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content
          // Plus besoin d'envoyer chatHistory - géré automatiquement côté serveur
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de l\'envoi du message');
      }

      const data: ChatResponse = await response.json();
      
      if (data.success) {
        // Ajouter la réponse de l'assistant
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message,
          timestamp: data.timestamp
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Gérer les warnings d'expiration
        if (data.warning) {
          setWarning(data.warning.message);
        }
      } else {
        throw new Error(data.message || 'Erreur lors de la génération de la réponse');
      }

    } catch (err) {
      console.error('Erreur envoi message:', err);
      
      // Ajouter un message d'erreur
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants.',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Écran de chargement initial
  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full mx-4">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Vérification de votre accès...</h2>
            <p className="text-gray-600">Patientez pendant que nous validons votre lien sécurisé.</p>
          </div>
        </div>
      </div>
    );
  }

  // Écran d'erreur
  if (!isValid || error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full mx-4">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Accès non autorisé</h2>
            <p className="text-gray-600 mb-4">
              {error || 'Votre lien est invalide ou a expiré.'}
            </p>
            <p className="text-sm text-gray-500">
              Veuillez contacter votre kinésithérapeute pour obtenir un nouveau lien.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Interface de chat
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">
                Chat Kinésithérapie
              </h1>
              <p className="text-sm text-gray-600">
                Bonjour {patientData?.nom} • Programme : {programmeData?.titre}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm text-green-600 font-medium">Connecté</span>
            </div>
          </div>
          
          {/* Warning d'expiration */}
          {warning && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">⚠️ {warning}</p>
            </div>
          )}
        </div>
      </div>

      {/* Zone de chat */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-lg h-[calc(100vh-200px)] flex flex-col">
          
          {/* Messages */}
          <div className="flex-1 p-6 overflow-y-auto">
            {isLoadingChat ? (
              // Chargement de l'historique
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                  <p className="text-gray-600">Chargement de votre conversation...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-2xl ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p className={`text-xs mt-2 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                      }`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                
                {/* Indicateur de frappe */}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 p-4 rounded-2xl rounded-bl-md">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-gray-600">Assistant en train d'écrire...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Zone de saisie */}
          <div className="border-t p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Tapez votre message ici..."
                  className="w-full p-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={1}
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                  disabled={isSending || isLoadingChat}
                  maxLength={1000}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!currentMessage.trim() || isSending || isLoadingChat}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-500">
                Appuyez sur Entrée pour envoyer • Votre conversation est sécurisée
              </p>
              {messages.length > 1 && (
                <p className="text-xs text-gray-400">
                  {messages.length - 1} messages échangés aujourd'hui
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}