'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Pencil, Trash2, Search, Loader2, ArrowLeft } from 'lucide-react';
import DOMPurify from 'dompurify';

interface Template {
  id: number;
  title: string;
  category: string;
  subject: string | null;
  body: string;
  usageCount: number;
  isPublic: boolean;
  kineId: number | null;
}

interface TemplatesManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  getAuthToken: () => Promise<string | undefined>;
}

export default function TemplatesManagementModal({
  open, onOpenChange, apiBase, getAuthToken
}: TemplatesManagementModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [tab, setTab] = useState<string>('private');

  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      loadTemplates();
      loadCategories();
      setSearchQuery('');
      setSelectedCategory('');
      setTab('private');
      setIsEditing(false);
      setEditingTemplate(null);
      setConfirmDeleteId(null);
    }
  }, [open]);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setTemplates(data.templates);
    } catch (error) {
      console.error('Erreur chargement templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/templates/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setCategories(data.categories);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const isPublicTab = tab === 'public';
    if (isPublicTab && !t.isPublic) return false;
    if (!isPublicTab && t.isPublic) return false;
    if (selectedCategory && t.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
    }
    return true;
  });

  const highlightVariables = (text: string) => {
    if (!text) return '';
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const highlighted = escaped.replace(/\[([^\]]+)\]/g, '<mark class="bg-yellow-300 dark:bg-yellow-500/30 text-black dark:text-yellow-200 px-1 rounded">[$1]</mark>');
    return DOMPurify.sanitize(highlighted, { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: ['class'] });
  };

  const openCreateForm = () => {
    setEditingTemplate(null);
    setFormTitle('');
    setFormCategory('');
    setFormSubject('');
    setFormBody('');
    setIsEditing(true);
  };

  const openEditForm = (template: Template) => {
    setEditingTemplate(template);
    setFormTitle(template.title);
    setFormCategory(template.category);
    setFormSubject(template.subject || '');
    setFormBody(template.body);
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const token = await getAuthToken();
      const payload: Record<string, string> = {
        title: formTitle,
        category: formCategory,
        body: formBody
      };
      if (formSubject) payload.subject = formSubject;

      if (editingTemplate) {
        await fetch(`${apiBase}/api/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(`${apiBase}/api/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      }

      setIsEditing(false);
      await loadTemplates();
      await loadCategories();
    } catch (error) {
      console.error('Erreur sauvegarde template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      setIsDeleting(true);
      const token = await getAuthToken();
      await fetch(`${apiBase}/api/templates/${confirmDeleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadTemplates();
      await loadCategories();
    } catch (error) {
      console.error('Erreur suppression template:', error);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#3899aa]" />
            Gestion des templates
          </DialogTitle>
        </DialogHeader>

        {isEditing ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-medium">{editingTemplate ? 'Modifier le template' : 'Nouveau template'}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Titre *</label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Titre du template" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Catégorie *</label>
                <Input value={formCategory} onChange={e => setFormCategory(e.target.value)} placeholder="Ex: Relances, Communications..." />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Objet email (optionnel)</label>
              <Input value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="Objet du mail" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Corps du message *</label>
              <Textarea value={formBody} onChange={e => setFormBody(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Contenu avec variables [Nom Patient], [Votre Nom]..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>Annuler</Button>
              <Button className="btn-teal" onClick={handleSave} disabled={isSaving || !formTitle || !formCategory || !formBody}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingTemplate ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Recherche + filtres — fixe */}
            <div className="shrink-0 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un template..." className="pl-9" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={selectedCategory === '' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory('')}>
                  Toutes
                </Badge>
                {categories.map(cat => (
                  <Badge key={cat.name} variant={selectedCategory === cat.name ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory(cat.name)}>
                    {cat.name} ({cat.count})
                  </Badge>
                ))}
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="private">Mes templates</TabsTrigger>
                    <TabsTrigger value="public">Publics</TabsTrigger>
                  </TabsList>
                  {tab === 'private' && (
                    <Button size="sm" className="btn-teal" onClick={openCreateForm}>
                      <Plus className="h-4 w-4 mr-1" /> Nouveau
                    </Button>
                  )}
                </div>
              </Tabs>
            </div>

            {/* Liste scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <TemplateList
                templates={filteredTemplates}
                isLoading={isLoading}
                readOnly={tab === 'public'}
                highlightVariables={highlightVariables}
                onEdit={openEditForm}
                onDelete={(id) => setConfirmDeleteId(id)}
              />
            </div>
          </div>
        )}
      </DialogContent>

      {/* Modal confirmation suppression */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-md top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm sm:text-base">
            Êtes-vous sûr de vouloir supprimer ce template ? Cette action est irréversible.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-4 mt-4">
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Oui, supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function TemplateList({ templates, isLoading, readOnly, highlightVariables, onEdit, onDelete }: {
  templates: Template[];
  isLoading: boolean;
  readOnly: boolean;
  highlightVariables: (text: string) => string;
  onEdit: (t: Template) => void;
  onDelete: (id: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground text-center h-full flex items-center justify-center">Aucun template trouvé</p>;
  }

  return (
    <div className="space-y-2">
      {templates.map(template => (
        <div key={template.id} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expandedId === template.id ? null : template.id)}>
            <div className="flex-1">
              <p className="font-medium text-sm">{template.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs bg-white dark:bg-card">{template.category}</Badge>
                {template.usageCount > 0 && <span className="text-xs text-muted-foreground">{template.usageCount}x utilisé</span>}
              </div>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="sm" onClick={() => onEdit(template)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(template.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {expandedId === template.id && (
            <div className="mt-3 pt-3 border-t">
              {template.subject && (
                <p className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium">Objet :</span> {template.subject}
                </p>
              )}
              <div className="p-3 bg-white dark:bg-card rounded-lg border text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightVariables(template.body) }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
