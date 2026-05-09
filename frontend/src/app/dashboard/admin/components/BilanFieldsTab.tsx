'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { Switch } from '@/components/ui/switch';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, X, RefreshCw } from 'lucide-react';
import { CanonicalFieldType } from '@/types/bilan';

interface AdminBilanField {
  id: number;
  key: string;
  label: string;
  type: CanonicalFieldType;
  unit: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  options: string[] | null;
  category: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FieldFormState {
  id?: number;
  key: string;
  label: string;
  type: CanonicalFieldType;
  unit: string;
  rangeMin: string;
  rangeMax: string;
  options: string[];
  category: string;
  order: number;
  isActive: boolean;
}

const EMPTY_FORM: FieldFormState = {
  key: '',
  label: '',
  type: 'NUMERIC',
  unit: '',
  rangeMin: '',
  rangeMax: '',
  options: [],
  category: '',
  order: 0,
  isActive: true,
};

const TYPE_LABELS: Record<CanonicalFieldType, string> = {
  NUMERIC: 'Numérique',
  BOOLEAN: 'Booléen (positif/négatif)',
  TEXT: 'Texte libre',
  ENUM: 'Liste de choix',
};

export default function BilanFieldsTab() {
  const { toast } = useToast();
  const [fields, setFields] = useState<AdminBilanField[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FieldFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [optionDraft, setOptionDraft] = useState('');

  const isEdit = form.id !== undefined;

  const loadFields = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/bilan-fields`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setFields(json.fields);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFields();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setOptionDraft('');
    setModalOpen(true);
  };

  const openEdit = (f: AdminBilanField) => {
    setForm({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      unit: f.unit ?? '',
      rangeMin: f.rangeMin !== null ? String(f.rangeMin) : '',
      rangeMax: f.rangeMax !== null ? String(f.rangeMax) : '',
      options: Array.isArray(f.options) ? f.options : [],
      category: f.category,
      order: f.order,
      isActive: f.isActive,
    });
    setOptionDraft('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    // Validation simple côté client
    if (!form.key || !/^[a-z][a-z0-9_]*$/.test(form.key)) {
      toast({ title: 'Clé invalide', description: 'snake_case requis (ex: eva_repos)', variant: 'destructive' });
      return;
    }
    if (!form.label.trim()) {
      toast({ title: 'Libellé requis', variant: 'destructive' });
      return;
    }
    if (!form.category.trim()) {
      toast({ title: 'Catégorie requise', variant: 'destructive' });
      return;
    }
    if (form.type === 'ENUM' && form.options.length === 0) {
      toast({ title: 'Options requises', description: 'Ajoute au moins une option', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: form.label.trim(),
        type: form.type,
        category: form.category.trim(),
        order: form.order,
        unit: form.type === 'NUMERIC' && form.unit.trim() ? form.unit.trim() : null,
        rangeMin: form.type === 'NUMERIC' && form.rangeMin !== '' ? Number(form.rangeMin) : null,
        rangeMax: form.type === 'NUMERIC' && form.rangeMax !== '' ? Number(form.rangeMax) : null,
        options: form.type === 'ENUM' ? form.options : null,
      };
      if (isEdit) {
        payload.isActive = form.isActive;
      } else {
        payload.key = form.key;
      }

      const url = isEdit
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/bilan-fields/${form.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/admin/bilan-fields`;

      const res = await fetchWithAuth(url, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: isEdit ? 'Champ modifié' : 'Champ créé' });
        setModalOpen(false);
        await loadFields();
      } else {
        toast({ title: 'Erreur', description: json.error ?? 'Sauvegarde impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Sauvegarde impossible', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (f: AdminBilanField) => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/bilan-fields/${f.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        toast({ title: 'Champ désactivé' });
        await loadFields();
      } else {
        toast({ title: 'Erreur', description: json.error ?? 'Désactivation impossible', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Désactivation impossible', variant: 'destructive' });
    }
  };

  const addOption = () => {
    const v = optionDraft.trim();
    if (!v) return;
    if (form.options.includes(v)) return;
    setForm({ ...form, options: [...form.options, v] });
    setOptionDraft('');
  };

  const removeOption = (opt: string) => {
    setForm({ ...form, options: form.options.filter((o) => o !== opt) });
  };

  // Regroupement par catégorie pour affichage
  const fieldsByCategory: Record<string, AdminBilanField[]> = {};
  for (const f of fields) {
    if (!fieldsByCategory[f.category]) fieldsByCategory[f.category] = [];
    fieldsByCategory[f.category].push(f);
  }
  for (const cat of Object.keys(fieldsByCategory)) {
    fieldsByCategory[cat].sort((a, b) => a.order - b.order || a.id - b.id);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg">Champs canoniques de bilan</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Mesures structurées proposées aux kinés lors de la saisie d&apos;un bilan (EVA, amplitudes, scores...).
                Les champs désactivés restent stockés en base mais n&apos;apparaissent plus dans le formulaire.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadFields} disabled={loading} className="h-9">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Rafraîchir
              </Button>
              <Button size="sm" onClick={openCreate} className="btn-teal h-9">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Ajouter un champ
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#3899aa]" />
            </div>
          ) : fields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun champ canonique configuré
            </p>
          ) : (
            <div className="space-y-5">
              {Object.entries(fieldsByCategory).map(([category, list]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-[#3899aa] mb-2">{category}</h3>
                  <div className="border border-border/60 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Clé</th>
                          <th className="text-left px-3 py-2 font-medium">Libellé</th>
                          <th className="text-left px-3 py-2 font-medium">Type</th>
                          <th className="text-left px-3 py-2 font-medium">Détails</th>
                          <th className="text-left px-3 py-2 font-medium">État</th>
                          <th className="text-right px-3 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((f) => (
                          <tr key={f.id} className="border-t border-border/40 hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.key}</td>
                            <td className="px-3 py-2">{f.label}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[10px]">
                                {f.type}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {f.type === 'NUMERIC' && (
                                <span>
                                  {f.unit ?? '—'}
                                  {f.rangeMin !== null || f.rangeMax !== null
                                    ? ` · [${f.rangeMin ?? '—'} — ${f.rangeMax ?? '—'}]`
                                    : ''}
                                </span>
                              )}
                              {f.type === 'ENUM' && f.options && (
                                <span className="truncate inline-block max-w-[200px]">
                                  {f.options.join(', ')}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {f.isActive ? (
                                <Badge className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 border">
                                  Actif
                                </Badge>
                              ) : (
                                <Badge className="text-[10px] bg-muted text-muted-foreground border">
                                  Désactivé
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEdit(f)}
                                  className="h-7 px-2"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {f.isActive && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-red-600 hover:text-red-700"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Désactiver ce champ ?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Le champ <strong>{f.label}</strong> ne sera plus proposé aux kinés
                                          lors de la saisie d&apos;un bilan. Les valeurs déjà saisies dans les
                                          bilans existants restent intactes.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeactivate(f)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Désactiver
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal création / édition */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Modifier le champ' : 'Ajouter un champ canonique'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Clé technique (snake_case, jamais modifiable)</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="ex: eva_repos"
                disabled={isEdit}
                className="font-mono text-sm h-9"
              />
            </div>

            <div>
              <Label className="text-xs">Libellé affiché</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="ex: EVA au repos"
                className="h-9"
              />
            </div>

            <div>
              <Label className="text-xs">Catégorie</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="ex: Douleur, Amplitudes lombaires…"
                className="h-9"
              />
            </div>

            <div>
              <Label className="text-xs">Type de saisie</Label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CanonicalFieldType })}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {(Object.keys(TYPE_LABELS) as CanonicalFieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Champs conditionnels NUMERIC */}
            {form.type === 'NUMERIC' && (
              <>
                <div>
                  <Label className="text-xs">Unité (optionnelle)</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="ex: /10, °, cm"
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Min (optionnel)</Label>
                    <Input
                      type="number"
                      value={form.rangeMin}
                      onChange={(e) => setForm({ ...form, rangeMin: e.target.value })}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max (optionnel)</Label>
                    <Input
                      type="number"
                      value={form.rangeMax}
                      onChange={(e) => setForm({ ...form, rangeMax: e.target.value })}
                      placeholder="10"
                      className="h-9"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Champs conditionnels ENUM */}
            {form.type === 'ENUM' && (
              <div>
                <Label className="text-xs">Options (au moins 1 requise)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={optionDraft}
                    onChange={(e) => setOptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                    placeholder="ex: 0/5"
                    className="h-9 flex-1"
                  />
                  <Button type="button" onClick={addOption} disabled={!optionDraft.trim()} className="btn-teal h-9">
                    Ajouter
                  </Button>
                </div>
                {form.options.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.options.map((opt) => (
                      <Badge key={opt} variant="outline" className="text-xs gap-1 pl-2 pr-1">
                        {opt}
                        <button
                          type="button"
                          onClick={() => removeOption(opt)}
                          className="hover:text-destructive ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Ordre d&apos;affichage dans la catégorie</Label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
                className="h-9"
              />
            </div>

            {isEdit && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div>
                  <Label className="text-sm">Champ actif</Label>
                  <p className="text-xs text-muted-foreground">
                    Si désactivé, n&apos;apparaît plus dans le formulaire bilan
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(c) => setForm({ ...form, isActive: c })}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving} className="btn-teal">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Créer le champ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
