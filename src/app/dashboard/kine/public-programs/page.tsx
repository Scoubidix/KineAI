
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Share2 } from 'lucide-react';

export default function KinePublicProgramsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <Share2 className="text-accent" /> Programmes Publics (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Créez et gérez bientôt ici des programmes d'exercices standards que vous pourrez partager ou vendre à un public plus large, en dehors de vos patients directs.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
