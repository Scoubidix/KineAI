
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dumbbell } from 'lucide-react';

export default function KineCreateExercisePage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <Dumbbell className="text-accent" /> Créer un Exercice (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Vous pourrez bientôt ajouter ici vos propres exercices personnalisés à la bibliothèque partagée, avec descriptions, images et vidéos.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
