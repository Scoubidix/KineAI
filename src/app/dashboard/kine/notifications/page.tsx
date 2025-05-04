
'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Bell, AlertCircle, MessageSquare, Send, Info } from 'lucide-react'; // Import Bell, AlertCircle, MessageSquare, Send
import { Button } from '@/components/ui/button'; // Import Button
import { Input } from '@/components/ui/input'; // Import Input
import { useToast } from '@/hooks/use-toast'; // Import useToast

export default function KineNotificationsPage() {
  const { toast } = useToast();
  // Simulate some notifications for display
  const notifications = [
    { id: 'notif1', type: 'pain_alert', patientName: 'Alice Martin', painLevel: 8, timestamp: new Date(Date.now() - 3600000), read: false },
    { id: 'notif2', type: 'message', patientName: 'Bob Dubois', messageContent: 'Bonjour Dr., je ressens une légère gêne au genou après la séance d\'hier. Est-ce normal ?', timestamp: new Date(Date.now() - 86400000 * 2), read: true },
    { id: 'notif3', type: 'pain_alert', patientName: 'Charlie Petit', painLevel: 7, timestamp: new Date(Date.now() - 86400000 * 3), read: false },
    { id: 'notif4', type: 'feedback', patientName: 'Alice Martin', timestamp: new Date(Date.now() - 86400000 * 1), read: true },
    { id: 'notif5', type: 'message', patientName: 'Eva Lefevre', messageContent: 'Tout s\'est bien passé ! Merci.', timestamp: new Date(Date.now() - 86400000 * 0.5), read: false },
  ];

  const [replyMessages, setReplyMessages] = useState<{ [key: string]: string }>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null); // Track which reply is being sent

  const handleReplyChange = (notifId: string, value: string) => {
    setReplyMessages(prev => ({ ...prev, [notifId]: value }));
  };

  const handleSendReply = async (notifId: string, patientName: string) => {
    const message = replyMessages[notifId];
    if (!message || !message.trim()) {
        toast({ variant: "destructive", title: "Erreur", description: "Le message de réponse ne peut pas être vide." });
        return;
    }
    setSendingReply(notifId);
    // Simulate sending reply
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`Simulated reply sent to ${patientName} for notification ${notifId}: ${message}`);
    toast({ title: "Réponse envoyée (Simulé)", description: `Votre réponse à ${patientName} a été envoyée.` });
    setReplyMessages(prev => ({ ...prev, [notifId]: '' })); // Clear input after sending
    setSendingReply(null);
    // In a real app, you'd call an API here to send the message
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-primary">Notifications</h1>

        <Card className="w-full max-w-2xl mx-auto shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Bell className="text-accent" /> Vos Notifications
            </CardTitle>
            <CardDescription>Consultez ici les alertes et messages importants.</CardDescription>
          </CardHeader>
          <CardContent>
             {notifications.length > 0 ? (
                <ul className="space-y-4">
                    {notifications.map(notif => (
                        <li key={notif.id} className={`p-4 rounded-md border ${notif.read ? 'bg-card border-border' : 'bg-accent/10 border-accent font-medium'}`}>
                            <div className="flex items-center justify-between mb-2"> {/* Increased margin bottom */}
                                <span className={`text-sm font-semibold ${notif.read ? 'text-foreground' : 'text-accent'}`}>
                                    {notif.type === 'pain_alert' && <AlertCircle className="inline h-4 w-4 mr-1 text-destructive" />}
                                    {notif.type === 'message' && <MessageSquare className="inline h-4 w-4 mr-1 text-primary" />}
                                    {notif.type === 'feedback' && <Info className="inline h-4 w-4 mr-1 text-blue-500" />}

                                    {notif.type === 'pain_alert' ? `Alerte Douleur (${notif.patientName})` :
                                     notif.type === 'message' ? `Message de ${notif.patientName}` :
                                     `Feedback Reçu (${notif.patientName})`}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(notif.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - {new Date(notif.timestamp).toLocaleDateString('fr-FR')}
                                </span>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-2"> {/* Wrap content and add spacing */}
                                {notif.type === 'pain_alert' && <p>Niveau de douleur signalé : <span className="font-bold text-destructive">{notif.painLevel}/10</span>.</p>}
                                {notif.type === 'message' && (
                                    <>
                                        <p className="bg-muted p-2 rounded border border-border italic">"{notif.messageContent}"</p>
                                        {/* Reply Section */}
                                        <div className="flex items-center space-x-2 pt-2">
                                             <Input
                                                 type="text"
                                                 placeholder="Votre réponse..."
                                                 value={replyMessages[notif.id] || ''}
                                                 onChange={(e) => handleReplyChange(notif.id, e.target.value)}
                                                 disabled={sendingReply === notif.id}
                                                 className="flex-1 h-9 text-sm bg-background"
                                                 aria-label={`Répondre à ${notif.patientName}`}
                                             />
                                             <Button
                                                 size="sm"
                                                 onClick={() => handleSendReply(notif.id, notif.patientName)}
                                                 disabled={sendingReply === notif.id || !replyMessages[notif.id]?.trim()}
                                                 className="bg-accent hover:bg-accent/90 text-accent-foreground h-9"
                                             >
                                                 <Send className="h-4 w-4" />
                                             </Button>
                                         </div>
                                    </>
                                )}
                                {notif.type === 'feedback' && <p>Un nouveau feedback a été soumis. Cliquez pour voir les détails.</p>}
                                {/* TODO: Add link to patient detail or message thread */}
                                {/* <Button variant="link" size="sm" className="p-0 h-auto text-accent">Voir détails</Button> */}
                            </div>
                        </li>
                    ))}
                </ul>
             ) : (
                 <p className="text-muted-foreground text-center py-6">Vous n'avez aucune notification pour le moment.</p>
             )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
