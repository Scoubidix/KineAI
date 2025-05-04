
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Library } from 'lucide-react'; // Icon for library/blog

export default function KineBlogPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <Library className="text-accent" /> Blog Pro & Veille Scientifique (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Accédez bientôt ici à des résumés d'articles scientifiques pertinents, des actualités métier et des ressources pour votre pratique professionnelle.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
