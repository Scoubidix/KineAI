'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
      <h1 className="text-3xl font-bold text-red-600 mb-2">Accès refusé</h1>
      <p className="text-muted-foreground max-w-md">
        Vous n'avez pas les permissions nécessaires pour accéder à cette page. Veuillez vous connecter avec un compte autorisé.
      </p>
      <Link href="/" passHref>
        <Button variant="outline" className="mt-6">
          Retour à l’accueil
        </Button>
      </Link>
    </div>
  );
}
