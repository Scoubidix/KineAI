// src/components/patient/ChatbotTeaser.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, Loader2, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { patientChatbot } from '@/ai/flows/patient-chatbot';

export default function ChatbotTeaser() {
  const { toast } = useToast();
  const [quickQuestion, setQuickQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [botResponse, setBotResponse] = useState<string | null>(null);

  const handleQuickQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = quickQuestion.trim();
    if (!message) return;

    setIsSending(true);
    setBotResponse(null);

    try {
      const response = await patientChatbot({ message });
      setBotResponse(response.response);
      setQuickQuestion(''); // Clear input after sending
    } catch (error) {
      console.error("Quick Chatbot Error:", error);
      toast({
        variant: "destructive",
        title: "Erreur Chatbot",
        description: "Désolé, une erreur est survenue. Veuillez réessayer.",
      });
      setBotResponse("Oups ! Je rencontre quelques difficultés techniques. Réessayez ou allez sur la page de chat complète.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="shadow-lg border-border mt-8">
      <CardHeader className="bg-card">
        <CardTitle className="flex items-center gap-3 text-lg md:text-xl font-semibold text-primary">
          <MessageSquare className="text-accent h-5 w-5" /> Coach Santé KineAI
        </CardTitle>
        <CardDescription>Posez une question rapide ou discutez en détail.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <form onSubmit={handleQuickQuestion} className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Ex: Comment bien faire une fente ?"
            value={quickQuestion}
            onChange={(e) => setQuickQuestion(e.target.value)}
            disabled={isSending}
            className="flex-1 bg-background focus:ring-accent"
            aria-label="Question rapide au chatbot"
          />
          <Button type="submit" size="icon" disabled={isSending || !quickQuestion} className="bg-accent hover:bg-accent/90 text-accent-foreground w-9 h-9">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Envoyer</span>
          </Button>
        </form>
        {isSending && (
          <div className="flex items-center text-muted-foreground text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Le coach réfléchit...
          </div>
        )}
         {botResponse && (
            <div className="mt-4 p-3 rounded-md bg-muted/80 border border-border text-sm">
                <div className="flex items-start gap-2">
                    <Bot className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                    <p className="flex-1">{botResponse}</p>
                </div>
            </div>
         )}
      </CardContent>
      <CardFooter className="border-t border-border pt-4">
        <Button asChild variant="outline" className="w-full md:w-auto ml-auto hover:bg-muted hover:text-accent-foreground">
          <Link href="/dashboard/patient/chat">
            <MessageSquare className="mr-2 h-4 w-4" /> Ouvrir le Chat Complet
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
