'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Send, Loader2, MessageSquare, Plus, ArrowLeft, CheckCircle2, CircleCheck } from 'lucide-react';

interface TicketMessage {
  id: number;
  body: string;
  isAdmin: boolean;
  createdAt: string;
}

interface Ticket {
  id: number;
  subject: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
}

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTicketId?: number | null;
}

export function SupportModal({ open, onOpenChange, initialTicketId }: SupportModalProps) {
  const [activeTab, setActiveTab] = useState('new');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetchTickets();
    } else {
      // Reset a la fermeture
      setSelectedTicket(null);
    }
  }, [open]);

  // Ouvrir un ticket specifique si initialTicketId est fourni
  useEffect(() => {
    if (open && initialTicketId && tickets.length > 0) {
      const ticket = tickets.find(t => t.id === initialTicketId);
      if (ticket) {
        setSelectedTicket(ticket);
        setActiveTab('history');
      }
    }
  }, [open, initialTicketId, tickets]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicket?.messages]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets`);
      if (res.ok) {
        const json = await res.json();
        setTickets(json.data);
      }
    } catch {
      // Silencieux
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!subject.trim() || !body.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets`, {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });

      if (res.ok) {
        setSuccess('Votre requete a bien ete envoyee !');
        setSubject('');
        setBody('');
        fetchTickets();
        setTimeout(() => {
          setSuccess('');
          setActiveTab('history');
        }, 1500);
      } else {
        const json = await res.json();
        setError(json.error || 'Erreur lors de l\'envoi.');
      }
    } catch {
      setError('Erreur de connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !selectedTicket) return;

    setSubmitting(true);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets/${selectedTicket.id}/messages`,
        { method: 'POST', body: JSON.stringify({ body: replyBody.trim() }) }
      );

      if (res.ok) {
        setReplyBody('');
        // Rafraichir le ticket
        const ticketRes = await fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets/${selectedTicket.id}`
        );
        if (ticketRes.ok) {
          const json = await ticketRes.json();
          setSelectedTicket(json.data);
          fetchTickets();
        }
      }
    } catch {
      // Silencieux
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async (ticketId: number) => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets/${ticketId}/close`,
        { method: 'PUT' }
      );
      if (res.ok) {
        setSelectedTicket(null);
        fetchTickets();
      }
    } catch {
      // Silencieux
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] w-[calc(100%-2rem)] h-[min(520px,85vh)] flex flex-col p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base sm:text-lg">Support / Aide</DialogTitle>
        </DialogHeader>

        {selectedTicket ? (
          // Vue detail du ticket
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(null)} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{selectedTicket.subject}</p>
                <Badge variant={selectedTicket.status === 'OPEN' ? 'default' : 'secondary'} className="text-xs mt-0.5">
                  {selectedTicket.status === 'OPEN' ? 'En cours' : 'Resolu'}
                </Badge>
              </div>
              {selectedTicket.status === 'OPEN' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleClose(selectedTicket.id)}
                  className="shrink-0 text-xs gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                >
                  <CircleCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cloturer</span>
                </Button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
              {selectedTicket.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.isAdmin ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] sm:max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.isAdmin
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${msg.isAdmin ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                      {msg.isAdmin ? 'Support' : 'Vous'} - {formatDate(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Repondre */}
            {selectedTicket.status === 'OPEN' && (
              <div className="flex gap-2 mt-3 pt-3 border-t shrink-0">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Votre message..."
                  className="min-h-[50px] max-h-[80px] resize-none text-sm"
                  maxLength={5000}
                />
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={submitting || !replyBody.trim()}
                  className="self-end h-9 w-9 p-0 shrink-0"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        ) : (
          // Onglets nouvelle requete / historique
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="new" className="text-xs sm:text-sm">
                <Plus className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
                Nouvelle requete
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs sm:text-sm">
                <MessageSquare className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
                Mes requetes
                {tickets.filter(t => t.status === 'OPEN').length > 0 && (
                  <Badge variant="destructive" className="ml-1 sm:ml-1.5 text-[10px] px-1.5 py-0">
                    {tickets.filter(t => t.status === 'OPEN').length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-4 flex-1 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="support-subject">Objet de la demande</Label>
                  <Input
                    id="support-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Probleme avec mon abonnement"
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support-body">Message</Label>
                  <Textarea
                    id="support-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Decrivez votre probleme ou votre question..."
                    className="min-h-[100px] sm:min-h-[120px] resize-none"
                    maxLength={5000}
                  />
                  <p className="text-xs text-muted-foreground text-right">{body.length}/5000</p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {success && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {success}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Envoyer la requete
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="history" className="mt-4 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  Aucune requete pour le moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm truncate flex-1">{ticket.subject}</p>
                        <Badge
                          variant={ticket.status === 'OPEN' ? 'default' : 'secondary'}
                          className="text-[10px] shrink-0"
                        >
                          {ticket.status === 'OPEN' ? 'En cours' : 'Resolu'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground">
                          {ticket.messages.length} message{ticket.messages.length > 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
