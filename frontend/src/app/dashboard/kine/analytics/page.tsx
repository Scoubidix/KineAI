'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { BarChart2 } from 'lucide-react';

export default function KineAnalyticsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <BarChart2 className="text-accent" /> Statistiques Patients
            </CardTitle>
            <CardDescription>Analyse des données de feedback et d'adhésion.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Analysez ici les tendances des feedbacks patients, l'adhésion aux programmes et d'autres métriques clés.
            </p>
             {/* TODO: Implement actual charts and data display here */}
             <div className="mt-6 p-6 border rounded-md bg-muted/50">
                 <p className="text-muted-foreground italic">Graphiques et analyses bientôt disponibles ici.</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
