'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dumbbell, Trash2, Pencil } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface ExerciceModele {
  id: number;
  nom: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function KineCreateExercisePage() {
  const [exercices, setExercices] = useState<ExerciceModele[]>([]);
  const [showPublic, setShowPublic] = useState(false);
  const [newExercice, setNewExercice] = useState({ nom: '', description: '' });
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadExercices = async () => {
    const res = await fetchWithAuth(`${apiUrl}/exercices/${showPublic ? 'public' : 'private'}`);
    const data = await res.json();
    setExercices(data);
  };

  useEffect(() => {
    loadExercices();
  }, [showPublic]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewExercice({ ...newExercice, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    const endpoint = editingId
      ? `${apiUrl}/exercices/${editingId}`
      : `${apiUrl}/exercices`;
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetchWithAuth(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...newExercice,
        isPublic: false,
      }),
    });

    if (res.ok) {
      setNewExercice({ nom: '', description: '' });
      setEditingId(null);
      loadExercices();
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetchWithAuth(`${apiUrl}/exercices/${id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setExercices(exercices.filter((e) => e.id !== id));
    }
  };

  const handleEdit = (exercice: ExerciceModele) => {
    setNewExercice({ nom: exercice.nom, description: exercice.description });
    setEditingId(exercice.id);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Dumbbell className="text-accent" />
            {showPublic ? 'Exercices Publics' : 'Mes Exercices Privés'}
          </h2>
          <Button
            variant="outline"
            onClick={() => setShowPublic(!showPublic)}
          >
            {showPublic ? 'Voir mes exercices privés' : 'Voir les exercices publics'}
          </Button>
        </div>

        {!showPublic && (
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? 'Modifier un exercice' : 'Créer un exercice privé'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Nom de l'exercice"
                name="nom"
                value={newExercice.nom}
                onChange={handleChange}
              />
              <Input
                placeholder="Description"
                name="description"
                value={newExercice.description}
                onChange={handleChange}
              />
              <Button onClick={handleSubmit}>
                {editingId ? 'Modifier' : 'Créer'}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exercices.map((ex) => (
            <Card key={ex.id} className="relative min-h-[140px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-primary">{ex.nom}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-line break-words">{ex.description}</p>
                {!ex.isPublic && (
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(ex)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => handleDelete(ex.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
