
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Newspaper } from 'lucide-react';

export default function PatientArticlesPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <Newspaper className="text-accent" /> Articles Santé & Bien-être (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Découvrez bientôt ici des articles clairs et accessibles sur la santé, la rééducation, la prévention des blessures et le bien-être, rédigés ou validés par des professionnels.
            </p>
             {/* Placeholder for future article listing */}
             <div className="mt-6 p-6 border rounded-md bg-muted/50">
                 <p className="text-muted-foreground italic">Liste des articles bientôt disponible ici.</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
