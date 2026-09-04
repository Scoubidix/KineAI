'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { usePionniersChat, type PionnierMessage } from '@/hooks/usePionniersChat';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';

export default function PionniersChat() {
  const router = useRouter();
  const {
    messages, loading, error, hasMore, firstUnreadId, currentKineId, isAdmin, hasAccess,
    sendMessage, deleteMessage, loadOlder, markRead,
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

  // Positionnement a l'ouverture : sur le 1er non-lu s'il y en a un, sinon en bas.
  // En useLayoutEffect (et non useEffect) pour s'executer avant la peinture du
  // navigateur : sinon le haut du fil s'affiche brievement avant le saut a l'ancre.
  useLayoutEffect(() => {
    if (loading || didInitialScroll.current || messages.length === 0) return;
    didInitialScroll.current = true;

    const container = scrollRef.current;
    if (!container) return;

    if (firstUnreadId) {
      const target = container.querySelector(`[data-message-id="${firstUnreadId}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        // Vue parquee ailleurs qu'en bas : evite que l'effet stick-to-bottom
        // (meme commit, declare apres) n'ecrase ce positionnement.
        wasAtBottom.current = false;
        return;
      }
    }
    container.scrollTop = container.scrollHeight;
    wasAtBottom.current = true;
  }, [loading, messages, firstUnreadId]);

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

  // Le curseur de lecture est aussi pousse quand le lecteur atteint le bas du fil.
  // markRead est idempotent (il ne repost pas un curseur deja envoye), donc
  // l'appeler a chaque evenement de scroll ne genere pas de rafale de requetes.
  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    wasAtBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    if (wasAtBottom.current) markRead();
  };

  const handleLoadOlder = () => {
    if (scrollRef.current) heightBeforeLoad.current = scrollRef.current.scrollHeight;
    loadOlder();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-[#3899aa]/5 px-4 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 text-[#3899aa]" />
        <span>Espace confraternel — ne partage aucune donnée permettant d’identifier un patient.</span>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Personne n’a encore écrit. Lance la conversation !
          </p>
        ) : (
          <div>
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
            />
          </div>
        )}
      </div>

      {error && <p className="px-4 py-1 text-xs text-destructive">{error}</p>}

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
