
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Briefcase } from 'lucide-react';

export default function KineJobsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center card-hover">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-[#3899aa]">
              <Briefcase className="text-[#3899aa]" /> Annonces Emploi & Remplacement (Bientôt)
            </CardTitle>
            <CardDescription className="text-foreground">Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              Consultez ou publiez bientôt ici des offres d'emploi, de remplacement ou de collaboration entre professionnels kinésithérapeutes.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
