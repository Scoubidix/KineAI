'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL_MS = 7000;
const PAGE_SIZE = 50;

export interface PionnierAuthor {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface PionnierReplyTo {
  id: number;
  displayName: string;
  excerpt: string;
}

export interface PionnierMessage {
  id: number;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: PionnierAuthor;
  replyTo: PionnierReplyTo | null;
}

export function usePionniersChat() {
  const [messages, setMessages] = useState<PionnierMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [firstUnreadId, setFirstUnreadId] = useState<number | null>(null);
  const [currentKineId, setCurrentKineId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // null tant que la reponse n'est pas arrivee ; false = non-membre (redirection).
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  // Dernier id connu : sert de curseur de polling ET de valeur postee a /read.
  const lastIdRef = useRef(0);
  // Dernier curseur reellement envoye au serveur, pour ne pas reposter a l'identique.
  const lastSentReadRef = useRef(0);

  const pushMessages = useCallback((incoming: PionnierMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const merged = [...prev, ...incoming.filter((m) => !known.has(m.id))];
      merged.sort((a, b) => a.id - b.id);
      return merged;
    });
    const maxId = Math.max(...incoming.map((m) => m.id));
    if (maxId > lastIdRef.current) lastIdRef.current = maxId;
  }, []);

  // Appelable a volonte : sans le garde-fou, le handler de scroll enverrait des
  // dizaines de POST par seconde en bas de fil.
  const markRead = useCallback(() => {
    const target = lastIdRef.current;
    if (target === 0 || target === lastSentReadRef.current) return;
    lastSentReadRef.current = target;

    fetchWithAuth(`${API_URL}/api/pionniers/read`, {
      method: 'POST',
      body: JSON.stringify({ lastReadMessageId: target }),
    })
      .then((res) => {
        // fetchWithAuth ne rejette pas sur un statut d'erreur : sans ce test, un 500
        // laisserait la garde epinglee et aucun nouvel essai ne serait tente.
        if (!res.ok) lastSentReadRef.current = 0;
      })
      .catch(() => {
        // Echec reseau : on autorise aussi un nouvel essai au prochain appel.
        lastSentReadRef.current = 0;
      });
  }, []);

  // Chargement initial : ancre de non-lus figee, puis derniere page du fil.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const unreadRes = await fetchWithAuth(`${API_URL}/api/pionniers/unread-count`);
        const unread = await unreadRes.json();
        if (!cancelled && unread.success) {
          // firstUnreadId n'est lu QU'ICI : l'ancre reste figee pendant toute la visite.
          setFirstUnreadId(unread.firstUnreadId ?? null);
          setIsAdmin(Boolean(unread.isAdmin));
          setCurrentKineId(unread.kineId ?? null);
          setHasAccess(Boolean(unread.hasAccess));
          if (!unread.hasAccess) { setLoading(false); return; }
        }

        const res = await fetchWithAuth(`${API_URL}/api/pionniers/messages?limit=${PAGE_SIZE}`);
        if (!res.ok) throw new Error('Chargement impossible');
        const data = await res.json();
        if (cancelled) return;

        pushMessages(data.messages);
        setHasMore(data.messages.length === PAGE_SIZE);

        // On ne marque lu a l'ouverture que si l'ancre est bien dans la page chargee.
        // Au-dela de PAGE_SIZE non-lus (nouveau membre, longue absence), avancer le
        // curseur ici eteindrait la pastille sans que rien n'ait ete vu : on attend
        // alors que le membre atteigne le bas du fil.
        const anchor = unread.firstUnreadId ?? null;
        const oldestLoaded = data.messages[0]?.id ?? 0;
        if (!anchor || anchor >= oldestLoaded) markRead();
      } catch {
        if (!cancelled) setError('Impossible de charger la conversation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pushMessages, markRead]);

  // Polling : suspendu quand l'onglet passe en arriere-plan, relance immediate au retour.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (document.hidden) return;
      try {
        // Salon encore vide (cas du jour 1) : lastIdRef vaut 0, il n'y a pas de
        // curseur `after` a envoyer — on redemande la derniere page.
        const url = lastIdRef.current > 0
          ? `${API_URL}/api/pionniers/messages?after=${lastIdRef.current}`
          : `${API_URL}/api/pionniers/messages?limit=${PAGE_SIZE}`;

        const res = await fetchWithAuth(url);
        if (!res.ok) return;
        const data = await res.json();
        // PAS de markRead() ici : un message qui arrive pendant que le lecteur est
        // remonte dans un retard de plusieurs pages marquerait tout le retard comme
        // lu. Quand il est reellement en bas, l'effet stick-to-bottom fait defiler,
        // ce qui declenche onScroll -> markRead.
        if (data.messages?.length) pushMessages(data.messages);
      } catch { /* silencieux : reessai au tick suivant */ }
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(poll, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      poll();
      start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pushMessages, markRead]);

  // Curseur pousse aussi au demontage (fermeture d'onglet, navigation interne).
  useEffect(() => markRead, [markRead]);

  const loadOlder = useCallback(async () => {
    const oldest = messages[0]?.id;
    if (!oldest || !hasMore) return;
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/pionniers/messages?before=${oldest}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setHasMore(data.messages.length === PAGE_SIZE);
      if (data.messages.length) {
        setMessages((prev) => {
          const known = new Set(prev.map((m: PionnierMessage) => m.id));
          return [...data.messages.filter((m: PionnierMessage) => !known.has(m.id)), ...prev];
        });
      }
    } catch { /* silencieux */ }
  }, [messages, hasMore]);

  const sendMessage = useCallback(
    async (body: string, image: File | null, replyToId: number | null) => {
      const formData = new FormData();
      formData.append('body', body);
      if (replyToId) formData.append('replyToId', String(replyToId));
      if (image) formData.append('image', image);

      try {
        const res = await fetchWithAuth(`${API_URL}/api/pionniers/messages`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Envoi impossible.');
          return false;
        }
        const data = await res.json();
        pushMessages([data.message]);
        markRead();
        setError(null);
        return true;
      } catch {
        setError('Envoi impossible.');
        return false;
      }
    },
    [pushMessages, markRead]
  );

  const deleteMessage = useCallback(async (id: number) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/pionniers/messages/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Suppression impossible.');
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError('Suppression impossible.');
    }
  }, []);

  // Les URLs signees GCS expirent au bout d'une heure alors que la page reste
  // ouverte toute la journee : quand une image echoue a charger, on redemande des
  // URLs fraiches pour CE message seulement. `refreshing` evite qu'une salve
  // d'images expirees ne declenche autant d'appels que d'images.
  const refreshing = useRef<Set<number>>(new Set());
  const refreshMedia = useCallback(async (id: number) => {
    if (refreshing.current.has(id)) return;
    refreshing.current.add(id);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/pionniers/messages/${id}/media`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                imageUrl: data.imageUrl ?? m.imageUrl,
                author: { ...m.author, avatarUrl: data.avatarUrl ?? m.author.avatarUrl },
              }
            : m
        )
      );
    } catch {
      /* silencieux : l'image reste cassee, un rechargement la retablira */
    } finally {
      refreshing.current.delete(id);
    }
  }, []);

  return {
    messages, loading, error, hasMore, firstUnreadId, currentKineId, isAdmin, hasAccess,
    sendMessage, deleteMessage, loadOlder, markRead, refreshMedia,
  };
}
