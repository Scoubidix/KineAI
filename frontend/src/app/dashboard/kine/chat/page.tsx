'use client';

// Page du chat unifié : sidebar interne de conversations (en plus de la sidebar AppLayout)
// + zone de chat. Le router backend décide du type d'IA à chaque message.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wand2, Send, Loader2, Lock, Stethoscope, BookOpen, Activity } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { PaywallModal } from '@/components/PaywallModal';
import { usePaywall } from '@/hooks/usePaywall';
import { useConversations } from '@/hooks/useConversations';
import { useChatStream, DonePayload } from '@/hooks/useChatStream';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';
import { MessageBubble, ChatUIMessage } from '@/components/chat/MessageBubble';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const MESSAGE_MAX_CHARS = 15000;
// Plans sans CTA upgrade (pas de plan supérieur à vendre)
const TOP_PLANS = ['PIONNIER', 'EXPERT'];

// Domaines d'expertise mobilisés automatiquement par le routeur (écran d'accueil)
const EXPERTISE_CHIPS = [
  { label: 'Clinique', icon: Stethoscope, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { label: 'Recherche scientifique', icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { label: 'Exercices & rééducation', icon: Activity, color: 'text-pink-500', bg: 'bg-pink-500/10' },
];


export default function UnifiedChatPage() {
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatUIMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  // Panneau de conversations : ouvert par défaut sur desktop, fermé sur mobile
  // (mesuré une fois au montage — la transition de largeur rend l'ouverture fluide)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  useEffect(() => {
    if (window.innerWidth >= 768) {
      setIsSidebarCollapsed(false);
    }
  }, []);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  // Type d'IA routée pour le message en cours (phrases d'attente spécifiques)
  const [routedIaType, setRoutedIaType] = useState<'basique' | 'biblio' | 'clinique' | null>(null);

  const { subscription } = usePaywall();
  const {
    conversations,
    isLoading: isLoadingConversations,
    usage,
    loadConversations,
    loadUsage,
    renameConversation,
    deleteConversation,
  } = useConversations();
  const { sendMessage, isSending, isStreaming } = useChatStream();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  // L'id de conversation peut être créé en cours de stream (event conversation_created)
  const streamConversationIdRef = useRef<number | null>(null);

  // Chargement initial : conversations + quota + prénom (pour le message d'accueil)
  useEffect(() => {
    const auth = getAuth(app);
    const loadProfile = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API_BASE}/kine/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data?.firstName) setFirstName(data.firstName);
      } catch {
        // Pas bloquant : le message d'accueil s'affiche sans prénom
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await Promise.all([loadConversations(), loadUsage(), loadProfile()]);
      }
    });
    return () => unsubscribe();
  }, [loadConversations, loadUsage]);

  // Quota épuisé détecté au chargement
  useEffect(() => {
    if (usage && usage.remaining <= 0) setIsQuotaExceeded(true);
  }, [usage]);

  // Auto-scroll si l'utilisateur est en bas
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
    if (isNearBottomRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages]);

  // Charge les messages d'une conversation existante
  const selectConversation = useCallback(async (conversationId: number) => {
    setActiveConversationId(conversationId);
    setIsLoadingMessages(true);
    setChatMessages([]);
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(
          data.conversation.messages.map((m: { role: string; content: string; iaType?: string }) => ({
            role: m.role,
            content: m.content,
            iaType: m.iaType,
          }))
        );
      }
    } catch (error) {
      console.error('Erreur chargement conversation:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setChatMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: number) => {
      const deleted = await deleteConversation(id);
      if (deleted && id === activeConversationId) {
        startNewConversation();
      }
    },
    [deleteConversation, activeConversationId, startNewConversation]
  );

  const updateLastAssistantMessage = (updater: (msg: ChatUIMessage) => ChatUIMessage) => {
    setChatMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = updater(updated[updated.length - 1]);
      return updated;
    });
  };

  const handleSend = async () => {
    if (!message.trim() || isSending || isQuotaExceeded) return;

    const currentMessage = message.trim();
    setMessage('');
    setRoutedIaType(null);
    streamConversationIdRef.current = activeConversationId;

    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: currentMessage },
      { role: 'assistant', content: '' },
    ]);

    let accumulated = '';

    await sendMessage({
      message: currentMessage,
      conversationId: activeConversationId,
      onConversationCreated: (conversationId) => {
        streamConversationIdRef.current = conversationId;
        setActiveConversationId(conversationId);
      },
      onRouted: (iaType) => {
        setRoutedIaType(iaType);
        // Pose l'iaType sur le message en cours dès le routage (avant les tokens),
        // pour que le repli des références biblio s'applique pendant le streaming.
        updateLastAssistantMessage((msg) => ({ ...msg, iaType }));
      },
      onToken: (delta) => {
        accumulated += delta;
        const current = accumulated;
        updateLastAssistantMessage((msg) => ({ ...msg, content: current }));
      },
      onDone: async (payload: DonePayload) => {
        updateLastAssistantMessage((msg) => ({
          ...msg,
          iaType: payload.iaType,
          content: payload.truncated
            ? `${msg.content}\n\n*Réponse interrompue (limite de longueur). Demande-moi de poursuivre sur un point précis.*`
            : msg.content,
        }));
        // Rafraîchit la sidebar (titre LLM généré en arrière-plan) + la jauge quota
        await Promise.all([loadConversations(), loadUsage()]);
      },
      onError: (error) => {
        updateLastAssistantMessage((msg) => ({ ...msg, content: error }));
      },
      onQuotaExceeded: () => {
        setIsQuotaExceeded(true);
        // Retire le placeholder assistant et le message non envoyé
        setChatMessages((prev) => prev.slice(0, -2));
        setMessage(currentMessage);
      },
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isTopPlan = usage ? TOP_PLANS.includes(usage.planType) : false;

  return (
    <AppLayout>
      {/* Header compact */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/40">
        <Wand2 className="text-[#3899aa] h-4 w-4 shrink-0" />
        <h2 className="text-sm font-medium text-[#3899aa]">Assistant IA</h2>
      </div>

      <div className="flex h-[calc(100dvh-130px)]">
        {/* Sidebar interne de conversations (en plus de la sidebar AppLayout) */}
        <ConversationSidebar
          conversations={conversations}
          isLoading={isLoadingConversations}
          activeConversationId={activeConversationId}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((c) => !c)}
          onSelect={selectConversation}
          onNewConversation={startNewConversation}
          onRename={renameConversation}
          onDelete={handleDeleteConversation}
        />

        {/* Zone de chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={messagesContainerRef}
            className="flex-1 px-2 py-4 sm:px-6 overflow-y-auto scroll-smooth scrollbar-hide"
            style={{
              overflowAnchor: 'none',
              maskImage: 'linear-gradient(to bottom, transparent, black 32px)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 32px)',
            }}
          >
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-2xl px-4">
                  <Wand2 className="w-10 h-10 text-[#3899aa] mx-auto mb-5" />
                  {firstName && (
                    <p className="text-2xl md:text-3xl font-semibold text-primary mb-1">Bonjour {firstName},</p>
                  )}
                  <h2 className="text-2xl md:text-3xl font-semibold text-primary">
                    Ton copilote IA kiné
                  </h2>
                  <p className="mt-3 text-base text-muted-foreground">
                    Pose ta question comme tu le ferais à un confrère.
                  </p>
                  <p className="text-base text-muted-foreground">
                    L&apos;IA identifie ton besoin et mobilise les bonnes expertises.
                  </p>

                  {/* Domaines couverts — chips colorés à la manière d'un copilote */}
                  <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                    {EXPERTISE_CHIPS.map(({ label, icon: Icon, color, bg }) => (
                      <span
                        key={label}
                        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-foreground/80"
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md ${bg}`}>
                          <Icon className={`h-3.5 w-3.5 ${color}`} />
                        </span>
                        {label}
                      </span>
                    ))}
                  </div>

                  <p className="mt-7 text-[11px] text-muted-foreground/80">
                    Outil d&apos;aide informatif uniquement — ne constitue en aucun cas un diagnostic médical ni un avis thérapeutique.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8 max-w-4xl mx-auto">
                {chatMessages.map((msg, index) => {
                  const isLastAssistant = msg.role === 'assistant' && index === chatMessages.length - 1;
                  // Masque le placeholder vide avant le 1er token
                  if (isLastAssistant && !msg.content && isSending && !isStreaming) return null;
                  return (
                    <MessageBubble
                      key={index}
                      message={msg}
                      isStreaming={isLastAssistant && isStreaming}
                    />
                  );
                })}

                {isSending && !isStreaming && <ThinkingIndicator iaType={routedIaType} />}
              </div>
            )}
          </div>

          {/* Bandeau quota épuisé */}
          {isQuotaExceeded && (
            <div className="mx-2 sm:mx-6 mb-2 rounded-lg border border-[#3899aa]/40 bg-[#3899aa]/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-sm text-foreground/90 flex-1">
                {isTopPlan
                  ? 'Quota quotidien atteint. Ton quota se réinitialise à minuit — reviens demain !'
                  : 'Quota quotidien atteint. Passe au plan supérieur pour continuer dès maintenant, ou reviens demain.'}
              </p>
              {!isTopPlan && (
                <Button onClick={() => setIsPaywallOpen(true)} className="btn-teal rounded-full text-sm h-9 px-4 shrink-0">
                  <Lock className="h-3.5 w-3.5 mr-2" />
                  Voir les plans
                </Button>
              )}
            </div>
          )}

          {/* Input */}
          <div className="px-2 sm:px-6 pb-2">
            <div className="relative flex items-center bg-white dark:bg-card border-2 border-border rounded-full px-4 py-1 shadow-sm focus-within:border-[#3899aa]/60 focus-within:shadow-md transition-all">
              <Input
                placeholder={isQuotaExceeded ? 'Quota quotidien atteint' : 'Pose ta question ici...'}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isSending || isQuotaExceeded}
                maxLength={MESSAGE_MAX_CHARS}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[40px] px-0 placeholder:text-muted-foreground/60"
              />
              <Button
                onClick={handleSend}
                disabled={isSending || isQuotaExceeded || !message.trim()}
                size="icon"
                className="shrink-0 h-8 w-8 rounded-full btn-teal ml-2"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 px-2">
              <span className="text-red-400">L&apos;IA peut faire des erreurs.</span>
              <span className="hidden sm:inline"> — Entrée pour envoyer</span>
            </p>
          </div>
        </div>
      </div>

      <PaywallModal isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} subscription={subscription} />
    </AppLayout>
  );
}
