
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function PatientMedicalReportsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <FileText className="text-accent" /> Explication Rapports Médicaux (Bientôt)
            </CardTitle>
            <CardDescription>Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Importez bientôt ici vos comptes-rendus médicaux (imagerie, consultation...). Notre IA vous aidera à mieux comprendre les termes techniques et les conclusions, sans remplacer l'avis de votre médecin ou kiné.
            </p>
             {/* Placeholder for future report upload/analysis */}
             <div className="mt-6 p-6 border rounded-md bg-muted/50">
                 <p className="text-muted-foreground italic">Interface d'analyse de rapports bientôt disponible ici.</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
