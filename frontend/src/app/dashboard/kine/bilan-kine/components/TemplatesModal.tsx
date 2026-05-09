'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, Plus, Search, Pencil, Trash2, Globe, User, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { matchesAllTokens } from '@/utils/textSearch';
import { BilanTemplate } from '@/types/bilan';
import TemplateEditorModal from './TemplateEditorModal';

interface TemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TemplatesModal({ open, onOpenChange }: TemplatesModalProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BilanTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BilanTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/bilan-templates`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setTemplates(json.templates);
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTemplates();
      setSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleEdit = (template: BilanTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleSaved = (saved: BilanTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      if (exists) return prev.map((t) => (t.id === saved.id ? saved : t));
      return [...prev, saved];
    });
  };

  const handleDelete = async (template: BilanTemplate) => {
    setDeletingId(template.id);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/bilan-templates/${template.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ title: 'Template supprimé' });
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      } else {
        toast({ title: 'Erreur', description: json.error ?? 'Suppression impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Suppression impossible', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = templates.filter((t) =>
    matchesAllTokens(`${t.name} ${t.category} ${t.description ?? ''}`, search)
  );

  const publics = filtered.filter((t) => t.isPublic);
  const privates = filtered.filter((t) => !t.isPublic);

  const renderTemplate = (t: BilanTemplate) => (
    <div
      key={t.id}
      className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{t.name}</p>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {t.category}
          </Badge>
          {t.isPublic ? (
            <Badge className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 border gap-0.5">
              <Globe className="h-2.5 w-2.5" />
              Public
            </Badge>
          ) : (
            <Badge className="text-[9px] px-1.5 py-0 bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 border gap-0.5">
              <User className="h-2.5 w-2.5" />
              Privé
            </Badge>
          )}
        </div>
        {t.description && <p className="text-xs text-muted-foreground mt-1 truncate">{t.description}</p>}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {t.items.length} mesure{t.items.length > 1 ? 's' : ''}
        </p>
      </div>
      {!t.isPublic && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} className="h-7 px-2">
            <Pencil className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={deletingId === t.id}
                className="h-7 px-2 text-red-600 hover:text-red-700"
              >
                {deletingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce template ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Le template <strong>{t.name}</strong> sera supprimé. Les bilans déjà créés à partir de ce template
                  ne sont pas affectés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(t)} className="bg-red-600 hover:bg-red-700">
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
              <Layers className="w-5 h-5" />
              Templates de bilan
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un template..."
                className="pl-9 h-9"
              />
            </div>
            <Button onClick={handleCreate} className="btn-teal h-9 rounded-full px-4">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nouveau
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#3899aa]" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                {templates.length === 0
                  ? 'Aucun template pour l\'instant. Créez votre premier template pour réutiliser une composition de mesures.'
                  : 'Aucun résultat'}
              </p>
            ) : (
              <>
                {publics.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-1 mb-2">
                      Templates publics ({publics.length})
                    </p>
                    <div className="space-y-2">{publics.map(renderTemplate)}</div>
                  </div>
                )}
                {privates.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-1 mb-2">
                      Mes templates ({privates.length})
                    </p>
                    <div className="space-y-2">{privates.map(renderTemplate)}</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border/40">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full h-9 text-sm">
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TemplateEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode="private"
        template={editingTemplate}
        onSaved={handleSaved}
      />
    </>
  );
}
