// app/dashboard/kine/layout.tsx
'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function KineLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard role="kine">
      <div className="min-h-screen">
        {children}

        {/* Footer flottant */}
        <footer className="fixed bottom-0 right-0 left-0 md:left-[16rem] z-10 py-2 px-4 text-center bg-background/60 backdrop-blur-sm opacity-50 hover:opacity-100 transition-opacity duration-300">
          <div className="text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Mon Assistant Kiné</span>
            <span className="mx-2">•</span>
            <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer" className="hover:underline">CGU</a>
            <span className="mx-1">•</span>
            <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Politique de confidentialité</a>
            <span className="mx-1">•</span>
            <a href="/legal/mentions-legales.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Mentions légales</a>
          </div>
        </footer>
      </div>
    </AuthGuard>
  );
}
