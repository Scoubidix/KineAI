'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Loader2, AlertCircle, CheckCircle, Trophy, X, Check, ChevronDown } from 'lucide-react';

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

interface SessionStatusResponse {
  success: boolean;
  isValidatedToday: boolean;
  validation?: {
    date: string;
    painLevel: number;
    difficultyLevel: number;
    validatedAt: string;
  };
  patient: PatientData;
  programme: ProgrammeData;
  timestamp: string;
}

interface ValidationSubmitResponse {
  success: boolean;
  message: string;
  validation: {
    id: number;
    date: string;
    painLevel: number;
    difficultyLevel: number;
    validatedAt: string;
  };
  patient: PatientData;
  programme: ProgrammeData;
  timestamp: string;
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

  // États de validation de séance
  const [isValidatedToday, setIsValidatedToday] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [painLevel, setPainLevel] = useState(0);
  const [difficultyLevel, setDifficultyLevel] = useState(0);
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [validationDetails, setValidationDetails] = useState<any>(null);
  
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
      checkSessionStatus();
    }
  }, [isValid, chatInitialized]);

  // Scroll automatique vers le bas
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-hide toast après 5 secondes
  useEffect(() => {
    if (showSuccessToast) {
      const timer = setTimeout(() => {
        setShowSuccessToast(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessToast]);

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

  const checkSessionStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/patient/session-status/${token}`);
      
      if (response.ok) {
        const data: SessionStatusResponse = await response.json();
        if (data.success) {
          setIsValidatedToday(data.isValidatedToday);
          if (data.validation) {
            setValidationDetails(data.validation);
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors de la vérification du statut de séance:', err);
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

  const handleValidationSubmit = async () => {
    setIsSubmittingValidation(true);
    
    try {
      const response = await fetch(`${API_URL}/api/patient/validate-session/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          painLevel,
          difficultyLevel
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la validation');
      }

      const data: ValidationSubmitResponse = await response.json();
      
      if (data.success) {
        setIsValidatedToday(true);
        setValidationDetails(data.validation);
        setShowValidationModal(false);
        setShowSuccessToast(true);
        // Reset des valeurs
        setPainLevel(0);
        setDifficultyLevel(0);
      } else {
        throw new Error(data.message || 'Erreur lors de la validation');
      }

    } catch (err) {
      console.error('Erreur validation séance:', err);
      alert(`Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    } finally {
      setIsSubmittingValidation(false);
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
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

  // Interface de chat type WhatsApp
  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Toast de succès */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right duration-300">
          <Trophy className="w-6 h-6" />
          <div>
            <p className="font-medium">Bravo ! Séance quotidienne validée</p>
            <p className="text-sm opacity-90">Votre kinésithérapeute a été notifié</p>
          </div>
          <button 
            onClick={() => setShowSuccessToast(false)}
            className="ml-2 text-white/80 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal de validation */}
      {showValidationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Validation de séance</h2>
              <p className="text-gray-600">Aidez-nous à suivre votre progression</p>
            </div>

            <div className="space-y-6">
              {/* Question douleur */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Quel a été votre niveau de douleur pendant la séance ?
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={painLevel}
                    onChange={(e) => setPainLevel(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0 - Aucune</span>
                    <span className="font-medium text-primary">{painLevel}/10</span>
                    <span>10 - Très forte</span>
                  </div>
                </div>
              </div>

              {/* Question difficulté */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Quel a été le niveau de difficulté de la séance ?
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={difficultyLevel}
                    onChange={(e) => setDifficultyLevel(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0 - Très facile</span>
                    <span className="font-medium text-primary">{difficultyLevel}/10</span>
                    <span>10 - Très difficile</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowValidationModal(false)}
                disabled={isSubmittingValidation}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleValidationSubmit}
                disabled={isSubmittingValidation}
                className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingValidation ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Valider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header - toujours visible */}
      <div className="bg-white text-gray-800 shadow-lg border-b z-30">
        <div className="px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center relative">
              <h1 className="font-semibold text-lg text-gray-800">Mon Assistant Kiné</h1>
              
              {/* Bouton validation séance - aligné avec bordure droite des bulles */}
              <div className="absolute right-0">
                {isValidatedToday ? (
                  <button
                    disabled
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium cursor-not-allowed flex items-center gap-2 border border-red-200"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Validée
                  </button>
                ) : (
                  <button
                    onClick={() => setShowValidationModal(true)}
                    className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Trophy className="w-4 h-4" />
                    Valider
                  </button>
                )}
              </div>
            </div>
            
            {/* Info programme - aligné avec bordure gauche des bulles */}
            <div className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                {patientData?.nom} • Programme : {programmeData?.titre}
              </p>
            </div>
            
            {/* Warning d'expiration */}
            {warning && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">⚠️ {warning}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone de chat */}
      <div 
        className="flex-1 overflow-y-auto"
        style={{
          backgroundColor: '#f0f4f8',
          backgroundImage: `
            url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%233b82f6' fill-opacity='0.05'%3E%3Cpath d='M20 20h8v8h-8zM32 32h4v4h-4zM48 16h6v6h-6zM64 44h5v5h-5zM12 52h7v7h-7zM60 8h3v3h-3zM40 60h4v4h-4zM8 36h6v6h-6zM56 72h8v8h-8zM24 64h5v5h-5zM72 20h4v4h-4zM16 8h5v5h-5z'/%3E%3C/g%3E%3C/svg%3E"),
            url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%233b82f6' fill-opacity='0.03'%3E%3Ccircle cx='20' cy='20' r='2'/%3E%3Ccircle cx='80' cy='40' r='1.5'/%3E%3Ccircle cx='40' cy='80' r='3'/%3E%3Ccircle cx='100' cy='100' r='2'/%3E%3Ccircle cx='60' cy='20' r='1'/%3E%3Ccircle cx='20' cy='100' r='2.5'/%3E%3Ccircle cx='100' cy='60' r='1.5'/%3E%3Ccircle cx='40' cy='40' r='1'/%3E%3C/g%3E%3C/svg%3E"),
            url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%233b82f6' fill-opacity='0.04'%3E%3Cpath d='M25 15l5 8h-10zM70 20l4 6h-8zM45 70l6 10h-12zM80 80l3 5h-6zM15 60l7 12h-14zM90 40l4 7h-8z'/%3E%3C/g%3E%3C/svg%3E")
          `
        }}
      >
        {isLoadingChat ? (
          // Chargement de l'historique
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-gray-600">Chargement de votre conversation...</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-w-4xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[80%] px-4 py-2 rounded-2xl shadow-sm relative
                    ${message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md ml-12'
                      : 'bg-white text-gray-800 rounded-bl-md mr-12 border'
                    }
                  `}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  <p className={`
                    text-xs mt-1 
                    ${message.role === 'user' ? 'text-white/70' : 'text-gray-500'}
                  `}>
                    {formatTime(message.timestamp)}
                  </p>
                  
                  {/* Petite flèche style WhatsApp */}
                  <div className={`
                    absolute top-0 w-0 h-0
                    ${message.role === 'user'
                      ? 'right-0 border-l-[8px] border-l-primary border-t-[8px] border-t-transparent'
                      : 'left-0 border-r-[8px] border-r-white border-t-[8px] border-t-transparent'
                    }
                  `} />
                </div>
              </div>
            ))}
            
            {/* Indicateur de frappe */}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border mr-12 relative">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    <span className="text-gray-500 text-sm">Votre assistant est en train d'écrire...</span>
                  </div>
                  
                  {/* Flèche */}
                  <div className="absolute top-0 left-0 w-0 h-0 border-r-[8px] border-r-white border-t-[8px] border-t-transparent" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Zone de saisie - style WhatsApp */}
      <div className="bg-white border-t p-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 bg-gray-100 rounded-full px-4 py-2 border">
              <textarea
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Tapez votre message..."
                className="w-full bg-transparent resize-none outline-none text-gray-800 placeholder-gray-500"
                rows={1}
                style={{ minHeight: '24px', maxHeight: '120px' }}
                disabled={isSending || isLoadingChat}
                maxLength={1000}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!currentMessage.trim() || isSending || isLoadingChat}
              className="w-12 h-12 bg-primary hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-primary-foreground rounded-full transition-colors flex items-center justify-center"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          
          <div className="flex justify-between items-center mt-2 px-1">
            <p className="text-xs text-gray-500">
              Appuyez sur Entrée pour envoyer
            </p>
            {messages.length > 1 && (
              <p className="text-xs text-gray-400">
                {messages.length - 1} messages échangés
              </p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: hsl(var(--primary));
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: hsl(var(--primary));
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }
        
        .animate-bounce {
          animation: bounce 1.4s infinite ease-in-out both;
        }
      `}</style>
    </div>
  );
}