'use client';

import React, { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Send, User, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { patientChatbot } from '@/ai/flows/patient-chatbot';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

export default function PatientChatbotPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Initialize chat with welcome message
  useEffect(() => {
    if (messages.length === 0) {
        setMessages([
            { sender: 'bot', text: `Bonjour ! Je suis votre coach santé KineAI. Comment puis-je vous aider avec vos exercices ou votre motivation aujourd'hui ? N'oubliez pas, je ne peux pas donner de diagnostic médical.`, timestamp: new Date() }
        ]);
    }
  }, [messages.length]); // Depend on messages.length to run only once

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (scrollAreaRef.current) {
          const viewport = scrollAreaRef.current.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
          if (viewport) {
             viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
          }
      }
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedMessage = inputMessage.trim();
    if (!trimmedMessage || isBotTyping) return;

    const newUserMessage: Message = {
      sender: 'user',
      text: trimmedMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    setIsBotTyping(true);
    scrollToBottom();

    try {
      const response = await patientChatbot({ message: trimmedMessage });

      const newBotMessage: Message = {
        sender: 'bot',
        text: response.response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, newBotMessage]);

    } catch (error) {
      console.error("Erreur Chatbot:", error);
      toast({
        variant: "destructive",
        title: "Erreur Chatbot",
        description: "Désolé, une erreur est survenue. Veuillez réessayer.",
      });
       const errorBotMessage: Message = {
            sender: 'bot',
            text: "Oups ! Je rencontre quelques difficultés techniques. Réessayez dans un instant.",
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorBotMessage]);
    } finally {
      setIsBotTyping(false);
    }
  };

  return (
    <AppLayout>
        {/* Adjusted height and styling */}
        <div className="flex flex-col h-[calc(100vh-120px)] max-h-[800px] max-w-3xl mx-auto border border-border rounded-lg overflow-hidden shadow-lg">
            <Card className="flex-1 flex flex-col bg-card overflow-hidden rounded-none border-none shadow-none"> {/* Use Card component without extra styling */}
            <CardHeader className="border-b border-border bg-card">
                <CardTitle className="flex items-center gap-3 text-primary font-semibold"> {/* Increased gap */}
                    <Bot className="text-accent h-6 w-6"/> Coach Santé KineAI
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
                <div className="space-y-4">
                    {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`flex items-start gap-3 ${ // Use items-start for better alignment with multiline
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                    >
                        {msg.sender === 'bot' && (
                        <Avatar className="h-8 w-8 self-start border border-border"> {/* Added border */}
                            <AvatarFallback className="bg-accent text-accent-foreground"><Bot size={18}/></AvatarFallback>
                        </Avatar>
                        )}
                        <div
                        className={`max-w-[75%] rounded-lg px-4 py-2 shadow-sm ${ // Increased padding slightly
                            msg.sender === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-none' // Style user bubble
                            : 'bg-muted text-foreground rounded-bl-none' // Style bot bubble
                        }`}
                        >
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        {msg.sender === 'user' && (
                        <Avatar className="h-8 w-8 self-start border border-border"> {/* Added border */}
                            <AvatarFallback className="bg-secondary text-secondary-foreground"><User size={18}/></AvatarFallback>
                        </Avatar>
                        )}
                    </div>
                    ))}
                    {isBotTyping && (
                     <div className="flex items-start gap-3 justify-start">
                         <Avatar className="h-8 w-8 self-start border border-border">
                             <AvatarFallback className="bg-accent text-accent-foreground"><Bot size={18}/></AvatarFallback>
                         </Avatar>
                         <div className="rounded-lg px-4 py-2 shadow-sm bg-muted text-muted-foreground rounded-bl-none">
                            <div className="flex space-x-1 items-center h-5">
                                <span className="block w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="block w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="block w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"></span>
                            </div>
                         </div>
                     </div>
                    )}
                </div>
                </ScrollArea>
            </CardContent>
            <CardFooter className="border-t border-border p-3 bg-card"> {/* Adjusted padding */}
                <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-3"> {/* Increased space */}
                <Input
                    type="text"
                    placeholder="Posez votre question..." // Updated placeholder
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={isBotTyping}
                    className="flex-1 bg-background focus:ring-accent" // Input styling
                    aria-label="Entrée de message de chat"
                    autoComplete="off"
                />
                <Button type="submit" size="icon" disabled={isBotTyping || !inputMessage.trim()} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-full w-10 h-10" aria-label="Envoyer"> {/* Circular button */}
                    <Send className="h-5 w-5" /> {/* Slightly larger icon */}
                    <span className="sr-only">Envoyer le message</span>
                </Button>
                </form>
            </CardFooter>
            </Card>
            {/* Removed the conversation history notice for cleaner look */}
      </div>
    </AppLayout>
  );
}
