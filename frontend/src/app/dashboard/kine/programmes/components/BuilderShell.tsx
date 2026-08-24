'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  clearDraft,
  draftKey,
  readDraft,
  writeDraft,
  type BuilderDraft,
  type BuilderDraftExercice,
  type BuilderKind,
  type BuilderMode,
} from '@/hooks/useBuilderDraft';
import { BuilderExerciceRow } from './BuilderExerciceRow';

export interface BuilderAsideContext {
  draft: BuilderDraft;
  saving: boolean;
  /**
   * Exécute l'enregistrement : gère l'état « en cours » et affiche l'erreur.
   *
   * Le callback renvoie `true` s'il a réellement enregistré — c'est la seule
   * condition qui purge le brouillon. Un refus métier (quota de plan atteint,
   * par exemple) renvoie `false` : il n'est pas une exception, mais le travail
   * du kiné doit être conservé pour qu'il puisse réessayer.
   */
  runSave: (fn: () => Promise<boolean>) => void;
}

interface BuilderShellProps {
  kind: BuilderKind;
  mode: BuilderMode;
  targetId?: number;
  heading: string;
  /** Retour du fil d'ariane (bouton flèche). */
  backHref: string;
  /** Brouillon initial quand la session n'en contient pas. */
  loadInitialDraft: () => Promise<BuilderDraft>;
  /** Bloc d'informations propre à l'objet (patient/dates, ou nom/description). */
  renderInfos: (draft: BuilderDraft, patch: (values: Partial<BuilderDraft>) => void) => React.ReactNode;
  /** Récapitulatif et actions, propres à l'objet. */
  renderAside: (ctx: BuilderAsideContext) => React.ReactNode;
}

/**
 * Tout ce que programme et template ont en commun : chargement et persistance du
 * brouillon, liste d'exercices réordonnable, aller-retour vers la bibliothèque,
 * mise en page à deux colonnes. Ce qui diffère est injecté par les deux pages.
 */
export function BuilderShell({
  kind,
  mode,
  targetId,
  heading,
  backHref,
  loadInitialDraft,
  renderInfos,
  renderAside,
}: BuilderShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const key = draftKey(kind, mode, targetId);

  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // --- Chargement initial : brouillon en session, sinon source injectée ---
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const existing = readDraft(key);
      if (existing) {
        if (!cancelled) {
          setDraft(existing);
          // `fresh=1` signale qu'on arrive d'une sélection : le brouillon vient
          // d'être écrit, ce n'est pas une reprise.
          setRestored(searchParams.get('fresh') !== '1');
          setLoading(false);
        }
        return;
      }

      try {
        const initial = await loadInitialDraft();
        if (!cancelled) setDraft(initial);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistance à chaque modification.
  useEffect(() => {
    if (draft) writeDraft(key, draft);
  }, [draft, key]);

  const patch = (values: Partial<BuilderDraft>) =>
    setDraft((prev) => (prev ? ({ ...prev, ...values } as BuilderDraft) : prev));

  const patchExercice = (index: number, values: Partial<BuilderDraftExercice>) =>
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            exercices: prev.exercices.map((ex, i) => (i === index ? { ...ex, ...values } : ex)),
          }
        : prev,
    );

  const removeExercice = (index: number) =>
    setDraft((prev) =>
      prev ? { ...prev, exercices: prev.exercices.filter((_, i) => i !== index) } : prev,
    );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const from = prev.exercices.findIndex((ex) => ex.exerciceId === active.id);
      const to = prev.exercices.findIndex((ex) => ex.exerciceId === over.id);
      if (from === -1 || to === -1) return prev;
      return { ...prev, exercices: arrayMove(prev.exercices, from, to) };
    });
  };

  const goToLibrary = () => {
    const params = new URLSearchParams({ tab: 'exercices', select: '1' });
    if (kind === 'template') params.set('kind', 'template');
    params.set('draft', mode === 'edit' ? `edit:${targetId}` : 'create');
    router.push(`/dashboard/kine/programmes?${params.toString()}`);
  };

  const resetDraft = () => {
    clearDraft(key);
    window.location.reload();
  };

  const runSave = (fn: () => Promise<boolean>) => {
    setSaving(true);
    void fn()
      // Purge uniquement si l'enregistrement a bien eu lieu : sinon le kiné
      // perdrait tout le programme qu'il vient de monter.
      .then((saved) => {
        if (saved) clearDraft(key);
      })
      .catch((error) => {
        console.error('Erreur enregistrement :', error);
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: "L'enregistrement a échoué.",
        });
      })
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">{loadError ?? 'Introuvable.'}</p>
        <Button variant="outline" onClick={() => router.push(backHref)}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-28 lg:pb-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(backHref)} aria-label="Retour">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl md:text-2xl font-bold text-[#3899aa]">{heading}</h1>
      </div>

      {restored && (
        <Card className="border-[#3899aa]/40 bg-[#3899aa]/5">
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">Brouillon repris là où tu l&apos;avais laissé.</span>
            <Button variant="ghost" size="sm" onClick={resetDraft}>
              Repartir de zéro
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {renderInfos(draft, patch)}

          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Exercices · {draft.exercices.length}
            </h2>

            {draft.exercices.length === 0 ? (
              <Card>
                <CardContent className="text-center py-10">
                  <p className="text-muted-foreground mb-4">Aucun exercice pour l&apos;instant.</p>
                  <Button className="btn-teal" onClick={goToLibrary}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter des exercices
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={draft.exercices.map((ex) => ex.exerciceId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {draft.exercices.map((ex, index) => (
                      <BuilderExerciceRow
                        key={ex.exerciceId}
                        exercice={ex}
                        index={index}
                        onChange={patchExercice}
                        onRemove={removeExercice}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {draft.exercices.length > 0 && (
              <Button variant="outline" className="w-full" onClick={goToLibrary}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter des exercices
              </Button>
            )}
          </div>
        </div>

        {renderAside({ draft, saving, runSave })}
      </div>
    </div>
  );
}
