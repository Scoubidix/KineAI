
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

export default function KineRevenuePage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <DollarSign className="text-accent" /> Revenus / Affiliation (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Gérez bientôt ici vos invitations de patients, votre programme d'affiliation et suivez vos revenus récurrents.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
