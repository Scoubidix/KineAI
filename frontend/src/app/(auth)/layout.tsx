// app/(auth)/layout.tsx
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-background text-foreground">
      {/* Partie gauche : visuel + logo */}
      <div className="hidden md:flex flex-col items-center justify-center bg-primary text-white p-10">
        <div className="mb-6 text-center">
          <Image
            src="/logo-white.svg" // à adapter selon ton logo réel
            alt="KineAI Logo"
            width={100}
            height={100}
          />
          <h1 className="text-3xl font-bold mt-4">Bienvenue sur KineAI</h1>
          <p className="mt-2 text-md opacity-80">
            Votre assistant intelligent pour la rééducation.
          </p>
        </div>
        <Image
          src="/images/illustration-kine.svg" // à adapter
          alt="Illustration kiné"
          width={300}
          height={300}
          className="mt-auto"
        />
      </div>

      {/* Partie droite : contenu (formulaire login/signup) */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <Link href="/" className="block text-sm text-muted-foreground hover:underline">
            ← Retour à l'accueil
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
