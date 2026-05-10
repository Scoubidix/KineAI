'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Loader2, Layers, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  initialItems?: TemplateItem[]; // Préremplissage en mode création (ignoré en édition)
}

// Catégorie virtuelle pour les mesures custom (alignée avec MeasurementsPanel)
const CUSTOM_CATEGORY = 'Mesures libres';
// Fallback si le canonical field n'a pas pu être chargé (cohérent avec MeasurementsPanel)
const UNKNOWN_CATEGORY = 'Champs inconnus';

interface CategoryGroup {
  category: string;
  items: TemplateItem[];
}

// Identifiant interne d'un item, unique au sein du template (les keys canoniques
// et les labels customs sont déjà dédupliqués via addedKeys / addedCustomLabels).
const getItemSubId = (item: TemplateItem): string =>
  item.kind === 'canonical' ? `c:${item.key}` : `x:${item.label.trim().toLowerCase()}`;

// Préfixes utilisés par DnD pour distinguer les niveaux (catégorie vs item)
const catId = (category: string) => `cat:${category}`;
const itemId = (item: TemplateItem) => `item:${getItemSubId(item)}`;

// Regroupe une liste plate d'items en groupes de catégories (ordre = ordre
// d'apparition de la première occurrence de chaque catégorie).
const buildGroups = (
  items: TemplateItem[],
  fieldsByKey: Map<string, CanonicalField>,
): CategoryGroup[] => {
  const map = new Map<string, TemplateItem[]>();
  for (const item of items) {
    const cat =
      item.kind === 'canonical'
        ? fieldsByKey.get(item.key)?.category ?? UNKNOWN_CATEGORY
        : CUSTOM_CATEGORY;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
};

// ============================ Sub-components ============================

interface SortableItemRowProps {
  item: TemplateItem;
  id: string;
  fieldsByKey: Map<string, CanonicalField>;
  onRemove: () => void;
}

function SortableItemRow({ item, id, fieldsByKey, onRemove }: SortableItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handle = (
    <button
      type="button"
      className="cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-0.5 text-muted-foreground hover:text-foreground shrink-0"
      aria-label="Réordonner la mesure"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  if (item.kind === 'canonical') {
    const field = fieldsByKey.get(item.key);
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 bg-card"
      >
        {handle}
        <span className="text-sm flex-1 truncate">{field ? field.label : item.key}</span>
        {!field && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">
            Inactif
          </Badge>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-6 w-6 p-0 shrink-0">
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 bg-card"
    >
      {handle}
      <span className="text-sm flex-1 truncate italic">{item.label}</span>
      <Badge variant="outline" className="text-[9px] px-1 py-0">
        Libre
      </Badge>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-6 w-6 p-0 shrink-0">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface SortableCategoryProps {
  group: CategoryGroup;
  catIndex: number;
  fieldsByKey: Map<string, CanonicalField>;
  onRemoveItem: (catIndex: number, itemIndex: number) => void;
}

function SortableCategory({ group, catIndex, fieldsByKey, onRemoveItem }: SortableCategoryProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: catId(group.category),
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const itemDndIds = group.items.map(itemId);

  return (
    <div ref={setNodeRef} style={style} className="border border-border/40 rounded-lg overflow-hidden bg-card">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-0.5 text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Réordonner la catégorie"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm font-medium text-foreground flex-1 truncate">{group.category}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {group.items.length}
        </span>
      </div>
      <SortableContext items={itemDndIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5 p-1">
          {group.items.map((item, itemIdx) => (
            <SortableItemRow
              key={itemDndIds[itemIdx]}
              id={itemDndIds[itemIdx]}
              item={item}
              fieldsByKey={fieldsByKey}
              onRemove={() => onRemoveItem(catIndex, itemIdx)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ============================ Main component ============================

export default function TemplateEditorModal({
  open,
  onOpenChange,
  mode,
  template,
  onSaved,
  initialItems,
}: TemplateEditorModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [fields, setFields] = useState<CanonicalField[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Garde l'init unique par ouverture : on rebuild les groupes uniquement quand
  // les fields sont chargés ET qu'on n'a pas déjà initialisé pour cette ouverture.
  const initRef = useRef(false);

  const isEdit = template !== null;
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  const baseUrl = mode === 'public' ? `${API_BASE}/api/admin/bilan-templates` : `${API_BASE}/api/bilan-templates`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fieldsByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  // Le DndContext a deux niveaux imbriqués (catégories + items). Avec le
  // closestCenter par défaut, drag d'une catégorie peut "atterrir" sur un item
  // d'une autre catégorie pendant le survol, ce qui rend le placeholder
  // chaotique ET fait que handleDragEnd ignore le drop (active=cat, over=item).
  // → On restreint la détection au niveau correspondant au type de l'item drag.
  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const activeId = String(args.active.id);
      const isCat = activeId.startsWith('cat:');
      const filtered = args.droppableContainers.filter((c) => {
        const id = String(c.id);
        return isCat ? id.startsWith('cat:') : id.startsWith('item:');
      });
      return closestCenter({ ...args, droppableContainers: filtered });
    },
    [],
  );

  // Charger les champs canoniques (pour libellés + grouping par catégorie)
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

  // Init du formulaire à l'ouverture (attend que les fields soient prêts pour
  // grouper correctement — sinon les canoniques tomberaient dans UNKNOWN_CATEGORY)
  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    if (fields.length === 0) return;
    const sourceItems = template?.items ?? initialItems ?? [];
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setCategory(template?.category ?? '');
    setGroups(buildGroups(sourceItems, fieldsByKey));
    initRef.current = true;
  }, [open, template, initialItems, fields, fieldsByKey]);

  // Sets dérivés pour empêcher l'ajout de doublons via AddMeasureModal
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const addedKeys = useMemo(
    () =>
      new Set(
        allItems
          .filter((it) => it.kind === 'canonical')
          .map((it) => (it as Extract<TemplateItem, { kind: 'canonical' }>).key),
      ),
    [allItems],
  );
  const addedCustomLabels = useMemo(
    () =>
      new Set(
        allItems
          .filter((it) => it.kind === 'custom')
          .map((it) => (it as Extract<TemplateItem, { kind: 'custom' }>).label.trim().toLowerCase()),
      ),
    [allItems],
  );

  // Ajoute un canonical à la fin de sa catégorie. Crée la catégorie si absente,
  // en l'insérant avant "Mesures libres" pour conserver cette section en dernier.
  const handleAddCanonical = (field: CanonicalField) => {
    if (addedKeys.has(field.key)) return;
    const cat = field.category;
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.category === cat);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], items: [...next[idx].items, { kind: 'canonical', key: field.key }] };
        return next;
      }
      const newGroup: CategoryGroup = {
        category: cat,
        items: [{ kind: 'canonical', key: field.key }],
      };
      const customIdx = prev.findIndex((g) => g.category === CUSTOM_CATEGORY);
      if (customIdx === -1) return [...prev, newGroup];
      return [...prev.slice(0, customIdx), newGroup, ...prev.slice(customIdx)];
    });
  };

  const handleAddCustom = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || addedCustomLabels.has(trimmed.toLowerCase())) return;
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.category === CUSTOM_CATEGORY);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], items: [...next[idx].items, { kind: 'custom', label: trimmed }] };
        return next;
      }
      return [...prev, { category: CUSTOM_CATEGORY, items: [{ kind: 'custom', label: trimmed }] }];
    });
  };

  // Supprime un item ; si la catégorie devient vide, on la retire entièrement.
  const handleRemoveItem = (catIdx: number, itemIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      const remaining = next[catIdx].items.filter((_, i) => i !== itemIdx);
      if (remaining.length === 0) return next.filter((_, i) => i !== catIdx);
      next[catIdx] = { ...next[catIdx], items: remaining };
      return next;
    });
  };

  // Dispatch drag entre 2 niveaux : catégorie (préfixe "cat:") ou item ("item:")
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    if (activeIdStr.startsWith('cat:') && overIdStr.startsWith('cat:')) {
      setGroups((current) => {
        const oldIndex = current.findIndex((g) => catId(g.category) === activeIdStr);
        const newIndex = current.findIndex((g) => catId(g.category) === overIdStr);
        if (oldIndex === -1 || newIndex === -1) return current;
        return arrayMove(current, oldIndex, newIndex);
      });
      return;
    }

    if (activeIdStr.startsWith('item:') && overIdStr.startsWith('item:')) {
      setGroups((current) => {
        let activeCat = -1;
        let activePos = -1;
        let overCat = -1;
        let overPos = -1;
        for (let ci = 0; ci < current.length; ci++) {
          const items = current[ci].items;
          for (let ii = 0; ii < items.length; ii++) {
            const id = itemId(items[ii]);
            if (id === activeIdStr) {
              activeCat = ci;
              activePos = ii;
            }
            if (id === overIdStr) {
              overCat = ci;
              overPos = ii;
            }
          }
        }
        if (activeCat === -1 || overCat === -1) return current;
        // Pas de drag d'item entre catégories — la catégorie d'un canonique
        // est fixée par le field, et les customs vivent tous dans "Mesures libres".
        if (activeCat !== overCat) return current;
        const next = [...current];
        next[activeCat] = {
          ...next[activeCat],
          items: arrayMove(next[activeCat].items, activePos, overPos),
        };
        return next;
      });
    }
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
    const flatItems = groups.flatMap((g) => g.items);
    if (flatItems.length === 0) {
      toast({ title: 'Au moins une mesure requise', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim(),
        items: flatItems,
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

  const totalItems = allItems.length;
  const categoryDndIds = groups.map((g) => catId(g.category));

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
                <Label className="text-xs">Mesures incluses ({totalItems})</Label>
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

              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-2 py-3 text-center border border-dashed border-border/60 rounded-lg">
                  Aucune mesure. Ajoutez les EVA, amplitudes, tests cliniques pour ce type de bilan.
                </p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
                  <SortableContext items={categoryDndIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 border border-border/60 rounded-lg p-2 max-h-[260px] overflow-y-auto">
                      {groups.map((group, catIdx) => (
                        <SortableCategory
                          key={categoryDndIds[catIdx]}
                          group={group}
                          catIndex={catIdx}
                          fieldsByKey={fieldsByKey}
                          onRemoveItem={handleRemoveItem}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
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
