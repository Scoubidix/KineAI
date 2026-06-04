'use client';

// Hook du chat unifié : liste/CRUD des conversations + usage quota du jour.
import { useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface ConversationSummary {
  id: number;
  title: string | null;
  updatedAt: string;
}

export interface QuotaUsage {
  date: string;
  tokensUsed: number;
  limit: number;
  remaining: number;
  planType: string;
}

const getAuthToken = async () => {
  const auth = getAuth(app);
  return await auth.currentUser?.getIdToken();
};

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [usage, setUsage] = useState<QuotaUsage | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsage(data.usage);
      }
    } catch (error) {
      console.error('Erreur chargement usage:', error);
    }
  }, []);

  const renameConversation = useCallback(async (id: number, title: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c))
        );
      }
    } catch (error) {
      console.error('Erreur renommage conversation:', error);
    }
  }, []);

  const deleteConversation = useCallback(async (id: number) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_BASE}/api/chat/kine/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erreur suppression conversation:', error);
      return false;
    }
  }, []);

  return {
    conversations,
    isLoading,
    usage,
    loadConversations,
    loadUsage,
    renameConversation,
    deleteConversation,
  };
}
