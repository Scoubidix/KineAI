'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import {
  Layers,
  Plus,
  Search,
  Trash2,
  Globe,
  User,
  Loader2,
  ArrowLeft,
  Pencil,
} from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { matchesAllTokens } from '@/utils/textSearch';
import { BilanTemplate, CanonicalField, TemplateItem } from '@/types/bilan';
import TemplateEditorModal from './TemplateEditorModal';

interface TemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CUSTOM_CATEGORY = 'Mesures libres';
const UNKNOWN_CATEGORY = 'Champs inconnus';

export default function TemplatesModal({ open, onOpenChange }: TemplatesModalProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BilanTemplate[]>([]);
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BilanTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<BilanTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  const fieldsByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

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

  const loadFields = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/bilan-fields`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setFields(json.fields);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (open) {
      loadTemplates();
      loadFields();
      setSearch('');
      setViewingTemplate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Si on revient sur la modal après une suppression/édition, on ressynchronise
  // le template en cours de visualisation avec la liste à jour.
  useEffect(() => {
    if (!viewingTemplate) return;
    const updated = templates.find((t) => t.id === viewingTemplate.id);
    if (!updated) {
      setViewingTemplate(null);
    } else if (updated !== viewingTemplate) {
      setViewingTemplate(updated);
    }
  }, [templates, viewingTemplate]);

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
        setViewingTemplate(null);
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
    <button
      key={t.id}
      type="button"
      onClick={() => setViewingTemplate(t)}
      className="w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5 transition-colors text-left"
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
    </button>
  );

  // Regroupe les items du template par catégorie pour l'affichage en lecture.
  const groupTemplateItems = (items: TemplateItem[]): Map<string, TemplateItem[]> => {
    const map = new Map<string, TemplateItem[]>();
    for (const item of items) {
      const cat =
        item.kind === 'custom'
          ? CUSTOM_CATEGORY
          : fieldsByKey.get(item.key)?.category ?? UNKNOWN_CATEGORY;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  };

  const renderDetailView = (t: BilanTemplate) => {
    const groups = groupTemplateItems(t.items);
    const isPrivate = !t.isPublic;

    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <button
              type="button"
              onClick={() => setViewingTemplate(null)}
              aria-label="Retour à la liste"
              className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-[#3899aa]/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Layers className="w-5 h-5" />
            <span className="truncate">{t.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {t.category}
          </Badge>
          {t.isPublic ? (
            <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 border gap-0.5">
              <Globe className="h-2.5 w-2.5" />
              Public
            </Badge>
          ) : (
            <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 border gap-0.5">
              <User className="h-2.5 w-2.5" />
              Privé
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground">
            {t.items.length} mesure{t.items.length > 1 ? 's' : ''}
          </span>
        </div>

        {t.description && (
          <p className="text-xs text-muted-foreground italic">{t.description}</p>
        )}

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-2">
          {Array.from(groups.entries()).map(([cat, items]) => (
            <div key={cat} className="border border-border/40 rounded-lg overflow-hidden">
              <div className="px-2 py-1.5 bg-muted/30">
                <span className="text-sm font-medium text-foreground">{cat}</span>
                <span className="text-[11px] text-muted-foreground ml-2 tabular-nums">
                  {items.length}
                </span>
              </div>
              <div className="p-1 space-y-0.5">
                {items.map((item, idx) => {
                  if (item.kind === 'canonical') {
                    const field = fieldsByKey.get(item.key);
                    return (
                      <div
                        key={`c-${idx}-${item.key}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
                      >
                        <span className="flex-1 truncate">{field ? field.label : item.key}</span>
                        {!field && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">
                            Inactif
                          </Badge>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`x-${idx}-${item.label}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
                    >
                      <span className="flex-1 truncate italic text-muted-foreground">{item.label}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        Libre
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
          <Button
            variant="outline"
            onClick={() => setViewingTemplate(null)}
            className="rounded-full h-9 text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Retour
          </Button>

          {isPrivate && (
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={deletingId === t.id}
                    className="rounded-full h-9 text-sm text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                  >
                    {deletingId === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce template ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Le template <strong>{t.name}</strong> sera supprimé. Les bilans déjà créés à partir de ce
                      template ne sont pas affectés.
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

              <Button onClick={() => handleEdit(t)} className="btn-teal rounded-full h-9 text-sm">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Modifier
              </Button>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderListView = () => (
    <>
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
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col">
          {viewingTemplate ? renderDetailView(viewingTemplate) : renderListView()}
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
