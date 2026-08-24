'use client';
export const dynamic = 'force-dynamic';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { usePaywall } from '@/hooks/usePaywall';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import type { ExerciceModele, ExerciceTemplate } from '@/types/exercice';
import { useProgrammesList } from '@/hooks/useProgrammesList';
import {
  DEFAULT_DUREE,
  draftKey,
  flattenSelection,
  readDraft,
  todayIso,
  writeDraft,
  type BuilderDraft,
  type BuilderKind,
} from '@/hooks/useBuilderDraft';
import { QuickActions } from './components/QuickActions';
import { ExercicesTab } from './components/ExercicesTab';
import { TemplatesTab } from './components/TemplatesTab';
import { ProgrammesTab } from './components/ProgrammesTab';
import { SelectionActionBar } from './components/SelectionActionBar';
import { ProgrammeQuotaGate } from './components/ProgrammeQuotaGate';

const TABS = ['exercices', 'templates', 'programmes'] as const;
type TabKey = (typeof TABS)[number];

const SEARCH_PLACEHOLDERS: Record<TabKey, string> = {
  exercices: 'Rechercher un exercice…',
  templates: 'Rechercher un template…',
  programmes: 'Rechercher un programme ou un patient…',
};

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TABS as readonly string[]).includes(value);
}

/** `create` ou `edit:12` — indique qu'on complète un brouillon existant. */
function parseDraftParam(value: string | null): { mode: 'create' | 'edit'; id?: number } | null {
  if (!value) return null;
  if (value === 'create') return { mode: 'create' };
  const match = /^edit:(\d+)$/.exec(value);
  return match ? { mode: 'edit', id: Number(match[1]) } : null;
}

export default function ProgrammesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccessFeature, subscription, isLoading: paywallLoading } = usePaywall();

  const [tab, setTab] = useState<TabKey>('exercices');
  // Recherche partagee par les onglets Exercices et Templates, saisie dans l'en-tete.
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [createExerciceSignal, setCreateExerciceSignal] = useState(0);

  // --- Mode sélection ---
  const [selectMode, setSelectMode] = useState(false);
  const [selectedExercices, setSelectedExercices] = useState<ExerciceModele[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<ExerciceTemplate[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState<{ mode: 'create' | 'edit'; id?: number } | null>(
    null,
  );
  // Ce que la sélection en cours alimente : un programme, ou un template.
  const [selectKind, setSelectKind] = useState<BuilderKind>('programme');

  // --- Paywall ---
  const [gateOpen, setGateOpen] = useState(false);

  const programmesList = useProgrammesList({ enabled: tab === 'programmes' });

  // Lecture de l'URL au montage : onglet, mode sélection, patient, brouillon cible.
  useEffect(() => {
    const requested = searchParams.get('tab');
    const wantsSelect = searchParams.get('select') === '1' || searchParams.get('new') === '1';

    setTab(wantsSelect ? 'exercices' : isTabKey(requested) ? requested : 'exercices');
    setSelectMode(wantsSelect);
    setDraftTarget(parseDraftParam(searchParams.get('draft')));
    setSelectKind(searchParams.get('kind') === 'template' ? 'template' : 'programme');

    const rawPatientId = searchParams.get('patientId');
    if (rawPatientId) setPatientId(Number(rawPatientId));

    if (searchParams.get('new') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      params.set('tab', 'exercices');
      params.set('select', '1');
      router.replace(`/dashboard/kine/programmes?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nom du patient pré-sélectionné, pour l'afficher dans la barre de sélection.
  useEffect(() => {
    if (!patientId || patientName) return;
    const loadPatient = async () => {
      try {
        const profileRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
        if (!profileRes.ok) return;
        const kine = await profileRes.json();
        const res = await fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL}/patients/kine/${kine.id}`,
        );
        if (!res.ok) return;
        const patients: Array<{ id: number; firstName: string; lastName: string }> =
          await res.json();
        const found = patients.find((p) => p.id === patientId);
        if (found) setPatientName(`${found.firstName} ${found.lastName}`);
      } catch (err) {
        console.error('Erreur chargement patient:', err);
      }
    };
    void loadPatient();
  }, [patientId, patientName]);

  const updateUrl = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(`/dashboard/kine/programmes${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleTabChange = (value: string) => {
    if (!isTabKey(value)) return;
    setTab(value);
    updateUrl((params) => params.set('tab', value));
  };

  const enterSelection = (kind: BuilderKind) => {
    // On ne bascule d'onglet que si celui en cours devient indisponible pendant
    // la sélection : Programmes dans tous les cas, et Templates quand c'est un
    // template qu'on construit (un template ne contient pas de templates).
    // Sinon on reste où le kiné se trouve — s'il est sur Templates pour un
    // programme, c'est justement qu'il compte y piocher.
    const mustLeaveTab = tab === 'programmes' || (kind === 'template' && tab === 'templates');
    const nextTab: TabKey = mustLeaveTab ? 'exercices' : tab;

    setSelectKind(kind);
    setSelectMode(true);
    setTab(nextTab);
    updateUrl((params) => {
      params.set('tab', nextTab);
      params.set('select', '1');
      if (kind === 'template') params.set('kind', 'template');
      else params.delete('kind');
    });
  };

  /** Entrée en mode sélection pour un programme, précédée du contrôle de quota. */
  const handleCreateProgramme = () => {
    // Tant que l'abonnement n'est pas chargé, canAccessFeature renvoie false :
    // on laisse entrer, l'effet ci-dessous fera sortir si l'accès est refusé.
    if (!paywallLoading && !canAccessFeature('CREATE_PROGRAMME')) {
      setGateOpen(true);
      return;
    }
    enterSelection('programme');
  };

  /** Un template n'est soumis à aucun quota : pas de contrôle d'accès ici. */
  const handleCreateTemplate = () => enterSelection('template');

  const exitSelection = () => {
    setSelectMode(false);
    setSelectedExercices([]);
    setSelectedTemplates([]);
    setDraftTarget(null);
    setSelectKind('programme');
    setPatientId(null);
    setPatientName(null);
    updateUrl((params) => {
      params.delete('select');
      params.delete('draft');
      params.delete('kind');
      params.delete('patientId');
    });
  };

  // Garde-fou : le mode sélection peut aussi être atteint par `?select=1` ou par
  // `?new=1` depuis l'accueil, sans passer par handleCreateProgramme. On revérifie
  // le quota dès que l'abonnement est connu — mais seulement pour un programme,
  // la création de template n'étant limitée par aucun plan.
  useEffect(() => {
    if (!selectMode || paywallLoading || selectKind !== 'programme') return;
    if (!canAccessFeature('CREATE_PROGRAMME')) {
      exitSelection();
      setGateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, paywallLoading, selectKind]);

  const toggleExercice = (exercice: ExerciceModele) =>
    setSelectedExercices((prev) =>
      prev.some((ex) => ex.id === exercice.id)
        ? prev.filter((ex) => ex.id !== exercice.id)
        : [...prev, exercice],
    );

  const toggleTemplate = (template: ExerciceTemplate) =>
    setSelectedTemplates((prev) =>
      prev.some((tpl) => tpl.id === template.id)
        ? prev.filter((tpl) => tpl.id !== template.id)
        : [...prev, template],
    );

  // Exercices déjà couverts : soit par un template coché, soit déjà présents
  // dans le brouillon qu'on est en train de compléter. Dans les deux cas ils
  // sont signalés « déjà ajouté » et non cochables : aucun doublon possible.
  const coveredByTemplateIds = useMemo(() => {
    const ids = new Set<number>();
    for (const template of selectedTemplates) {
      for (const item of template.items) ids.add(item.exerciceModele.id);
    }
    if (draftTarget) {
      const existing = readDraft(draftKey(selectKind, draftTarget.mode, draftTarget.id));
      for (const ex of existing?.exercices ?? []) ids.add(ex.exerciceId);
    }
    return [...ids];
  }, [selectedTemplates, draftTarget, selectKind]);

  /** Route du builder correspondant à la cible de la sélection. */
  const builderHref = (mode: 'create' | 'edit', id?: number, fresh = true) => {
    const base =
      selectKind === 'template'
        ? mode === 'edit'
          ? `/dashboard/kine/programmes/templates/${id}/edition`
          : '/dashboard/kine/programmes/templates/nouveau'
        : mode === 'edit'
          ? `/dashboard/kine/programmes/${id}/edition`
          : '/dashboard/kine/programmes/nouveau';
    return fresh ? `${base}?fresh=1` : base;
  };

  /** Construit ou complète le brouillon, puis ouvre le builder. */
  const handleContinue = () => {
    const newLines = flattenSelection(selectedExercices, selectedTemplates);

    if (draftTarget) {
      const key = draftKey(selectKind, draftTarget.mode, draftTarget.id);
      const existing = readDraft(key);
      if (existing) {
        const known = new Set(existing.exercices.map((ex) => ex.exerciceId));
        writeDraft(key, {
          ...existing,
          exercices: [...existing.exercices, ...newLines.filter((ex) => !known.has(ex.exerciceId))],
        });
        router.push(builderHref(draftTarget.mode, draftTarget.id));
        return;
      }

      // Brouillon d'édition introuvable (session vidée entre-temps) : on revient
      // sur la page d'édition, qui rechargera l'objet depuis l'API. Mieux vaut
      // perdre la sélection que basculer silencieusement en création.
      if (draftTarget.mode === 'edit') {
        router.push(builderHref('edit', draftTarget.id, false));
        return;
      }
    }

    const draft: BuilderDraft =
      selectKind === 'template'
        ? {
            kind: 'template',
            mode: 'create',
            nom: '',
            description: '',
            exercices: newLines,
          }
        : {
            kind: 'programme',
            mode: 'create',
            patientId,
            patientName,
            nom: '',
            description: '',
            dateDebut: todayIso(),
            duree: DEFAULT_DUREE,
            exercices: newLines,
          };

    writeDraft(draftKey(selectKind, 'create'), draft);
    router.push(builderHref('create'));
  };

  return (
    <>
      <AuthGuard role="kine" />
      <div className={`space-y-4 sm:space-y-6 overflow-x-hidden ${selectMode ? 'pb-28' : ''}`}>
        <Tabs value={tab} onValueChange={handleTabChange}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <TabsList className="h-auto w-full sm:w-auto gap-1 rounded-xl bg-muted/60 p-1.5">
              {TABS.map((key) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  disabled={
                    (key === 'programmes' && selectMode) ||
                    (key === 'templates' && selectMode && selectKind === 'template')
                  }
                  className="flex-1 sm:flex-none rounded-lg px-4 sm:px-6 py-2.5 text-sm sm:text-base font-semibold capitalize data-[state=active]:bg-[#3899aa] data-[state=active]:text-white data-[state=active]:shadow-sm"
                >
                  {key}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                className="pl-10"
                placeholder={SEARCH_PLACEHOLDERS[tab]}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* La propriété privé/public n'a de sens que pour la bibliothèque. */}
            {tab !== 'programmes' && (
              <div className="flex items-center gap-2">
                <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
                <Label htmlFor="only-mine" className="text-sm cursor-pointer whitespace-nowrap">
                  {tab === 'templates' ? 'Ne voir que mes templates' : 'Ne voir que mes exercices'}
                </Label>
              </div>
            )}
          </div>

          {selectMode && (
            <p className="mt-4 text-sm text-muted-foreground">
              {selectKind === 'template'
                ? 'Coche les exercices à mettre dans le template.'
                : 'Coche les exercices et les templates à mettre dans le programme.'}
            </p>
          )}

          {/* Les actions rapides disparaissent en mode sélection : la seule
              action possible est alors celle de la barre contextuelle. */}
          {!selectMode && (
            <div className="mt-6">
              <QuickActions
                tab={tab}
                onCreateExercice={() => {
                  // handleTabChange et non setTab : sinon l'URL resterait sur
                  // l'onglet précédent, et un rafraîchissement y renverrait.
                  if (tab !== 'exercices') handleTabChange('exercices');
                  setCreateExerciceSignal((n) => n + 1);
                }}
                onCreateTemplate={handleCreateTemplate}
                onCreateProgramme={handleCreateProgramme}
              />
            </div>
          )}

          {/* Deux mécanismes complémentaires :
              - `forceMount` garde les trois onglets montés (sans lui, Radix
                démonte l'inactif et les listes déjà chargées seraient perdues) ;
              - mais `forceMount` met aussi `hidden` à false, donc les trois
                panneaux s'afficheraient à la suite : c'est
                `data-[state=inactive]:hidden` qui masque les inactifs.
              Le chargement, lui, reste piloté par `enabled`. */}
          <TabsContent value="exercices" className="mt-6 data-[state=inactive]:hidden" forceMount>
            <ExercicesTab
              enabled={tab === 'exercices'}
              search={search}
              onlyMine={onlyMine}
              createSignal={createExerciceSignal}
              selectable={selectMode}
              selectedIds={selectedExercices.map((ex) => ex.id)}
              onToggleSelect={toggleExercice}
              coveredByTemplateIds={coveredByTemplateIds}
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-6 data-[state=inactive]:hidden" forceMount>
            <TemplatesTab
              enabled={tab === 'templates'}
              search={search}
              onlyMine={onlyMine}
              selectable={selectMode && selectKind === 'programme'}
              selectedIds={selectedTemplates.map((tpl) => tpl.id)}
              onToggleSelect={toggleTemplate}
            />
          </TabsContent>

          <TabsContent value="programmes" className="mt-6 data-[state=inactive]:hidden" forceMount>
            <ProgrammesTab
              programmes={programmesList.programmes}
              search={search}
              isLoading={programmesList.isLoading}
              error={programmesList.error}
              onReload={() => void programmesList.reload()}
              onCreateProgramme={handleCreateProgramme}
            />
          </TabsContent>
        </Tabs>
      </div>

      {selectMode && (
        <SelectionActionBar
          exercicesCount={selectedExercices.length}
          templatesCount={selectedTemplates.length}
          patientName={patientName}
          onClearPatient={() => {
            setPatientId(null);
            setPatientName(null);
            updateUrl((params) => params.delete('patientId'));
          }}
          onCancel={exitSelection}
          onContinue={handleContinue}
        />
      )}

      <ProgrammeQuotaGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        subscription={subscription}
      />
    </>
  );
}
