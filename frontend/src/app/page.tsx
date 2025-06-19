'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirection automatique vers /login après 2 secondes
    const timer = setTimeout(() => {
      router.push('/login');
    }, 2000);

    // Nettoyage du timer si le composant est démonté
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background p-4 text-center">
      <div className="space-y-6 max-w-2xl">
        {/* Logo */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mx-auto text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10h-1.1"/>
          <path d="M18 18.5V13a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v5.5"/>
          <path d="M14 13.5V12a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1.5"/>
          <path d="M12 12v10"/>
          <path d="m8 16 1.5-1 1.5 1"/>
          <path d="m13 16 1.5-1 1.5 1"/>
          <path d="M9 8h6"/>
          <path d="M9 6h6"/>
        </svg>
        
        {/* Titre */}
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-primary">
          Bienvenue sur Mon Assistant Kiné
        </h1>
        
        {/* Description */}
        <p className="text-lg md:text-xl text-muted-foreground">
          Votre partenaire IA pour la rééducation kinésithérapique. Programmes d'exercices personnalisés et support dédié.
        </p>

        {/* Indicateur de redirection */}
        <div className="mt-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Redirection en cours...</p>
        </div>
      </div>
      
      <footer className="absolute bottom-4 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Mon Assistant Kiné. Tous droits réservés.
      </footer>
    </div>
  );
}