'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, RefreshCw, Globe } from 'lucide-react';
import { BilanTemplate } from '@/types/bilan';
import TemplateEditorModal from '@/app/dashboard/kine/bilan-kine/components/TemplateEditorModal';

export default function BilanTemplatesTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BilanTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BilanTemplate | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/bilan-templates`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setTemplates(json.templates);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleDeactivate = async (template: BilanTemplate) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/bilan-templates/${template.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ title: 'Template désactivé' });
        await loadTemplates();
      } else {
        toast({ title: 'Erreur', description: json.error ?? 'Désactivation impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Désactivation impossible', variant: 'destructive' });
    }
  };

  const handleReactivate = async (template: BilanTemplate) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/admin/bilan-templates/${template.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: true }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: 'Template réactivé' });
        await loadTemplates();
      } else {
        toast({ title: 'Erreur', description: json.error ?? 'Réactivation impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Réactivation impossible', variant: 'destructive' });
    }
  };

  // Regroupement par catégorie
  const templatesByCategory: Record<string, BilanTemplate[]> = {};
  for (const t of templates) {
    if (!templatesByCategory[t.category]) templatesByCategory[t.category] = [];
    templatesByCategory[t.category].push(t);
  }
  for (const cat of Object.keys(templatesByCategory)) {
    templatesByCategory[cat].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#3899aa]" />
                Templates publics de bilan
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Modèles de bilans accessibles à tous les kinés. Les templates désactivés n&apos;apparaissent plus dans la
                liste côté kiné.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loading} className="h-9">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Rafraîchir
              </Button>
              <Button size="sm" onClick={handleCreate} className="btn-teal h-9">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Ajouter un template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#3899aa]" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun template public configuré</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(templatesByCategory).map(([category, list]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-[#3899aa] mb-2">{category}</h3>
                  <div className="space-y-2">
                    {list.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            {t.isActive ? (
                              <Badge className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 border">
                                Actif
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-muted text-muted-foreground border">Désactivé</Badge>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{t.description}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {t.items.length} mesure{t.items.length > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} className="h-7 px-2">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {t.isActive ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Désactiver ce template ?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Le template <strong>{t.name}</strong> ne sera plus proposé aux kinés. Les bilans
                                    déjà créés à partir de ce template ne sont pas affectés.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeactivate(t)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Désactiver
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReactivate(t)}
                              className="h-7 text-xs px-2 text-green-600 hover:text-green-700"
                            >
                              Réactiver
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode="public"
        template={editingTemplate}
        onSaved={handleSaved}
      />
    </div>
  );
}
