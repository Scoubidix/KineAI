'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { usePionniersChat, type PionnierMessage } from '@/hooks/usePionniersChat';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';

// Position verticale de l'ancre « Nouveaux messages » a l'ouverture, en fraction
// de la hauteur visible. 0.4 = un peu au-dessus du milieu : le separateur ET les
// premiers messages non lus sont visibles sans avoir a scroller.
const ANCHOR_VIEWPORT_RATIO = 0.4;

export default function PionniersChat() {
  const router = useRouter();
  const {
    messages, loading, error, hasMore, firstUnreadId, currentKineId, isAdmin, hasAccess,
    sendMessage, editMessage, deleteMessage, loadOlder, markRead, refreshMedia,
  } = usePionniersChat();

  // Garde d'appartenance cote client : la vraie barriere reste le 403 du serveur.
  useEffect(() => {
    if (hasAccess === false) router.replace('/dashboard/kine/home');
  }, [hasAccess, router]);

  const [replyTo, setReplyTo] = useState<PionnierMessage | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  // Le lecteur etait-il colle au bas du fil avant le dernier rendu ?
  const wasAtBottom = useRef(true);
  // Hauteur du fil avant un chargement d'historique, pour restaurer la position.
  const heightBeforeLoad = useRef<number | null>(null);
  // Id de l'ancre tant que le lecteur n'a pas scrolle lui-meme : les images qui
  // finissent de charger decalent le fil, il faut alors repositionner.
  const pendingAnchorId = useRef<number | null>(null);

  /** Place le message `id` a ANCHOR_VIEWPORT_RATIO de la hauteur visible. */
  const anchorTo = useCallback((id: number) => {
    const container = scrollRef.current;
    if (!container) return false;

    const target = container.querySelector(`[data-message-id="${id}"]`);
    if (!target) return false;

    // Calcul manuel plutot que scrollIntoView : scrollIntoView remonte aussi les
    // ancetres scrollables (la fenetre comprise) et son « center » ne tient pas
    // compte du bandeau ni du composer.
    const delta = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += delta - container.clientHeight * ANCHOR_VIEWPORT_RATIO;
    return true;
  }, []);

  // Positionnement a l'ouverture. En useLayoutEffect (et non useEffect) pour
  // s'executer avant la peinture : sinon le haut du fil s'affiche brievement.
  useLayoutEffect(() => {
    if (loading || didInitialScroll.current || messages.length === 0) return;
    didInitialScroll.current = true;

    const container = scrollRef.current;
    if (!container) return;

    if (firstUnreadId && anchorTo(firstUnreadId)) {
      // Vue parquee ailleurs qu'en bas : evite que l'effet stick-to-bottom
      // (meme commit, declare apres) n'ecrase ce positionnement.
      wasAtBottom.current = false;
      pendingAnchorId.current = firstUnreadId;
      return;
    }

    // Ancre hors de la page chargee (plus de 50 non-lus) : on reste EN HAUT du
    // fil charge plutot que de descendre en bas. Descendre declencherait onScroll
    // -> markRead et marquerait lu tout un retard que le lecteur n'a jamais vu.
    if (firstUnreadId) {
      container.scrollTop = 0;
      wasAtBottom.current = false;
      return;
    }

    container.scrollTop = container.scrollHeight;
    wasAtBottom.current = true;
  }, [loading, messages, firstUnreadId, anchorTo]);

  // Les images n'ont pas de dimensions connues avant leur chargement : chacune
  // decale le fil et ferait deriver l'ancre. On repositionne tant que le lecteur
  // n'a pas pris la main (`load` ne bouillonne pas -> ecoute en capture).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onMediaLoad = () => {
      if (pendingAnchorId.current !== null) anchorTo(pendingAnchorId.current);
    };
    container.addEventListener('load', onMediaLoad, true);
    return () => container.removeEventListener('load', onMediaLoad, true);
  }, [anchorTo]);

  // Apres chaque arrivee de messages : si le lecteur etait colle en bas, on l'y
  // maintient ; s'il vient de charger de l'historique, on restaure sa position
  // (sinon l'insertion de 50 messages au-dessus fait sauter la vue).
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !didInitialScroll.current) return;

    if (heightBeforeLoad.current !== null) {
      container.scrollTop += container.scrollHeight - heightBeforeLoad.current;
      heightBeforeLoad.current = null;
      return;
    }
    if (wasAtBottom.current) container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Le curseur de lecture est pousse quand le lecteur atteint le bas du fil.
  // markRead est idempotent (il ne repost pas un curseur deja envoye), donc
  // l'appeler a chaque evenement de scroll ne genere pas de rafale de requetes.
  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    // Le lecteur a pris la main : on cesse de recaler l'ancre.
    pendingAnchorId.current = null;
    wasAtBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    if (wasAtBottom.current) markRead();
  };

  const handleLoadOlder = () => {
    if (scrollRef.current) heightBeforeLoad.current = scrollRef.current.scrollHeight;
    loadOlder();
  };

  return (
    <div className="flex h-[calc(100dvh-130px)] flex-col">
      {/* Bandeau d'avertissement — seul element chrome conserve en tete de page */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-1.5 text-xs text-[#3899aa]">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>Espace confraternel — ne partage aucune donnée permettant d’identifier un patient.</span>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto scroll-smooth px-2 py-4 sm:px-6"
        style={{ overflowAnchor: 'none' }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-muted-foreground">
              Personne n’a encore écrit. Lance la conversation !
            </p>
          </div>
        ) : (
          <MessageList
            messages={messages}
            firstUnreadId={firstUnreadId}
            currentKineId={currentKineId}
            isAdmin={isAdmin}
            hasMore={hasMore}
            onLoadOlder={handleLoadOlder}
            onReply={setReplyTo}
            onDelete={deleteMessage}
            onZoom={setZoomed}
            onRefreshMedia={refreshMedia}
            onEdit={editMessage}
          />
        )}
      </div>

      {error && <p className="px-4 pb-1 text-xs text-destructive sm:px-6">{error}</p>}

      <MessageComposer replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={sendMessage} />

      <Dialog open={!!zoomed} onOpenChange={(o) => !o && setZoomed(null)}>
        <DialogContent className="w-[96vw] max-w-5xl border-0 bg-transparent p-0 shadow-none">
          {zoomed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoomed} alt="" className="mx-auto max-h-[90vh] w-auto rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
