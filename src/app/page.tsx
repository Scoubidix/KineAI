
'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ShieldCheck, Stethoscope, ArrowRight, LogIn } from 'lucide-react'; // Added LogIn

export default function Home() {

  return (
      // Use a subtle gradient or solid soft background
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background p-4 text-center">
        <div className="space-y-6 max-w-2xl">
           {/* Logo using accent color */}
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
          {/* Heading using primary color or default foreground */}
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-primary">Bienvenue sur KineAI</h1>
          {/* Subheading using muted foreground for softer look */}
          <p className="text-lg md:text-xl text-muted-foreground">
            Votre partenaire IA pour la rééducation kinésithérapique. Programmes d'exercices personnalisés et support dédié.
          </p>

          {/* Login Button */}
          <div className="mt-8">
             <Button asChild size="lg" className="w-full sm:w-auto shadow-md hover:shadow-lg transition-shadow group">
                <Link href="/login">
                  <LogIn className="mr-2 h-5 w-5" /> Se Connecter / S'inscrire
                  <ArrowRight className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </Button>
           </div>


          {/* Section for Direct Dashboard Access (for development) */}
           <div className="mt-8 border-t border-border pt-8 space-y-4">
              <p className="text-base font-semibold text-foreground">Accès Direct (Développement)</p>
              <p className="text-sm text-muted-foreground">Utilisez ces boutons pour accéder directement aux tableaux de bord sans connexion.</p>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                 {/* Buttons using primary or accent color for emphasis */}
                 <Button asChild size="lg" className="w-full sm:w-auto bg-accent/80 hover:bg-accent/90 text-accent-foreground shadow-md hover:shadow-lg transition-shadow group">
                   <Link href="/dashboard/patient/home">
                     <ShieldCheck className="mr-2 h-5 w-5" /> Accès Patient (Dev)
                     <ArrowRight className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </Link>
                 </Button>
                 <Button asChild size="lg" className="w-full sm:w-auto bg-accent/80 hover:bg-accent/90 text-accent-foreground shadow-md hover:shadow-lg transition-shadow group">
                   <Link href="/dashboard/kine/home">
                     <Stethoscope className="mr-2 h-5 w-5" /> Accès Kiné (Dev)
                     <ArrowRight className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </Link>
                 </Button>
              </div>
           </div>
        </div>
         <footer className="absolute bottom-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} KineAI. Tous droits réservés.
          </footer>
      </div>
    );
}
