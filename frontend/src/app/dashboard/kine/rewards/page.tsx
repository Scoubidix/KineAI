
'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Gift } from 'lucide-react';

export default function KineRewardsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center card-hover">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-[#3899aa]">
              <Gift className="text-[#3899aa]" /> Mes Récompenses (Bientôt)
            </CardTitle>
            <CardDescription className="text-foreground">Fonctionnalité bientôt disponible.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              Gagnez bientôt ici des récompenses et des avantages exclusifs en participant activement à la plateforme Mon Assistant Kiné : ajoutez des exercices, partagez des programmes, publiez des articles, et plus encore !
            </p>
             {/* Placeholder for future rewards display */}
             <div className="mt-6 p-6 border rounded-md bg-muted/50">
                 <p className="text-foreground italic">Vos récompenses et badges apparaîtront bientôt ici.</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
