'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Loader2, ChevronDown, ChevronUp, Mail, MessageSquare, Trash2 } from 'lucide-react';

interface HistoryEntry {
  id: number;
  templateTitle: string;
  subject: string;
  body: string;
  recipientName: string;
  recipientEmail: string | null;
  method: 'EMAIL' | 'WHATSAPP';
  sentAt: string;
  patient: { firstName: string; lastName: string } | null;
  contact: { firstName: string; lastName: string; type: string | null } | null;
  template: { title: string; category: string } | null;
}

interface HistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  getAuthToken: () => Promise<string | undefined>;
}

export default function HistoryModal({
  open, onOpenChange, apiBase, getAuthToken
}: HistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const limit = 20;

  useEffect(() => {
    if (open) {
      setHistory([]);
      setOffset(0);
      loadHistory(0);
    }
  }, [open]);

  const loadHistory = async (currentOffset: number) => {
    try {
      setIsLoading(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/templates/history?limit=${limit}&offset=${currentOffset}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        if (currentOffset === 0) {
          setHistory(data.history);
        } else {
          setHistory(prev => [...prev, ...data.history]);
        }
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
    loadHistory(newOffset);
  };

  const handleDeleteEntry = async (entryId: number) => {
    try {
      setIsDeleting(entryId);
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/templates/history/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHistory(prev => prev.filter(e => e.id !== entryId));
        setTotal(prev => prev - 1);
        if (expandedId === entryId) setExpandedId(null);
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setIsDeletingAll(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/templates/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHistory([]);
        setTotal(0);
        setExpandedId(null);
      }
    } catch (error) {
      console.error('Erreur suppression totale:', error);
    } finally {
      setIsDeletingAll(false);
      setConfirmDeleteAllOpen(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-4">
            <DialogTitle className="flex items-center gap-2 flex-1">
              <Clock className="h-5 w-5 text-[#3899aa]" />
              Historique des envois
              {total > 0 && <span className="text-sm font-normal text-muted-foreground">({total})</span>}
            </DialogTitle>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive text-xs mr-6"
                onClick={() => setConfirmDeleteAllOpen(true)}
                disabled={isDeletingAll}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Tout supprimer
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Liste scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {isLoading && history.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center h-full flex items-center justify-center">Aucun envoi dans l'historique</p>
          ) : (
            <div className="space-y-2">
              {history.map(entry => (
                <div key={entry.id} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{entry.templateTitle}</p>
                        <Badge variant={entry.method === 'EMAIL' ? 'default' : 'secondary'} className="text-xs">
                          {entry.method === 'EMAIL' ? <Mail className="h-3 w-3 mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                          {entry.method}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{entry.recipientName}</span>
                        <span>{formatDate(entry.sentAt)}</span>
                        {entry.template && <Badge variant="outline" className="text-xs">{entry.template.category}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-8 w-8 p-0"
                        onClick={() => handleDeleteEntry(entry.id)}
                        disabled={isDeleting === entry.id}
                      >
                        {isDeleting === entry.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </Button>
                      {expandedId === entry.id
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => setExpandedId(null)} />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => setExpandedId(entry.id)} />
                      }
                    </div>
                  </div>

                  {expandedId === entry.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {entry.subject && (
                        <p className="text-sm"><span className="font-medium">Objet :</span> {entry.subject}</p>
                      )}
                      <div className="p-3 bg-white rounded-lg border text-sm whitespace-pre-wrap">
                        {entry.body}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {history.length < total && (
                <div className="flex justify-center pt-2 pb-1">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Charger plus
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Modal confirmation suppression totale */}
      <Dialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm sm:text-base">
            Êtes-vous sûr de vouloir supprimer <strong>tout l'historique</strong> ({total} envois) ?
            Cette action est irréversible.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-4 mt-4">
            <Button variant="ghost" onClick={() => setConfirmDeleteAllOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeletingAll}>
              {isDeletingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Oui, tout supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
