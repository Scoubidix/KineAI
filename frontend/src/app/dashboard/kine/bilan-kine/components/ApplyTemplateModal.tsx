'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, Search, Globe, User, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { matchesAllTokens } from '@/utils/textSearch';
import { BilanTemplate } from '@/types/bilan';

interface ApplyTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (template: BilanTemplate) => void;
}

export default function ApplyTemplateModal({ open, onOpenChange, onApply }: ApplyTemplateModalProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BilanTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (!open) return;
    const load = async () => {
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
    setSearch('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = templates.filter((t) =>
    matchesAllTokens(`${t.name} ${t.category} ${t.description ?? ''}`, search)
  );

  // Regroupement par catégorie
  const byCategory: Record<string, BilanTemplate[]> = {};
  for (const t of filtered) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  }
  const categories = Object.keys(byCategory).sort();

  const handleSelect = (template: BilanTemplate) => {
    onApply(template);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <Layers className="w-5 h-5" />
            Appliquer un template
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un template..."
            className="pl-9 h-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-1">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#3899aa]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {templates.length === 0
                ? 'Aucun template disponible. Crées-en un depuis la page Bilans.'
                : 'Aucun résultat'}
            </p>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-2 py-1.5">
                    {cat}
                  </p>
                  <div className="space-y-1">
                    {byCategory[cat].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelect(t)}
                        className="w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-border/50 hover:border-[#3899aa]/40 hover:bg-[#3899aa]/5 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">{t.name}</p>
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
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{t.description}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {t.items.length} mesure{t.items.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-border/40">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full h-9 text-sm">
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
