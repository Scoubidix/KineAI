'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dumbbell, Trash2, Pencil, Plus, Loader2, Eye, Lock, Globe, Search, Filter, X, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// Tags suggérés avec ordre de priorité
const SUGGESTED_TAGS = [
  'Mobilité articulaire',
  'Renforcement musculaire', 
  'Étirements',
  'Proprioception',
  'Cardio-respiratoire',
  'Membre supérieur',
  'Membre inférieur',
  'Rachis'
];

interface ExerciceModele {
  id: number;
  nom: string;
  description: string;
  tags?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function KineCreateExercisePage() {
  const [exercices, setExercices] = useState<ExerciceModele[]>([]);
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [showPublic, setShowPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exerciceToDelete, setExerciceToDelete] = useState<ExerciceModele | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState({ 
    id: null as number | null, 
    nom: '', 
    description: '',
    tags: [] as string[]
  });

  // Charger tous les tags disponibles
  const loadAllTags = async () => {
    try {
      const res = await fetchWithAuth(`${apiUrl}/exercices/tags`);
      const tags = await res.json();
      setAllAvailableTags(tags);
    } catch (error) {
      console.error('Erreur chargement tags:', error);
    }
  };

  const loadExercices = async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      if (search) searchParams.append('search', search);
      if (selectedTags.length > 0) searchParams.append('tags', selectedTags.join(','));
      
      const url = `${apiUrl}/exercices/${showPublic ? 'public' : 'private'}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
      const res = await fetchWithAuth(url);
      const data = await res.json();
      setExercices(data);
    } catch (error) {
      console.error('Erreur chargement exercices:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllTags();
  }, []);

  useEffect(() => {
    loadExercices();
  }, [showPublic, search, selectedTags]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  const clearAllFilters = () => {
    setSelectedTags([]);
    setSearch('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleTagToggle = (tag: string) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) 
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const handleSubmit = async () => {
    try {
      const endpoint = form.id
        ? `${apiUrl}/exercices/${form.id}`
        : `${apiUrl}/exercices`;
      const method = form.id ? 'PUT' : 'POST';

      const res = await fetchWithAuth(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nom: form.nom,
          description: form.description,
          tags: form.tags.length > 0 ? form.tags.join(', ') : null,
          isPublic: false,
        }),
      });

      if (res.ok) {
        setForm({ id: null, nom: '', description: '', tags: [] });
        setDialogOpen(false);
        loadExercices();
        loadAllTags();
      }
    } catch (error) {
      console.error('Erreur sauvegarde exercice:', error);
    }
  };

  const handleDelete = async () => {
    if (!exerciceToDelete) return;
    try {
      const res = await fetchWithAuth(`${apiUrl}/exercices/${exerciceToDelete.id}`, {
        method: 'DELETE',
      });

      if (res.status === 204) {
        // Suppression réussie
        setDeleteDialogOpen(false);
        setExerciceToDelete(null);
        loadExercices();
        loadAllTags();
      } else if (res.status === 400) {
        // Exercice utilisé dans des programmes
        alert("Votre exercice est utilisé dans un programme, impossible de supprimer");
        setDeleteDialogOpen(false);
        setExerciceToDelete(null);
      } else {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch (error) {
      console.error('Erreur suppression exercice:', error);
      alert("Erreur lors de la suppression de l'exercice");
      setDeleteDialogOpen(false);
      setExerciceToDelete(null);
    }
  };

  const handleEdit = (exercice: ExerciceModele) => {
    setForm({ 
      id: exercice.id, 
      nom: exercice.nom, 
      description: exercice.description,
      tags: exercice.tags ? exercice.tags.split(', ').map(tag => tag.trim()) : []
    });
    setDialogOpen(true);
  };

  const toggleCardExpansion = (exerciceId: number) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(exerciceId)) {
        newSet.delete(exerciceId);
      } else {
        newSet.add(exerciceId);
      }
      return newSet;
    });
  };

  // Fonction pour parser les tags depuis la string
  const parseTagsFromString = (tagsString?: string): string[] => {
    if (!tagsString) return [];
    return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  };

  // Grouper et trier les exercices par tags prioritaires
  const groupedExercices = React.useMemo(() => {
    const groups: { [key: string]: ExerciceModele[] } = {};
    
    // Initialiser les groupes avec les tags prioritaires
    SUGGESTED_TAGS.forEach(tag => {
      groups[tag] = [];
    });
    groups['Autres'] = [];
    groups['Sans tag'] = [];

    // Classifier les exercices
    exercices.forEach(ex => {
      const exerciceTags = parseTagsFromString(ex.tags);
      
      if (exerciceTags.length === 0) {
        groups['Sans tag'].push(ex);
        return;
      }

      let assigned = false;
      // Vérifier les tags prioritaires en premier
      for (const priorityTag of SUGGESTED_TAGS) {
        if (exerciceTags.some(tag => tag.toLowerCase() === priorityTag.toLowerCase())) {
          groups[priorityTag].push(ex);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        groups['Autres'].push(ex);
      }
    });

    // Trier alphabétiquement dans chaque groupe
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
    });

    // Supprimer les groupes vides
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    });

    return groups;
  }, [exercices]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Dumbbell className="text-accent" />
              {showPublic ? 'Exercices Publics' : 'Mes Exercices Privés'}
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input 
                  className="pl-10" 
                  placeholder="Rechercher un exercice..." 
                  value={search} 
                  onChange={handleSearchChange} 
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Filtres
                {selectedTags.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedTags.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPublic(!showPublic)}
              className="flex items-center gap-2"
            >
              {showPublic ? (
                <>
                  <Lock className="w-4 h-4" />
                  Mes exercices privés
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Exercices publics
                </>
              )}
            </Button>
            
            {!showPublic && (
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setForm({ id: null, nom: '', description: '', tags: [] });
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="h-4 w-4 mr-2" /> 
                    {form.id ? 'Modifier' : 'Créer'} un exercice
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto mx-4 sm:mx-auto">
                  <DialogHeader className="space-y-3 sticky top-0 bg-white dark:bg-gray-900 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <DialogTitle className="text-lg sm:text-xl font-semibold">
                      {form.id ? 'Modifier l\'exercice' : 'Créer un nouvel exercice'}
                    </DialogTitle>
                    <div className="h-px bg-gradient-to-r from-blue-500 to-purple-500"></div>
                  </DialogHeader>
                  
                  <div className="space-y-4 sm:space-y-6 py-4">
                    {/* Section Informations de l'exercice */}
                    <div className="space-y-3 sm:space-y-4">
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <div className="w-1 h-5 sm:h-6 bg-blue-500 rounded-full"></div>
                        Informations de l'exercice
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="nom" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                            Nom de l'exercice *
                          </Label>
                          <Input 
                            id="nom"
                            name="nom" 
                            value={form.nom} 
                            onChange={handleInputChange}
                            placeholder="Entrez le nom de l'exercice"
                            className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="description" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                            Description détaillée *
                          </Label>
                          <textarea
                            id="description"
                            name="description"
                            value={form.description}
                            onChange={handleInputChange}
                            placeholder="Décrivez l'exercice en détail : position de départ, mouvement, répétitions recommandées, points d'attention..."
                            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 transition-all duration-200 resize-none"
                            rows={6}
                            required
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Une description claire aide les patients à bien exécuter l'exercice
                          </p>
                        </div>

                        {/* Section Tags */}
                        <div className="space-y-2">
                          <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            Catégories (optionnel)
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            {SUGGESTED_TAGS.map(tag => (
                              <div key={tag} className="flex items-center space-x-2">
                                <Checkbox
                                  id={tag}
                                  checked={form.tags.includes(tag)}
                                  onCheckedChange={() => handleTagToggle(tag)}
                                />
                                <Label 
                                  htmlFor={tag} 
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {tag}
                                </Label>
                              </div>
                            ))}
                          </div>
                          {form.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {form.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Sélectionnez les catégories qui correspondent à cet exercice
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Section validation */}
                    <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button 
                          type="button"
                          variant="outline" 
                          onClick={() => {
                            setDialogOpen(false);
                          }}
                          className="flex-1 sm:flex-none text-sm sm:text-base"
                        >
                          Annuler
                        </Button>
                        <Button 
                          onClick={handleSubmit}
                          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg transition-all duration-200 text-sm sm:text-base"
                          disabled={!form.nom || !form.description}
                        >
                          {form.id ? 'Mettre à jour' : 'Créer l\'exercice'}
                        </Button>
                      </div>
                      
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        * Champs obligatoires
                      </p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Panneau de filtres */}
        {showFilters && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filtrer par catégories
                </h3>
                {selectedTags.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                    <X className="w-4 h-4 mr-1" />
                    Tout effacer
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...SUGGESTED_TAGS, ...allAvailableTags.filter(tag => !SUGGESTED_TAGS.includes(tag))].map(tag => (
                  <div key={tag} className="flex items-center space-x-2">
                    <Checkbox
                      id={`filter-${tag}`}
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={() => handleTagFilter(tag)}
                    />
                    <Label 
                      htmlFor={`filter-${tag}`} 
                      className="text-sm cursor-pointer"
                    >
                      {tag}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                  <span className="text-sm text-gray-600">Filtres actifs:</span>
                  {selectedTags.map(tag => (
                    <Badge key={tag} variant="default" className="cursor-pointer" onClick={() => handleTagFilter(tag)}>
                      {tag}
                      <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Exercices groupés par catégories */}
        {loading ? (
          <Card>
            <CardContent>
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin w-6 h-6 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.keys(groupedExercices).length === 0 ? (
              <Card>
                <CardContent>
                  <div className="text-center py-10">
                    <Dumbbell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {search || selectedTags.length > 0 ? 'Aucun exercice trouvé' : 'Aucun exercice disponible'}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      {search || selectedTags.length > 0
                        ? 'Essayez de modifier vos filtres ou votre recherche' 
                        : showPublic 
                          ? 'Aucun exercice public n\'est disponible pour le moment'
                          : 'Commencez par créer votre premier exercice'
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedExercices).map(([category, categoryExercices]) => (
                <div key={category}>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      {category}
                    </h3>
                    <Badge variant="outline">
                      {categoryExercices.length} exercice{categoryExercices.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryExercices.map((ex) => {
                      const isExpanded = expandedCards.has(ex.id);
                      const shouldTruncate = ex.description.length > 150;
                      const exerciceTags = parseTagsFromString(ex.tags);
                      
                      return (
                        <Card key={ex.id} className="relative hover:shadow-md transition-all duration-300">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-primary text-lg leading-tight">
                                  {ex.nom}
                                </CardTitle>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  {ex.isPublic ? (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                                      <Globe className="w-3 h-3 text-blue-600" />
                                      <span className="text-xs text-blue-700 dark:text-blue-300">Public</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                                      <Lock className="w-3 h-3 text-gray-600" />
                                      <span className="text-xs text-gray-700 dark:text-gray-300">Privé</span>
                                    </div>
                                  )}
                                  {exerciceTags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {!ex.isPublic && (
                                <div className="flex gap-1 ml-2">
                                  <Button size="icon" variant="ghost" onClick={() => handleEdit(ex)} className="h-8 w-8">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Dialog open={deleteDialogOpen && exerciceToDelete?.id === ex.id} onOpenChange={setDeleteDialogOpen}>
                                    <DialogTrigger asChild>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        onClick={() => { setDeleteDialogOpen(true); setExerciceToDelete(ex); }}
                                        className="h-8 w-8 hover:bg-red-100 hover:text-red-600"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Confirmer la suppression</DialogTitle>
                                      </DialogHeader>
                                      <p className="py-4">
                                        Êtes-vous sûr de vouloir supprimer l'exercice{' '}
                                        <strong>"{ex.nom}"</strong> ?
                                        Cette action est irréversible.
                                      </p>
                                      <div className="flex justify-end gap-4 mt-4">
                                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                                          Annuler
                                        </Button>
                                        <Button variant="destructive" onClick={handleDelete}>
                                          Oui, supprimer
                                        </Button>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </div>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line break-words">
                              {isExpanded || !shouldTruncate 
                                ? ex.description 
                                : `${ex.description.substring(0, 150)}...`
                              }
                            </p>
                            {shouldTruncate && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="mt-2 p-0 h-auto text-blue-600 hover:text-blue-800 transition-colors"
                                onClick={() => toggleCardExpansion(ex.id)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                {isExpanded ? 'Voir moins' : 'Voir plus'}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}