'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { SearchX } from 'lucide-react'; // Using SearchX for not found
import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-primary">
            <SearchX size={28} className="text-destructive" /> Erreur 404
          </CardTitle>
          <CardDescription>Page Non Trouvée</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Oups ! La page que vous recherchez semble introuvable. Elle a peut-être été déplacée ou supprimée.
          </p>
          <Button asChild>
            <Link href="/">Retour à l'accueil</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
