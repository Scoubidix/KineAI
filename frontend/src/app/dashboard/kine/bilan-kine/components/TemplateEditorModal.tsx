'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Loader2, Layers, Sparkles, FileText } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { BilanTemplate, TemplateItem, CanonicalField } from '@/types/bilan';
import AddMeasureModal from './AddMeasureModal';

type EditorMode = 'private' | 'public';

interface TemplateEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EditorMode;
  template: BilanTemplate | null; // null = création
  onSaved: (template: BilanTemplate) => void;
}

export default function TemplateEditorModal({
  open,
  onOpenChange,
  mode,
  template,
  onSaved,
}: TemplateEditorModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEdit = template !== null;
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  const baseUrl = mode === 'public' ? `${API_BASE}/api/admin/bilan-templates` : `${API_BASE}/api/bilan-templates`;

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setCategory(template?.category ?? '');
    setItems(template?.items ?? []);
  }, [open, template]);

  // Charger les champs canoniques pour afficher les libellés
  useEffect(() => {
    if (!open) return;
    const fetchFields = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/bilan-fields`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setFields(json.fields);
      } catch {
        // silent
      }
    };
    fetchFields();
  }, [open, API_BASE]);

  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));

  const addedKeys = new Set(
    items.filter((it) => it.kind === 'canonical').map((it) => (it as Extract<TemplateItem, { kind: 'canonical' }>).key)
  );
  const addedCustomLabels = new Set(
    items
      .filter((it) => it.kind === 'custom')
      .map((it) => (it as Extract<TemplateItem, { kind: 'custom' }>).label.trim().toLowerCase())
  );

  const handleAddCanonical = (field: CanonicalField) => {
    if (addedKeys.has(field.key)) return;
    setItems([...items, { kind: 'canonical', key: field.key }]);
  };

  const handleAddCustom = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || addedCustomLabels.has(trimmed.toLowerCase())) return;
    setItems([...items, { kind: 'custom', label: trimmed }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Nom requis', variant: 'destructive' });
      return;
    }
    if (!category.trim()) {
      toast({ title: 'Catégorie requise', variant: 'destructive' });
      return;
    }
    if (items.length === 0) {
      toast({ title: 'Au moins une mesure requise', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim(),
        items,
      };
      const url = isEdit ? `${baseUrl}/${template!.id}` : baseUrl;
      const res = await fetchWithAuth(url, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: isEdit ? 'Template modifié' : 'Template créé' });
        onSaved(json.template);
        onOpenChange(false);
      } else {
        toast({
          title: 'Erreur',
          description: json.error ?? 'Sauvegarde impossible',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Sauvegarde impossible', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
              <Layers className="w-5 h-5" />
              {isEdit ? 'Modifier le template' : `Nouveau template ${mode === 'public' ? 'public' : ''}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nom du template</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex : Bilan lombalgie chronique"
                maxLength={150}
                className="h-9"
              />
            </div>

            <div>
              <Label className="text-xs">Catégorie</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="ex : Rachis lombaire, Genou, Épaule..."
                maxLength={80}
                className="h-9"
              />
            </div>

            <div>
              <Label className="text-xs">Description (optionnelle)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quelques mots sur l'usage du template..."
                maxLength={500}
                className="min-h-[60px] resize-none text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Mesures incluses ({items.length})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddModalOpen(true)}
                  className="h-7 text-xs rounded-full"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter une mesure
                </Button>
              </div>

              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-2 py-3 text-center border border-dashed border-border/60 rounded-lg">
                  Aucune mesure. Ajoutez les EVA, amplitudes, tests cliniques pour ce type de bilan.
                </p>
              ) : (
                <div className="space-y-1 border border-border/60 rounded-lg p-2 max-h-[260px] overflow-y-auto">
                  {items.map((item, index) => {
                    if (item.kind === 'canonical') {
                      const field = fieldsByKey.get(item.key);
                      return (
                        <div
                          key={`canonical-${index}-${item.key}`}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40"
                        >
                          <FileText className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
                          <span className="text-sm flex-1 truncate">
                            {field ? field.label : item.key}
                            {field && (
                              <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">
                                {field.category}
                              </Badge>
                            )}
                          </span>
                          {!field && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">
                              Inactif
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            className="h-6 w-6 p-0 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`custom-${index}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
                        <span className="text-sm flex-1 truncate italic">{item.label}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          Libre
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(index)}
                          className="h-6 w-6 p-0 shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving} className="btn-teal">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Créer le template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddMeasureModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        fields={fields}
        addedKeys={addedKeys}
        addedCustomLabels={addedCustomLabels}
        onAddCanonical={handleAddCanonical}
        onAddCustom={handleAddCustom}
      />
    </>
  );
}
