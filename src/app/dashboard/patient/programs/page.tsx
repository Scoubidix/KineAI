
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShoppingBag } from 'lucide-react';

export default function PatientProgramsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <ShoppingBag className="text-accent" /> Programmes KineAI (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Accédez bientôt ici à une sélection de programmes d'exercices créés par des kinésithérapeutes experts, pour divers objectifs (prévention, performance, bien-être...).
            </p>
             {/* Placeholder for future program listing */}
             <div className="mt-6 p-6 border rounded-md bg-muted/50">
                 <p className="text-muted-foreground italic">Liste des programmes disponibles bientôt ici.</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
