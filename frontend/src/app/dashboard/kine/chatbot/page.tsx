'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

export default function KineChatbotPage() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setResponse('');

    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });

      const data = await res.json();
      setResponse(data.reply || 'Aucune réponse reçue.');
    } catch (err) {
      setResponse("Erreur lors de l'appel à l'assistant.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <Wand2 className="text-accent" /> Assistant IA Kiné
            </CardTitle>
            <CardDescription>Posez une question à l'IA sur vos patients.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Votre question..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
              />
              <Button onClick={handleAsk} disabled={loading}>
                {loading ? '...' : 'Envoyer'}
              </Button>
            </div>
            {response && (
              <div className="p-4 bg-muted/50 rounded-md border text-sm whitespace-pre-wrap">
                {response}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
