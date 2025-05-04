'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Wand2 } from 'lucide-react'; // Use Wand2 icon for AI Assistant

export default function KineChatbotPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-primary">
              <Wand2 className="text-accent" /> Assistant IA Kiné
            </CardTitle>
            <CardDescription>Interaction avec l'IA pour la pratique professionnelle.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Posez vos questions à l'IA pour obtenir de l'aide sur la recherche métier, la génération de contenu (emails, descriptions d'exercices...) ou l'aide à la décision clinique.
            </p>
            {/* TODO: Implement the actual chat interface here */}
             <div className="mt-6 p-6 border rounded-md bg-muted/50">
                <p className="text-muted-foreground italic">Interface de chat bientôt disponible ici.</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
